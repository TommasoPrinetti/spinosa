/** @jsxImportSource @opentui/solid */
import { expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createStore } from "solid-js/store"
import {
  createActiveWorkTracker,
  deferPress,
  nextFocusedSourceIndexForAppend,
  runGuardedBackNavigation,
  shouldCancelSpinosaWorkOnCtrlC,
  shouldConfirmSpinosaBack,
} from "../../src/routes/spinosa/wizard-ui"

test("deferPress runs action after the current tick", async () => {
  let ran = false
  deferPress(() => {
    ran = true
  })
  expect(ran).toBe(false)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(ran).toBe(true)
})

test("auto-added source rows do not steal focus from the active input", () => {
  expect(nextFocusedSourceIndexForAppend(0, 1, { focusNewInput: false })).toBe(0)
  expect(nextFocusedSourceIndexForAppend(2, 3, { focusNewInput: false })).toBe(2)
  expect(nextFocusedSourceIndexForAppend(0, 1)).toBe(1)
})

test("ctrl-c cancels Spinosa work only for active cancellable steps", () => {
  expect(shouldCancelSpinosaWorkOnCtrlC({
    step: "ocr",
    busy: true,
    waitingForGate: false,
    cancellableSteps: ["direct", "markitdown", "ocr"],
  })).toBe(true)

  expect(shouldCancelSpinosaWorkOnCtrlC({
    step: "ocr",
    busy: false,
    waitingForGate: true,
    cancellableSteps: ["direct", "markitdown", "ocr"],
  })).toBe(true)

  expect(shouldCancelSpinosaWorkOnCtrlC({
    step: "path",
    busy: false,
    waitingForGate: false,
    cancellableSteps: ["direct", "markitdown", "ocr"],
  })).toBe(false)
})

test("Back confirmation is limited to active cancellable work", () => {
  expect(shouldConfirmSpinosaBack({
    step: "markitdown",
    busy: true,
    waitingForGate: false,
    cancellableSteps: ["direct", "markitdown", "ocr"],
  })).toBe(true)
  expect(shouldConfirmSpinosaBack({
    step: "scan",
    busy: true,
    waitingForGate: false,
    cancellableSteps: ["direct", "markitdown", "ocr"],
  })).toBe(false)
})

test("guarded Back stays on cancel and waits for work before navigating", async () => {
  const stayedEvents: string[] = []
  expect(await runGuardedBackNavigation({
    shouldConfirm: true,
    confirm: async () => false,
    stop: () => stayedEvents.push("stop"),
    waitForStop: async () => { stayedEvents.push("wait") },
    navigate: () => stayedEvents.push("navigate"),
  })).toBe("stayed")
  expect(stayedEvents).toEqual([])

  const events: string[] = []
  let settle!: () => void
  const tracker = createActiveWorkTracker()
  void tracker.run(() => new Promise<void>((resolve) => { settle = resolve }))
  const navigation = runGuardedBackNavigation({
    shouldConfirm: true,
    confirm: async () => { events.push("confirm"); return true },
    stop: () => events.push("stop"),
    waitForStop: async () => { events.push("wait"); await tracker.wait() },
    navigate: () => events.push("navigate"),
  })

  await Promise.resolve()
  expect(events).toEqual(["confirm", "stop", "wait"])
  settle()
  expect(await navigation).toBe("navigated")
  expect(events).toEqual(["confirm", "stop", "wait", "navigate"])
})

test("scans and imports files from the dedicated add-files screen", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "spinosa-add-files-screen-"))
  const source = path.join(root, "source")
  const workspace = path.join(root, "workspace")
  mkdirSync(source)
  mkdirSync(workspace)
  writeFileSync(path.join(source, "notes.md"), "# Notes\n")
  const navigated: unknown[] = []
  const [routeStore, setRouteStore] = createStore<{ type: string }>({ type: "add-files" })

  mock.module("../../src/context/route", () => ({
    useRoute: () => ({
      get data() {
        return routeStore
      },
      navigate(input: unknown) {
        navigated.push(input)
      },
    }),
    useRouteData: (type: string) => {
      if (routeStore.type !== type) throw new Error(`expected ${type}, got ${routeStore.type}`)
      return routeStore
    },
  }))
  mock.module("../../src/context/spinosa-workspace", () => ({
    useSpinosaWorkspace: () => ({
      activePath: workspace,
      genericMode: false,
      refresh() {},
    }),
  }))
  mock.module("../../src/keymap", () => ({
    SPINOSA_BASE_MODE: "base",
    useOpencodeKeymap: () => ({
      intercept: () => () => {},
    }),
    useOpencodeModeStack: () => ({
      current: () => "base",
    }),
  }))
  mock.module("../../src/context/exit", () => ({
    useExit: () => () => {},
  }))
  mock.module("../../src/ui/toast", () => ({
    Toast: () => null,
    useToast: () => ({ error() {}, show() {} }),
  }))
  mock.module("../../src/ui/dialog", () => ({
    useDialog: () => ({ clear() {}, replace() {} }),
  }))
  mock.module("../../src/context/sdk", () => ({
    useSDK: () => ({
      directory: workspace,
      publishJobEvent: () => {},
      event: { emit() {} },
      client: {},
    }),
  }))
  mock.module("../../src/spinosa/onboarding-preview", () => ({
    detectDocumentTools: async () => ({ markitdown: true, ocr: true, pdfjs: true }),
    resolveUserPath: (value: string) => value.trim() || undefined,
    buildImportScanPreview: async (sourcePath: string) => ({
      projectName: path.basename(sourcePath),
      sourcePath,
      scanRows: [],
      importOptions: [{ ext: "md", count: 1, bytes: 8, selected: true }],
    }),
  }))
  const { DEFAULT_THEMES, resolveTheme } = await import("../../src/theme")
  const theme = resolveTheme(DEFAULT_THEMES.opencode, "dark")
  mock.module("../../src/context/theme", () => ({
    useTheme: () => ({ theme }),
  }))

  const { AddFiles } = await import("../../src/routes/spinosa/add-files")

  const app = await testRender(
    () => <AddFiles />,
    { width: 80, height: 24 },
  )

  try {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    expect(frame).toContain("Import files into workspace")
    expect(frame).toContain("choosing source folders")
    expect(frame).not.toContain("Create Spinosa workspace")
    expect(frame).not.toContain("checking document tools")

    await app.mockInput.typeText(source)
    await new Promise((resolve) => setTimeout(resolve, 450))
    const pathFrame = await app.waitForFrame((value) => value.includes("Continue"))
    const pathLines = pathFrame.split("\n")
    const continueY = pathLines.findIndex((line) => line.includes("Continue"))
    const continueX = pathLines[continueY]!.indexOf("Continue") + 1
    await app.mockMouse.click(continueX, continueY)

    await new Promise((resolve) => setTimeout(resolve, 150))
    await app.renderOnce()
    const toolsFrame = app.captureCharFrame()
    expect(toolsFrame).toContain("Scan source folders")
    const toolLines = toolsFrame.split("\n")
    const scanY = toolLines.findIndex((line) => line.includes("Scan source folders"))
    const scanX = toolLines[scanY]!.indexOf("Scan source folders") + 1
    await app.mockMouse.click(scanX, scanY)

    await new Promise((resolve) => setTimeout(resolve, 100))
    await app.renderOnce()
    const scanFrame = app.captureCharFrame()
    expect(scanFrame).toContain("Select file types to import")
    expect(scanFrame).toContain(".md")
    const scanLines = scanFrame.split("\n")
    const importY = scanLines.findIndex((line) => line.includes("Continue"))
    const importX = scanLines[importY]!.indexOf("Continue") + 1
    await app.mockMouse.click(importX, importY)

    await new Promise((resolve) => setTimeout(resolve, 1_200))
    await app.renderOnce()
    const doneFrame = app.captureCharFrame()
    expect(doneFrame).toContain("Files imported.")
    expect(existsSync(path.join(workspace, "raw", "notes.md"))).toBe(true)
  } finally {
    app.renderer.destroy()
    mock.restore()
    rmSync(root, { recursive: true, force: true })
  }
})
