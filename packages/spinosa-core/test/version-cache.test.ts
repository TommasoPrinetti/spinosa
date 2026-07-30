import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readVersionCache, writeVersionCache } from "../src/commands/upgrade"

let cacheDir = ""

afterEach(() => {
  if (cacheDir) {
    rmSync(cacheDir, { recursive: true, force: true })
    cacheDir = ""
  }
  delete process.env.SPINOSA_METADATA_DIR
})

describe("version cache", () => {
  test("round-trips timestamp and version", () => {
    cacheDir = mkdtempSync(path.join(tmpdir(), "spinosa-cache-"))
    process.env.SPINOSA_METADATA_DIR = cacheDir
    writeVersionCache("beta", "1.0.2-beta.16")
    expect(readVersionCache("beta")).toEqual({
      timestamp: expect.any(Number),
      version: "1.0.2-beta.16",
    })
    expect(existsSync(path.join(cacheDir, "version_check_cache_beta"))).toBe(true)
  })

  test("ignores legacy four-line cache files", () => {
    cacheDir = mkdtempSync(path.join(tmpdir(), "spinosa-cache-"))
    process.env.SPINOSA_METADATA_DIR = cacheDir
    const cachePath = path.join(cacheDir, "version_check_cache_beta")
    Bun.write(cachePath, "1700000000\n1.0.0\n0\nbeta\n")
    expect(readVersionCache("beta")).toBeUndefined()
  })
})
