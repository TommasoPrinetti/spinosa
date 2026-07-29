import { describe, expect, test } from "bun:test"
import { packageNameForPlatform } from "../bin/platform"

describe("platform package resolution", () => {
  test.each([
    ["darwin", "arm64", false, true, "@spinosa/kernel-darwin-arm64"],
    ["darwin", "x64", false, true, "@spinosa/kernel-darwin-x64"],
    ["darwin", "x64", false, false, "@spinosa/kernel-darwin-x64-baseline"],
    ["linux", "arm64", false, true, "@spinosa/kernel-linux-arm64"],
    ["linux", "arm64", true, true, "@spinosa/kernel-linux-arm64-musl"],
    ["linux", "x64", false, true, "@spinosa/kernel-linux-x64"],
    ["linux", "x64", false, false, "@spinosa/kernel-linux-x64-baseline"],
    ["linux", "x64", true, true, "@spinosa/kernel-linux-x64-musl"],
    ["linux", "x64", true, false, "@spinosa/kernel-linux-x64-baseline-musl"],
  ])("%s %s musl=%s avx2=%s", (platform, arch, musl, avx2, expected) => {
    expect(packageNameForPlatform({ platform, arch, musl, avx2 })).toBe(expected)
  })

  test("rejects targets outside the published boundary", () => {
    expect(() => packageNameForPlatform({ platform: "win32", arch: "x64", musl: false, avx2: true })).toThrow(
      "Unsupported Spinosa platform",
    )
    expect(() => packageNameForPlatform({ platform: "linux", arch: "riscv64", musl: false, avx2: true })).toThrow(
      "Unsupported Spinosa architecture",
    )
  })
})
