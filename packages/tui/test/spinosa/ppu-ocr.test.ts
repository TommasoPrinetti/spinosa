import { describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

describe("ppu ocr guards", () => {
  test("skips malformed png before native recognize", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "spinosa-ppu-ocr-"))
    const src = path.join(root, "bad.png")
    const dest = path.join(root, "bad.md")
    writeFileSync(src, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    let recognizeCalls = 0
    const logs: string[] = []

    try {
      mock.module("ppu-paddle-ocr", () => ({
        PaddleOcrService: class {
          async initialize() {}
          async destroy() {}
          async recognize() {
            recognizeCalls++
            return { text: "should not run", confidence: 1 }
          }
        },
      }))

      const { runPpuOcrBatch } = await import("../../src/spinosa-core/import/ppu-ocr")
      const result = await runPpuOcrBatch([{ src, rel: "bad.png", dest }], {
        onLog: (line) => logs.push(line),
      })

      expect(result).toEqual({ converted: 0, skipped: 1 })
      expect(recognizeCalls).toBe(0)
      expect(existsSync(dest)).toBe(false)
      expect(logs.some((line) => line.includes("invalid OCR image input: truncated png"))).toBe(true)

      const logsDir = path.join(root, "logs")
      mkdirSync(logsDir)
      const { processOcr } = await import("../../src/spinosa-core/import/pipeline")
      const phase = await processOcr([{ src, rel: "bad.png", dest }], logsDir)
      expect(phase.converted).toBe(0)
      expect(phase.skipped).toBe(0)
      expect(phase.failed).toBe(1)
    } finally {
      mock.restore()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
