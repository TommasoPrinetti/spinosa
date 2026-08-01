import { describe, expect, test } from "bun:test"
import { WAVE_SPINNER_FRAMES } from "../../src/component/wave-spinner"

describe("WaveSpinner", () => {
  test("uses the Spinosa six-cell wave animation", () => {
    expect(WAVE_SPINNER_FRAMES).toHaveLength(14)
    expect(WAVE_SPINNER_FRAMES[0]).toBe("▁▂▃▄▅▆")
    expect(WAVE_SPINNER_FRAMES[7]).toBe("▇▆▅▄▃▂")
    expect(WAVE_SPINNER_FRAMES.every((frame) => [...frame].length === 6)).toBe(true)
  })
})
