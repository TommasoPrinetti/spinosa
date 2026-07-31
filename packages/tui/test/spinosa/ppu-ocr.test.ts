import { describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

describe("ppu ocr guards", () => {
  test("passes ArrayBuffer (not Uint8Array) to recognize for valid images", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "spinosa-ppu-ocr-ab-"))
    const src = path.join(root, "ok.png")
    const dest = path.join(root, "ok.md")
    // Minimal valid-enough PNG for signature checks: IHDR + IEND.
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from([0x00, 0x00, 0x00, 0x0d]), // IHDR length 13
      Buffer.from("IHDR", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00]),
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // fake CRC
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("IEND", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
    ])
    writeFileSync(src, png)

    const seenTypes: string[] = []
    try {
      mock.module("ppu-paddle-ocr", () => ({
        PaddleOcrService: class {
          async initialize() {}
          async destroy() {}
          async recognize(image: unknown) {
            seenTypes.push(Object.prototype.toString.call(image))
            expect(image instanceof ArrayBuffer).toBe(true)
            expect(ArrayBuffer.isView(image)).toBe(false)
            return { text: "hello", confidence: 0.9 }
          }
        },
        V6_MEDIUM_MODEL: {},
      }))

      const { runPpuOcrBatch } = await import("@spinosa/core/import/ppu-ocr")
      const result = await runPpuOcrBatch([{ src, rel: "ok.png", dest }])
      expect(result.converted).toBe(1)
      expect(seenTypes).toEqual(["[object ArrayBuffer]"])
      expect(existsSync(dest)).toBe(true)
    } finally {
      mock.restore()
      rmSync(root, { recursive: true, force: true })
    }
  })

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

      const { runPpuOcrBatch } = await import("@spinosa/core/import/ppu-ocr")
      const result = await runPpuOcrBatch([{ src, rel: "bad.png", dest }], {
        onLog: (line) => logs.push(line),
      })

      expect(result.converted).toBe(0)
      expect(result.skipped).toBe(1)
      expect(recognizeCalls).toBe(0)
      expect(existsSync(dest)).toBe(false)
      expect(logs.some((line) => line.includes("invalid OCR image input: truncated png"))).toBe(true)

      const logsDir = path.join(root, "logs")
      mkdirSync(logsDir)
      const { processOcr } = await import("@spinosa/core/import/pipeline")
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
