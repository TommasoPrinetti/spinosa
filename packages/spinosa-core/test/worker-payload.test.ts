import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  decodeWorkerPayload,
  disposeWorkerPayload,
  encodeWorkerPayload,
  MAX_WORKER_ARGV_PAYLOAD,
} from "../src/import/worker-payload"

const tempRoots: string[] = []

afterEach(() => {
  for (const dir of tempRoots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "spinosa-worker-payload-test-"))
  tempRoots.push(dir)
  return dir
}

describe("worker payload transport", () => {
  test("small payloads stay on argv as plain JSON", () => {
    const payload = { files: [{ src: "a.md", rel: "a.md", dest: "b.md" }] }
    const { arg, tempPath } = encodeWorkerPayload(payload)
    expect(tempPath).toBeUndefined()
    expect(JSON.parse(arg)).toEqual(payload)
    expect(arg.length).toBeLessThanOrEqual(MAX_WORKER_ARGV_PAYLOAD)
  })

  test("oversized payloads spill to a temp file that decodes and self-deletes", () => {
    const big = { files: Array.from({ length: 10_000 }, (_, i) => ({ src: `big/${i}.txt`, rel: `${i}.txt`, dest: `${i}.md` })) }
    const { arg, tempPath } = encodeWorkerPayload(big)
    expect(tempPath).toBeDefined()
    expect(arg).toContain("@file:")
    expect(arg).not.toContain(`"files"`)
    expect(existsSync(tempPath!)).toBe(true)

    const decoded = decodeWorkerPayload(arg) as { files: unknown[] }
    expect(decoded.files).toHaveLength(10_000)
    expect(decoded.files[9_999]).toEqual(big.files[9_999])
    // worker side removes the file after reading
    expect(existsSync(tempPath!)).toBe(false)
  })

  test("decodeWorkerPayload honours small, file, missing and garbage inputs", () => {
    expect(decodeWorkerPayload(undefined)).toEqual({})
    expect(decodeWorkerPayload('{"a":1}')).toEqual({ a: 1 })
    expect(() => decodeWorkerPayload("{not json")).toThrow()
    const file = path.join(tempDir(), "payload.json")
    writeFileSync(file, JSON.stringify({ ok: true }), "utf8")
    expect(decodeWorkerPayload(`@file:${file}`)).toEqual({ ok: true })
    expect(existsSync(file)).toBe(false)
  })

  test("disposeWorkerPayload removes a spilt payload file and tolerates missing paths", () => {
    const file = path.join(tempDir(), "payload.json")
    writeFileSync(file, "{}", "utf8")
    disposeWorkerPayload(file)
    expect(existsSync(file)).toBe(false)
    expect(() => disposeWorkerPayload(undefined)).not.toThrow()
    expect(() => disposeWorkerPayload(path.join(tempDir(), "nope.json"))).not.toThrow()

    // sanity: a real oversized payload round-trips through dispose
    const big = { files: [{ rel: "x".repeat(MAX_WORKER_ARGV_PAYLOAD) }] }
    const { tempPath } = encodeWorkerPayload(big)
    expect(tempPath).toBeDefined()
    disposeWorkerPayload(tempPath)
    expect(existsSync(tempPath!)).toBe(false)
  })
})