import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ensureOnnxRuntimeSharedLibs } from "./onnx-runtime-libs"

describe("ensureOnnxRuntimeSharedLibs", () => {
  test("stages embedded bytes into os.tmpdir()", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "spinosa-onnx-stage-"))
    const src = path.join(scratch, "libonnxruntime.1.dylib")
    const payload = Buffer.from("onnx-fixture-bytes")
    writeFileSync(src, payload)
    const name = `spinosa-test-onnx-${process.pid}.dylib`
    const dest = path.join(tmpdir(), name)
    try {
      if (existsSync(dest)) rmSync(dest)
      const result = ensureOnnxRuntimeSharedLibs([{ name, file: src }])
      expect(result.staged).toContain(dest)
      expect(readFileSync(dest).equals(payload)).toBe(true)
      const again = ensureOnnxRuntimeSharedLibs([{ name, file: src }])
      expect(again.skipped).toContain(dest)
    } finally {
      try {
        rmSync(dest, { force: true })
      } catch {
        /* ignore */
      }
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
