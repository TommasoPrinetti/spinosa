import { expect, mock, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect, Fiber } from "effect"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "../fixture/tui-sdk"

type SpinosaRoute = "workspace-picker" | "onboarding" | "add-files"
type TestRenderer = Awaited<ReturnType<typeof createTestRenderer>>

async function renderRouteFrame(
  route: SpinosaRoute,
  options: {
    home?: string
    act?: (setup: TestRenderer) => Promise<void> | void
  } = {},
) {
  const setup = await createTestRenderer({ width: 100, height: 30, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const previousRoute = process.env.OPENCODE_ROUTE
  const previousFastBoot = process.env.OPENCODE_FAST_BOOT
  const previousHome = process.env.HOME
  const previousTestHome = process.env.OPENCODE_TEST_HOME
  const previousSpinosaHome = process.env.SPINOSA_HOME
  process.env.OPENCODE_ROUTE = JSON.stringify({ type: route })
  process.env.OPENCODE_FAST_BOOT = "1"
  if (options.home) {
    process.env.HOME = options.home
    process.env.OPENCODE_TEST_HOME = options.home
    process.env.SPINOSA_HOME = path.join(options.home, ".spinosa")
  }

  const events = createEventSource()
  const provider = {
    id: "test",
    name: "Test Provider",
    models: {
      "test-model": {
        id: "test-model",
        name: "Test Model",
        cost: { input: 1, output: 1 },
      },
    },
  }
  const calls = createFetch((url) => {
    if (url.pathname === "/config/providers") return json({ providers: [provider], default: { test: "test-model" } })
    if (url.pathname === "/provider") return json({ all: [provider], default: { test: "test-model" }, connected: ["test"] })
  }, events)
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  try {
    const { run } = await import("../../src/app")
    const fiber = Effect.runFork(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start() {
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await setup.renderOnce()
    await setup.renderOnce()
    await options.act?.(setup)
    const frame = setup.captureCharFrame()
    await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.timeout("1 second"))).catch(() => undefined)
    setup.renderer.destroy()
    return frame
  } finally {
    if (previousRoute === undefined) delete process.env.OPENCODE_ROUTE
    else process.env.OPENCODE_ROUTE = previousRoute
    if (previousFastBoot === undefined) delete process.env.OPENCODE_FAST_BOOT
    else process.env.OPENCODE_FAST_BOOT = previousFastBoot
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousTestHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = previousTestHome
    if (previousSpinosaHome === undefined) delete process.env.SPINOSA_HOME
    else process.env.SPINOSA_HOME = previousSpinosaHome
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
}

async function createRegisteredWorkspace(input: {
  root: string
  home: string
  projectName: string
  setupStatus: "cli_started" | "workspace_started"
}) {
  const workspacePath = path.join(input.root, `${input.projectName}-spinosa`)
  mkdirSync(path.join(workspacePath, ".spinosa"), { recursive: true })
  mkdirSync(path.join(workspacePath, "raw"), { recursive: true })
  mkdirSync(path.join(workspacePath, "maps"), { recursive: true })
  mkdirSync(path.join(workspacePath, "logs"), { recursive: true })
  mkdirSync(path.join(workspacePath, "agent_reports"), { recursive: true })
  mkdirSync(path.join(workspacePath, "system"), { recursive: true })
  await Bun.write(
    path.join(workspacePath, ".spinosa", "workspace"),
    [
      `project_name: ${input.projectName}`,
      `setup_status: ${input.setupStatus}`,
      "framework_version: 0.1.0",
    ].join("\n"),
  )
  await Bun.write(path.join(workspacePath, "startup-prompt.md"), `Run startup for ${input.projectName}.`)

  const metadataDir = path.join(input.home, ".spinosa", "metadata")
  mkdirSync(metadataDir, { recursive: true })
  await Bun.write(path.join(metadataDir, "workspaces.txt"), `${workspacePath}|${input.projectName}|2026-07-09\n`)
  return workspacePath
}

async function waitForText(setup: TestRenderer, text: string) {
  let frame = ""
  for (let attempt = 0; attempt < 30; attempt++) {
    await setup.renderOnce()
    frame = setup.captureCharFrame()
    if (frame.includes(text)) return frame
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for "${text}"\nlastFrame:\n${frame}`)
}

test("Spinosa app route E2E boots and navigates key workspace flows", async () => {
  const frame = await renderRouteFrame("workspace-picker")
  expect(frame).toContain("Spinosa")
  expect(frame).toContain("workspace menu")
  expect(frame).toContain("New workspace")
  expect(frame).toContain("Select workspace")

  const onboardingFrame = await renderRouteFrame("onboarding")
  expect(onboardingFrame).toContain("Create Spinosa workspace")
  expect(onboardingFrame).toContain("Paste the folder path")
  expect(onboardingFrame).toContain("Paste the corpus folder path")

  const addFilesFrame = await renderRouteFrame("add-files")
  expect(addFilesFrame).toContain("Add files to workspace")
  expect(addFilesFrame).toContain("Source folders")
  expect(addFilesFrame).toContain("Folder path 1")

  const cliRoot = mkdtempSync(path.join(tmpdir(), "spinosa-app-e2e-"))
  const cliHome = path.join(cliRoot, "home")
  mkdirSync(cliHome, { recursive: true })
  try {
    await createRegisteredWorkspace({
      root: cliRoot,
      home: cliHome,
      projectName: "cli-started-demo",
      setupStatus: "cli_started",
    })

    const cliStartedFrame = await renderRouteFrame("workspace-picker", {
      home: cliHome,
      act: async (setup) => {
        setup.mockInput.pressKey("2")
        await waitForText(setup, "cli-started-demo")
        setup.mockInput.pressKey("1")
        await waitForText(setup, "Launch startup indexing")
      },
    })

    expect(cliStartedFrame).toContain("cli-started-demo")
    expect(cliStartedFrame).toContain("This workspace hasn't completed startup indexing")
    expect(cliStartedFrame).toContain("Launch startup indexing")
    expect(cliStartedFrame).toContain("Open chat directly")
  } finally {
    rmSync(cliRoot, { recursive: true, force: true })
  }

  const readyRoot = mkdtempSync(path.join(tmpdir(), "spinosa-app-e2e-"))
  const readyHome = path.join(readyRoot, "home")
  mkdirSync(readyHome, { recursive: true })
  try {
    await createRegisteredWorkspace({
      root: readyRoot,
      home: readyHome,
      projectName: "ready-demo",
      setupStatus: "workspace_started",
    })

    const readyFrame = await renderRouteFrame("workspace-picker", {
      home: readyHome,
      act: async (setup) => {
        setup.mockInput.pressKey("2")
        await waitForText(setup, "ready-demo")
        setup.mockInput.pressKey("1")
        await waitForText(setup, "workspace v0.1.0")
      },
    })

    expect(readyFrame).toContain("workspace v0.1.0")
    expect(readyFrame).toContain("Change workspace")
    expect(readyFrame).not.toContain("Launch startup indexing")
  } finally {
    rmSync(readyRoot, { recursive: true, force: true })
  }
}, 30_000)
