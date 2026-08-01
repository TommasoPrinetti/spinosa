import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  ensureOnnxRuntimeSharedLibs,
  nativeReexecUserArgv,
  prepareLinuxNativeReexecEnv,
  prependOnnxLibraryPath,
  reexecLinuxForNativeLibsIfNeeded,
  resolveOnnxRuntimeStageDir,
  shouldReexecLinuxForNativeLibs,
  SPINOSA_NATIVE_LIBS_READY,
} from "./onnx-runtime-libs"

describe("resolveOnnxRuntimeStageDir", () => {
  test("on Linux prefers SPINOSA_HOME cache when executable", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "spinosa-onnx-resolve-"))
    const home = path.join(scratch, "home")
    const xdg = path.join(scratch, "xdg")
    const tmp = path.join(scratch, "tmp")
    try {
      const dir = resolveOnnxRuntimeStageDir({
        platform: "linux",
        spinosaHomeDir: home,
        xdgCacheHome: xdg,
        tmpDir: tmp,
        canExec: () => true,
      })
      expect(dir).toBe(path.join(home, "cache", "onnx-runtime"))
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test("on Darwin prefers tmpdir when executable (adjacency)", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "spinosa-onnx-resolve-"))
    const home = path.join(scratch, "home")
    const xdg = path.join(scratch, "xdg")
    const tmp = path.join(scratch, "tmp")
    try {
      const dir = resolveOnnxRuntimeStageDir({
        platform: "darwin",
        spinosaHomeDir: home,
        xdgCacheHome: xdg,
        tmpDir: tmp,
        canExec: () => true,
      })
      expect(dir).toBe(tmp)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test("falls back to XDG then tmpdir when preferred dirs fail exec probe", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "spinosa-onnx-resolve-"))
    const home = path.join(scratch, "home")
    const xdg = path.join(scratch, "xdg")
    const tmp = path.join(scratch, "tmp")
    try {
      const xdgOnly = resolveOnnxRuntimeStageDir({
        platform: "linux",
        spinosaHomeDir: home,
        xdgCacheHome: xdg,
        tmpDir: tmp,
        canExec: (candidate) => candidate.startsWith(path.join(xdg, "spinosa")),
      })
      expect(xdgOnly).toBe(path.join(xdg, "spinosa", "onnx-runtime"))

      const tmpOnly = resolveOnnxRuntimeStageDir({
        platform: "linux",
        spinosaHomeDir: home,
        xdgCacheHome: xdg,
        tmpDir: tmp,
        canExec: (candidate) => candidate === tmp,
      })
      expect(tmpOnly).toBe(tmp)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

describe("prependOnnxLibraryPath", () => {
  test("prepends LD_LIBRARY_PATH / DYLD_LIBRARY_PATH without duplicating", () => {
    const key = process.platform === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH"
    if (process.platform !== "darwin" && process.platform !== "linux") return
    const env: NodeJS.ProcessEnv = { [key]: "/other/lib" }
    prependOnnxLibraryPath("/spinosa/cache/onnx-runtime", env)
    expect(env[key]).toBe(`/spinosa/cache/onnx-runtime${path.delimiter}/other/lib`)
    prependOnnxLibraryPath("/spinosa/cache/onnx-runtime", env)
    expect(env[key]).toBe(`/spinosa/cache/onnx-runtime${path.delimiter}/other/lib`)
  })
})

describe("ensureOnnxRuntimeSharedLibs", () => {
  test("stages embedded bytes into resolved stage dir and sets library path", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "spinosa-onnx-stage-"))
    const src = path.join(scratch, "libonnxruntime.1.dylib")
    const stageDir = path.join(scratch, "stage")
    // Mirror production minimum size gate (≥1024 bytes).
    const payload = Buffer.alloc(2048, 0x61)
    payload.write("onnx-fixture-bytes")
    writeFileSync(src, payload)
    const name = `spinosa-test-onnx-${process.pid}.dylib`
    const dest = path.join(stageDir, name)
    const libKey = process.platform === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH"
    const env: NodeJS.ProcessEnv = {}
    try {
      if (existsSync(dest)) rmSync(dest)
      const result = ensureOnnxRuntimeSharedLibs({
        files: [{ name, file: src }],
        stageDir,
        env,
      })
      expect(result.stageDir).toBe(stageDir)
      expect(result.staged).toContain(dest)
      expect(readFileSync(dest).equals(payload)).toBe(true)
      if (process.platform === "darwin" || process.platform === "linux") {
        expect(env[libKey]).toBe(stageDir)
      }
      const again = ensureOnnxRuntimeSharedLibs({
        files: [{ name, file: src }],
        stageDir,
        env,
      })
      expect(again.skipped).toContain(dest)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test("on Linux prefers SPINOSA_HOME stage over tmp when canExec allows home", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "spinosa-onnx-home-"))
    const home = path.join(scratch, "home")
    const tmp = path.join(scratch, "tmp")
    const src = path.join(scratch, "libonnxruntime.so.1")
    const payload = Buffer.alloc(2048, 0x62)
    payload.write("onnx-home-bytes")
    writeFileSync(src, payload)
    const name = `spinosa-test-onnx-home-${process.pid}.so.1`
    const expectedDir = path.join(home, "cache", "onnx-runtime")
    const dest = path.join(expectedDir, name)
    try {
      const result = ensureOnnxRuntimeSharedLibs({
        files: [{ name, file: src }],
        platform: "linux",
        spinosaHomeDir: home,
        xdgCacheHome: path.join(scratch, "xdg"),
        tmpDir: tmp,
        canExec: (candidate) => candidate === expectedDir,
        env: {},
      })
      expect(result.stageDir).toBe(expectedDir)
      expect(result.staged).toContain(dest)
      expect(readFileSync(dest).equals(payload)).toBe(true)
      // Also mirror into tmpdir for $ORIGIN adjacency when Bun extracts .node there.
      expect(existsSync(path.join(tmp, name))).toBe(true)
      expect(readFileSync(path.join(tmp, name)).equals(payload)).toBe(true)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

describe("shouldReexecLinuxForNativeLibs", () => {
  test("re-execs once on Linux when libs are embedded", () => {
    expect(
      shouldReexecLinuxForNativeLibs({
        platform: "linux",
        hasEmbeddedLibs: true,
        env: {},
      }),
    ).toBe(true)
    expect(
      shouldReexecLinuxForNativeLibs({
        platform: "linux",
        hasEmbeddedLibs: true,
        env: { [SPINOSA_NATIVE_LIBS_READY]: "1" },
      }),
    ).toBe(false)
    expect(
      shouldReexecLinuxForNativeLibs({
        platform: "linux",
        hasEmbeddedLibs: false,
        env: {},
      }),
    ).toBe(false)
    expect(
      shouldReexecLinuxForNativeLibs({
        platform: "darwin",
        hasEmbeddedLibs: true,
        env: {},
      }),
    ).toBe(false)
  })
})

describe("prepareLinuxNativeReexecEnv / reexecLinuxForNativeLibsIfNeeded", () => {
  test("child env gets LD_LIBRARY_PATH and ready marker", () => {
    const env = prepareLinuxNativeReexecEnv("/spinosa/cache/onnx-runtime", { PATH: "/usr/bin" }, "linux")
    expect(env.LD_LIBRARY_PATH).toBe("/spinosa/cache/onnx-runtime")
    expect(env[SPINOSA_NATIVE_LIBS_READY]).toBe("1")
    expect(env.PATH).toBe("/usr/bin")
  })

  test("invokes injected reexec with argv slice and prepared env", () => {
    const calls: Array<{ execPath: string; argv: string[]; env: NodeJS.ProcessEnv }> = []
    reexecLinuxForNativeLibsIfNeeded({
      platform: "linux",
      hasEmbeddedLibs: true,
      stageDir: "/spinosa/cache/onnx-runtime",
      env: {},
      execPath: "/tmp/spinosa-bin",
      // Bun --compile shape: [exec, /$bunfs/..., ...userArgs]
      argv: ["/tmp/spinosa-bin", "/$bunfs/root/src/index.js", "doctor", "--json"],
      reexec: (execPath, argv, env) => {
        calls.push({ execPath, argv, env })
      },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.execPath).toBe("/tmp/spinosa-bin")
    expect(calls[0]!.argv).toEqual(["doctor", "--json"])
    expect(calls[0]!.env.LD_LIBRARY_PATH).toBe("/spinosa/cache/onnx-runtime")
    expect(calls[0]!.env[SPINOSA_NATIVE_LIBS_READY]).toBe("1")
  })

  test("nativeReexecUserArgv drops bunfs entry but keeps plain argv[1] user args", () => {
    expect(
      nativeReexecUserArgv(["/bin/spinosa", "/$bunfs/root/src/index.js", "version"]),
    ).toEqual(["version"])
    expect(nativeReexecUserArgv(["/bin/spinosa", "version"])).toEqual(["version"])
  })

  test("no-op when already ready or not Linux", () => {
    const calls: unknown[] = []
    reexecLinuxForNativeLibsIfNeeded({
      platform: "linux",
      hasEmbeddedLibs: true,
      stageDir: "/x",
      env: { [SPINOSA_NATIVE_LIBS_READY]: "1" },
      reexec: () => calls.push("linux-ready"),
    })
    reexecLinuxForNativeLibsIfNeeded({
      platform: "darwin",
      hasEmbeddedLibs: true,
      stageDir: "/x",
      env: {},
      reexec: () => calls.push("darwin"),
    })
    expect(calls).toEqual([])
  })
})
