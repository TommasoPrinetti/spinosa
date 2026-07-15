import { expect, mock, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect, Fiber } from "effect"
import { mkdirSync, mkdtempSync, rmSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "../fixture/tui-sdk"

type SpinosaRoute = "workspace" | "global" | "onboarding" | "add-files" | "visualizer"
type TestRenderer = Awaited<ReturnType<typeof createTestRenderer>>

async function renderRouteFrame(
  route: SpinosaRoute,
  options: {
    home?: string
    initialRoute?: Record<string, unknown>
    height?: number
    act?: (setup: TestRenderer) => Promise<void> | void
  } = {},
) {
  const setup = await createTestRenderer({ width: 100, height: options.height ?? 30, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const previousRoute = process.env.OPENCODE_ROUTE
  const previousFastBoot = process.env.OPENCODE_FAST_BOOT
  const previousHome = process.env.HOME
  const previousTestHome = process.env.OPENCODE_TEST_HOME
  const previousSpinosaHome = process.env.SPINOSA_HOME
  process.env.OPENCODE_ROUTE = JSON.stringify(options.initialRoute ?? { type: route })
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

async function appendRegistryEntry(home: string, workspacePath: string, projectName: string) {
  const metadataDir = path.join(home, ".spinosa", "metadata")
  mkdirSync(metadataDir, { recursive: true })
  const registryPath = path.join(metadataDir, "workspaces.txt")
  const existing = await Bun.file(registryPath).text().catch(() => "")
  await Bun.write(
    registryPath,
    `${existing}${workspacePath}|${projectName}|2026-07-09\n`,
  )
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
  const frame = await renderRouteFrame("global")
  expect(frame).toContain("Spinosa")
  expect(frame).toContain("New workspace")
  expect(frame).toContain("Choose a workspace")

  const onboardingFrame = await renderRouteFrame("onboarding")
  expect(onboardingFrame).toContain("Create Spinosa workspace")
  expect(onboardingFrame).toContain("Paste the corpus folder path")

  const addFilesFrame = await renderRouteFrame("add-files")
  expect(addFilesFrame).toContain("Import files into workspace")
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

    const cliStartedFrame = await renderRouteFrame("global", {
      home: cliHome,
      act: async (setup) => {
        setup.mockInput.pressKey("w")
        await waitForText(setup, "cli-started-demo")
        setup.mockInput.pressEnter()
        await waitForText(setup, "Startup the workspace with prompt")
      },
    })

    expect(cliStartedFrame).toContain("cli-started-demo")
    expect(cliStartedFrame).toContain("Startup the workspace with prompt")
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

    const readyFrame = await renderRouteFrame("global", {
      home: readyHome,
      act: async (setup) => {
        setup.mockInput.pressKey("w")
        await waitForText(setup, "ready-demo")
        setup.mockInput.pressEnter()
        await waitForText(setup, "workspace v0.1.0")
      },
    })

    expect(readyFrame).toContain("workspace v0.1.0")
    expect(readyFrame).toContain("Switch workspace")
    expect(readyFrame).not.toContain("Open setup brief in Chat")
  } finally {
    rmSync(readyRoot, { recursive: true, force: true })
  }

  const filteredRoot = mkdtempSync(path.join(tmpdir(), "spinosa-app-e2e-"))
  const filteredHome = path.join(filteredRoot, "home")
  mkdirSync(filteredHome, { recursive: true })
  try {
    await createRegisteredWorkspace({
      root: filteredRoot,
      home: filteredHome,
      projectName: "visible-demo",
      setupStatus: "workspace_started",
    })
    await appendRegistryEntry(filteredHome, path.join(filteredRoot, "stale-demo-spinosa"), "stale-demo")

    const filteredFrame = await renderRouteFrame("global", {
      home: filteredHome,
      act: async (setup) => {
        setup.mockInput.pressKey("w")
        await waitForText(setup, "visible-demo")
      },
    })

    expect(filteredFrame).toContain("visible-demo")
    expect(filteredFrame).not.toContain("stale-demo")
  } finally {
    rmSync(filteredRoot, { recursive: true, force: true })
  }
}, 30_000)

test("homepage surfaces stale installer cleanup after it has rendered", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "spinosa-home-maintenance-"))
  const home = path.join(root, "home")
  const stale = path.join(home, ".spinosa", "versions", ".0.9.0.staging.999999")
  mkdirSync(path.join(stale, "node_modules"), { recursive: true })
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
  utimesSync(stale, old, old)
  try {
    const frame = await renderRouteFrame("workspace", {
      home,
      height: 50,
      act: async (setup) => { await waitForText(setup, "leftover install file") },
    })
    expect(frame).toContain("leftover install file")
    expect(frame).toContain("Clean up")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000)

test("Visualizer honors its workspace and session route parameters", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "spinosa-visualizer-route-"))
  const home = path.join(root, "home")
  mkdirSync(home, { recursive: true })
  try {
    const workspacePath = await createRegisteredWorkspace({
      root,
      home,
      projectName: "routed-demo",
      setupStatus: "workspace_started",
    })
    const frame = await renderRouteFrame("visualizer", {
      home,
      height: 50,
      initialRoute: { type: "visualizer", workspacePath, sessionID: "ses_routed" },
      act: async (setup) => { await waitForText(setup, "Workspace: routed-demo") },
    })
    expect(frame).toContain("Workspace: routed-demo")
    expect(frame).toContain("Session: ses_routed")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000)
