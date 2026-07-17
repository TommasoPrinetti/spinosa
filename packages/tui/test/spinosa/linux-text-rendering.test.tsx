/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { TextAttributes } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"

test("dynamic bold styling is removed when an item becomes inactive", async () => {
  const [active, setActive] = createSignal(true)
  const app = await testRender(
    () => (
      <text>
        <span style={{ bold: active() }}>workspace</span>
      </text>
    ),
    { width: 24, height: 2 },
  )

  try {
    await app.renderOnce()
    const before = app.captureSpans().lines[0]?.spans.find((span) => span.text.includes("workspace"))
    expect((before?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD)

    setActive(false)
    await app.renderOnce()
    const after = app.captureSpans().lines[0]?.spans.find((span) => span.text.includes("workspace"))
    expect((after?.attributes ?? 0) & TextAttributes.BOLD).toBe(0)
  } finally {
    app.renderer.destroy()
  }
})
