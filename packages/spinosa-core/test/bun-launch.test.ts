import { describe, expect, test } from "bun:test"
import {
  assertSafeKernelBunArgv,
  buildKernelBunArgv,
  OPENTUI_SOLID_PRELOAD,
} from "../src/system/bun-launch"

describe("buildKernelBunArgv", () => {
  test("emits cwd + preload before the kernel entry, without bun run", () => {
    const argv = buildKernelBunArgv({
      bunPath: "/opt/bun",
      frameworkRoot: "/install/root",
      kernelEntry: "/install/root/packages/spinosa-kernel/src/index.ts",
      args: ["version"],
    })
    expect(argv).toEqual([
      "/opt/bun",
      "--cwd",
      "/install/root",
      "--preload",
      OPENTUI_SOLID_PRELOAD,
      "/install/root/packages/spinosa-kernel/src/index.ts",
      "version",
    ])
    expect(argv.includes("run")).toBe(false)
  })

  test("rejects the argv shape that dumps Bun's help menu", () => {
    expect(() =>
      assertSafeKernelBunArgv([
        "bun",
        "--preload",
        OPENTUI_SOLID_PRELOAD,
        "run",
        "/entry.ts",
        "version",
      ]),
    ).toThrow(/help menu/)
  })

  test("rejects launches that omit the OpenTUI preload", () => {
    expect(() =>
      assertSafeKernelBunArgv(["bun", "--cwd", "/root", "/entry.ts"]),
    ).toThrow(/missing `--preload/)
  })
})
