/** @jsxImportSource @opentui/solid */
import { expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createStore } from "solid-js/store"
import {
  deferPress,
  nextFocusedSourceIndexForAppend,
  shouldCancelSpinosaWorkOnCtrlC,
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

test("renders the dedicated add-files screen marker copy", async () => {
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
      activePath: "/tmp/workspace-spinosa",
      genericMode: false,
      refresh() {},
    }),
  }))
  mock.module("../../src/keymap", () => ({
    OPENCODE_BASE_MODE: "base",
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
    expect(frame).toContain("Add files to workspace")
    expect(frame).toContain("choose source folders")
    expect(frame).not.toContain("Create Spinosa workspace")
    expect(frame).not.toContain("checking document tools")
  } finally {
    app.renderer.destroy()
    mock.restore()
  }
})
