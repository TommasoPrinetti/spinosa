import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import {
  ONNX_DARWIN_X64_FALLBACK_PACKAGE,
  ONNX_NATIVE_STUB_MODULE,
  assertNapiCanvasPlatformInstalled,
  assertOnnxNativeModuleSource,
  ensureOnnxPlatformBindings,
  materializeOnnxNativeEmbed,
  napiCanvasPlatformPackage,
  onnxSharedLibNames,
  resolveOnnxRuntimeNodeRoot,
  resolveOnnxSharedLibs,
  restoreOnnxNativeStub,
  type OnnxNativeTarget,
} from "./onnx-native.ts"

const kernelDir = path.resolve(import.meta.dir, "..")
const coreDir = path.resolve(kernelDir, "../spinosa-core")

const PRODUCT_TARGETS: OnnxNativeTarget[] = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
]

describe("onnx-native packaging", () => {
  test("resolves workspace onnxruntime-node (not a home global install)", () => {
    const root = resolveOnnxRuntimeNodeRoot(coreDir)
    expect(root.includes(`${path.sep}.bun${path.sep}`) || root.includes("node_modules")).toBe(true)
    expect(root.includes("/Users/tommasoprinetti/node_modules/onnxruntime-node")).toBe(false)
    expect(fs.existsSync(path.join(root, "package.json"))).toBe(true)
  })

  test("assertOnnxNativeModuleSource rejects empty embed modules", () => {
    expect(() =>
      assertOnnxNativeModuleSource(ONNX_NATIVE_STUB_MODULE, { os: "linux", arch: "arm64" }),
    ).toThrow(/missing file imports|empty ONNX_SHARED_LIB_FILES/)
  })

  test("host shared libs exist and materialize embed module", async () => {
    const target = {
      os: process.platform as "darwin" | "linux" | "win32",
      arch: process.arch as "arm64" | "x64",
    }
    if (target.os !== "darwin" && target.os !== "linux" && target.os !== "win32") {
      return
    }
    const names = onnxSharedLibNames(target.os)
    expect(names.length).toBeGreaterThan(0)
    const libs = resolveOnnxSharedLibs(target, coreDir)
    expect(libs.map((l) => l.name)).toEqual(names)
    for (const lib of libs) {
      expect(fs.statSync(lib.absolutePath).size).toBeGreaterThan(1024)
    }

    try {
      const embedded = await materializeOnnxNativeEmbed({
        cwd: kernelDir,
        target,
        fromDir: coreDir,
      })
      expect(embedded.moduleSource).toContain('with { type: "file" }')
      expect(embedded.moduleSource).toContain("ONNX_SHARED_LIB_FILES")
      expect(embedded.moduleSource).toContain(`./onnx-libs/${target.os}-${target.arch}/`)
      expect(fs.readFileSync(embedded.genPath, "utf-8")).toBe(embedded.moduleSource)
      for (const lib of embedded.libs) {
        expect(fs.existsSync(path.join(embedded.libsDir, lib.name))).toBe(true)
      }

      const canvasPkg = napiCanvasPlatformPackage(target)
      expect(canvasPkg.startsWith("@napi-rs/canvas-")).toBe(true)
      expect(assertNapiCanvasPlatformInstalled(target, coreDir)).toContain("canvas")
    } finally {
      restoreOnnxNativeStub(kernelDir)
    }
  })

  test(
    "materializes onnx natives for all four product binary targets",
    async () => {
      try {
        for (const target of PRODUCT_TARGETS) {
          const embedded = await materializeOnnxNativeEmbed({
            cwd: kernelDir,
            target,
            fromDir: coreDir,
          })
          assertOnnxNativeModuleSource(embedded.moduleSource, target)
          for (const lib of embedded.libs) {
            const dest = path.join(embedded.libsDir, lib.name)
            expect(fs.existsSync(dest)).toBe(true)
            expect(fs.statSync(dest).size).toBeGreaterThan(1024)
          }
        }
      } finally {
        restoreOnnxNativeStub(kernelDir)
      }
    },
    { timeout: 180_000 },
  )

  test(
    "ensures darwin-x64 onnx bindings via pinned fallback when upstream omits them",
    async () => {
      const ensured = await ensureOnnxPlatformBindings({ os: "darwin", arch: "x64" }, coreDir)
      expect(ensured.bindingDir.includes(`${path.sep}darwin${path.sep}x64`)).toBe(true)
      expect(fs.existsSync(path.join(ensured.bindingDir, "onnxruntime_binding.node"))).toBe(true)
      const libs = resolveOnnxSharedLibs({ os: "darwin", arch: "x64" }, coreDir)
      expect(libs.map((l) => l.name)).toEqual(["libonnxruntime.1.dylib"])
      expect(ONNX_DARWIN_X64_FALLBACK_PACKAGE).toContain("1.23.2")
    },
    { timeout: 120_000 },
  )
})
