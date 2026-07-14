/** @jsxImportSource @opentui/solid */
import { afterEach, expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ScrollBoxRenderable, TextAttributes, type Renderable } from "@opentui/core"
import { createSignal } from "solid-js"
import { DEFAULT_THEMES, resolveTheme } from "../../src/theme"

afterEach(() => mock.restore())

function findScrollBox(root: Renderable): ScrollBoxRenderable | undefined {
  if (root instanceof ScrollBoxRenderable) return root
  return root.getChildren().map(findScrollBox).find(Boolean)
}

test("visualizer graph content starts at the canvas padding inset", async () => {
  const theme = resolveTheme(DEFAULT_THEMES.opencode, "dark")
  mock.module("../../src/context/theme", () => ({
    useTheme: () => ({ theme }),
    selectedForeground: () => theme.background,
  }))

  const { Viewport, VisualizerCanvas } = await import("../../src/routes/spinosa/visualizer-viewport")
  const { TimelineView } = await import("../../src/routes/spinosa/visualizer-timeline")
  const loadedToolCalls = Array.from({ length: 26 }, (_, index) => ({
    id: `part-${index}`,
    tool: index % 2 === 0 ? "read" : "edit",
    status: "completed",
    input: { filePath: `notes-${index}.md` },
    timeStart: index + 1,
    timeEnd: index + 2,
    sessionTitle: "Session",
    part: {},
  }))
  const [toolCalls, setToolCalls] = createSignal<typeof loadedToolCalls>([])
  const [loading, setLoading] = createSignal(false)
  const [loadedOnce, setLoadedOnce] = createSignal(false)
  let opened = 0

  const app = await testRender(
    () => (
      <box width="100%" height="100%" alignItems="center">
        <box width={92} height="100%" flexDirection="column">
          <box flexGrow={1} flexDirection="column" alignItems="center">
            <box flexGrow={1} minHeight={0} />
            <box width="100%" flexDirection="column" flexShrink={0}>
              <text>canvas-marker</text>
              <VisualizerCanvas height={28}>
                <Viewport mode="timeline" toolCalls={toolCalls()} loading={loading()} loadedOnce={loadedOnce()} error={undefined}>
                  <TimelineView toolCalls={toolCalls()} theme={theme} dialog={{ replace() { opened++ } }} />
                </Viewport>
              </VisualizerCanvas>
              <box height={10} />
            </box>
            <box flexGrow={1} minHeight={0} />
          </box>
        </box>
      </box>
    ),
    { width: 213, height: 61 },
  )

  try {
    await app.renderOnce()
    setLoading(true)
    await app.renderOnce()
    setToolCalls(loadedToolCalls)
    setLoading(false)
    setLoadedOnce(true)
    await app.renderOnce()
    await app.renderOnce()
    const lines = app.captureCharFrame().split("\n")
    const canvasMarker = lines.findIndex((line) => line.includes("canvas-marker"))
    expect(lines.findIndex((line) => line.includes("Tool"))).toBe(canvasMarker + 2)
    const scrollbox = findScrollBox(app.renderer.root)
    expect(scrollbox?.stickyStart).toBe("top")
    expect(scrollbox?.verticalScrollBar.visible).toBe(true)
    expect(scrollbox?.horizontalScrollBar.visible).toBe(false)

    const firstRowY = lines.findIndex((line) => line.includes("notes-0.md"))
    const secondRowY = lines.findIndex((line) => line.includes("notes-1.md"))
    expect(secondRowY - firstRowY).toBe(2)
    const firstRowX = lines[firstRowY]!.indexOf("notes-0.md")
    await app.mockMouse.moveTo(firstRowX, firstRowY)
    await app.renderOnce()
    const inputSpan = app.captureSpans().lines[firstRowY]!.spans.find((span) => span.text.includes("notes-0.md"))
    expect((inputSpan?.attributes ?? 0) & TextAttributes.UNDERLINE).toBe(TextAttributes.UNDERLINE)
    await app.mockMouse.click(firstRowX, firstRowY)
    expect(opened).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})
