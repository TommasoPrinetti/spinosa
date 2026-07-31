/**
 * Locate onnxruntime-node companion shared libraries for Bun --compile packaging.
 *
 * Bun extracts `.node` addons to a temp dir but does not co-locate `@rpath` /
 * `$ORIGIN` shared libs (libonnxruntime.1.dylib / .so.1 / onnxruntime.dll).
 * We embed those libs and stage them into os.tmpdir() before the addon loads.
 *
 * Resolution walks the workspace-linked `ppu-paddle-ocr` install (not global
 * `node_modules`), so the embedded dylib matches the binding Bun compiles in.
 */
import fs from "node:fs"
import path from "node:path"

export type OnnxNativeTarget = {
  os: "linux" | "darwin" | "win32"
  arch: "arm64" | "x64"
}

export type OnnxSharedLib = {
  name: string
  absolutePath: string
}

export function onnxSharedLibNames(os: OnnxNativeTarget["os"]): string[] {
  if (os === "darwin") return ["libonnxruntime.1.dylib"]
  if (os === "linux") return ["libonnxruntime.so.1"]
  if (os === "win32") return ["onnxruntime.dll"]
  return []
}

function candidatePaddleRoots(fromDir: string): string[] {
  return [
    path.join(fromDir, "node_modules", "ppu-paddle-ocr"),
    path.join(fromDir, "..", "spinosa-core", "node_modules", "ppu-paddle-ocr"),
    path.join(fromDir, "..", "..", "packages", "spinosa-core", "node_modules", "ppu-paddle-ocr"),
  ]
}

export function resolveOnnxRuntimeNodeRoot(fromDir: string): string {
  for (const candidate of candidatePaddleRoots(fromDir)) {
    if (!fs.existsSync(candidate)) continue
    const paddleRoot = fs.realpathSync(candidate)
    const sibling = path.join(path.dirname(paddleRoot), "onnxruntime-node")
    if (fs.existsSync(path.join(sibling, "package.json"))) {
      return sibling
    }
    const nested = path.join(paddleRoot, "node_modules", "onnxruntime-node")
    if (fs.existsSync(path.join(nested, "package.json"))) {
      return nested
    }
  }

  // Last resort: bun store scan under repo node_modules/.bun (never home global).
  const bunStore = path.join(fromDir, "..", "..", "node_modules", ".bun")
  const altStore = path.join(fromDir, "node_modules", ".bun")
  for (const store of [bunStore, altStore]) {
    if (!fs.existsSync(store)) continue
    const matches = fs
      .readdirSync(store)
      .filter((name) => name.startsWith("onnxruntime-node@"))
      .sort()
      .reverse()
    for (const name of matches) {
      const root = path.join(store, name, "node_modules", "onnxruntime-node")
      if (fs.existsSync(path.join(root, "package.json"))) return root
    }
  }

  throw new Error(
    `onnxruntime-node not found via workspace ppu-paddle-ocr (fromDir=${fromDir}). ` +
      `Install dependencies before building binaries.`,
  )
}

/**
 * Upstream onnxruntime-node dropped darwin/x64 binaries after 1.23.2
 * (microsoft/onnxruntime#27961). Pin the last published slice so four-platform
 * product builds stay fail-closed rather than silently skipping Intel macOS.
 */
export const ONNX_DARWIN_X64_FALLBACK_PACKAGE = "onnxruntime-node@1.23.2"

function onnxBindingDir(root: string, target: OnnxNativeTarget): string {
  return path.join(root, "bin", "napi-v6", target.os, target.arch)
}

function hasUsableOnnxBinding(bindingDir: string, target: OnnxNativeTarget): boolean {
  if (!fs.existsSync(bindingDir)) return false
  if (!fs.existsSync(path.join(bindingDir, "onnxruntime_binding.node"))) return false
  return onnxSharedLibNames(target.os).every((name) => {
    const p = path.join(bindingDir, name)
    return fs.existsSync(p) && fs.statSync(p).size >= 1024
  })
}

function normalizeDarwinSharedLibNames(bindingDir: string): void {
  const canonical = path.join(bindingDir, "libonnxruntime.1.dylib")
  if (fs.existsSync(canonical) && fs.statSync(canonical).size >= 1024) return
  const versioned = fs
    .readdirSync(bindingDir)
    .filter((name) => /^libonnxruntime\.\d/.test(name) && name.endsWith(".dylib"))
    .sort()
    .reverse()[0]
  if (!versioned) return
  const src = path.join(bindingDir, versioned)
  if (fs.statSync(src).size < 1024) return
  fs.copyFileSync(src, canonical)
}

async function downloadNpmPackageTarball(spec: string, destDir: string): Promise<string> {
  fs.mkdirSync(destDir, { recursive: true })
  const at = spec.lastIndexOf("@")
  if (at <= 0) throw new Error(`invalid npm package spec: ${spec}`)
  const name = spec.slice(0, at)
  const version = spec.slice(at + 1)
  const tgzName = `${name}-${version}.tgz`
  const tgz = path.join(destDir, tgzName)
  if (fs.existsSync(tgz) && fs.statSync(tgz).size >= 1024) return tgz

  // Prefer npm pack (reliable over Bun fetch in restricted network environments).
  const pack = Bun.spawn(["npm", "pack", spec, "--pack-destination", destDir], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(pack.stdout).text(),
    new Response(pack.stderr).text(),
    pack.exited,
  ])
  if (code !== 0 || !fs.existsSync(tgz) || fs.statSync(tgz).size < 1024) {
    throw new Error(
      `failed to npm pack ${spec} into ${destDir} (exit ${code}): ${stderr || stdout}`.trim(),
    )
  }
  return tgz
}

/** Ensure target binding dir + companion libs exist under the workspace onnxruntime-node install. */
export async function ensureOnnxPlatformBindings(
  target: OnnxNativeTarget,
  fromDir: string,
): Promise<{ root: string; bindingDir: string; sourcedFrom: "installed" | "fallback" }> {
  const root = resolveOnnxRuntimeNodeRoot(fromDir)
  const bindingDir = onnxBindingDir(root, target)
  if (hasUsableOnnxBinding(bindingDir, target)) {
    return { root, bindingDir, sourcedFrom: "installed" }
  }

  // Only darwin/x64 is known-missing from current onnxruntime-node publishes.
  if (!(target.os === "darwin" && target.arch === "x64")) {
    throw new Error(
      `onnxruntime-node binding dir missing for ${target.os}-${target.arch}: ${bindingDir}. ` +
        `Install platform natives before building binaries.`,
    )
  }

  const vendorRoot = path.join(fromDir, "..", "spinosa-kernel", ".build", "onnx-vendor")
  const altVendor = path.join(fromDir, ".build", "onnx-vendor")
  const cacheDir = fs.existsSync(path.join(fromDir, "..", "spinosa-kernel")) ? vendorRoot : altVendor
  const tgz = await downloadNpmPackageTarball(ONNX_DARWIN_X64_FALLBACK_PACKAGE, cacheDir)
  const extractDir = path.join(cacheDir, "extract-darwin-x64")
  fs.rmSync(extractDir, { recursive: true, force: true })
  fs.mkdirSync(extractDir, { recursive: true })
  const proc = Bun.spawn(["tar", "xzf", tgz, "-C", extractDir, "package/bin/napi-v6/darwin/x64"], {
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`failed to extract ${ONNX_DARWIN_X64_FALLBACK_PACKAGE} darwin/x64 (exit ${code})`)
  }
  const sourced = path.join(extractDir, "package", "bin", "napi-v6", "darwin", "x64")
  if (!fs.existsSync(path.join(sourced, "onnxruntime_binding.node"))) {
    throw new Error(`${ONNX_DARWIN_X64_FALLBACK_PACKAGE} tarball missing darwin/x64 binding`)
  }
  fs.mkdirSync(bindingDir, { recursive: true })
  for (const name of fs.readdirSync(sourced)) {
    fs.copyFileSync(path.join(sourced, name), path.join(bindingDir, name))
  }
  normalizeDarwinSharedLibNames(bindingDir)
  if (!hasUsableOnnxBinding(bindingDir, target)) {
    throw new Error(
      `failed to vendor usable onnxruntime darwin/x64 bindings into ${bindingDir} ` +
        `from ${ONNX_DARWIN_X64_FALLBACK_PACKAGE}`,
    )
  }
  console.warn(
    `vendored onnxruntime darwin/x64 natives from ${ONNX_DARWIN_X64_FALLBACK_PACKAGE} ` +
      `(upstream ${path.basename(root)} omits this platform)`,
  )
  return { root, bindingDir, sourcedFrom: "fallback" }
}

export function resolveOnnxSharedLibs(target: OnnxNativeTarget, fromDir: string): OnnxSharedLib[] {
  const root = resolveOnnxRuntimeNodeRoot(fromDir)
  const bindingDir = onnxBindingDir(root, target)
  normalizeDarwinSharedLibNames(bindingDir)
  if (!fs.existsSync(bindingDir)) {
    throw new Error(
      `onnxruntime-node binding dir missing for ${target.os}-${target.arch}: ${bindingDir}`,
    )
  }
  const libs: OnnxSharedLib[] = []
  for (const name of onnxSharedLibNames(target.os)) {
    const absolutePath = path.join(bindingDir, name)
    if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).size < 1024) {
      throw new Error(
        `onnxruntime shared library missing or too small for ${target.os}-${target.arch}: ${absolutePath}`,
      )
    }
    libs.push({ name, absolutePath })
  }
  if (libs.length === 0) {
    throw new Error(`no onnxruntime shared libraries mapped for ${target.os}-${target.arch}`)
  }
  return libs
}

/**
 * Stage copied libs under src/generated/onnx-libs/<os>-<arch>/ (same pattern as
 * template-blobs) and write onnx-native.gen.ts on disk. Bun --compile resolves
 * `with { type: "file" }` imports from real files next to the gen module; a
 * virtual Bun.build `files` map alone does not embed companion .so/.dylib.
 */
export async function materializeOnnxNativeEmbed(options: {
  cwd: string
  target: OnnxNativeTarget
  fromDir: string
}): Promise<{ moduleSource: string; libsDir: string; libs: OnnxSharedLib[]; genPath: string }> {
  await ensureOnnxPlatformBindings(options.target, options.fromDir)
  const libs = resolveOnnxSharedLibs(options.target, options.fromDir)
  const platformKey = `${options.target.os}-${options.target.arch}`
  const libsDir = path.join(options.cwd, "src/generated/onnx-libs", platformKey)
  // Keep a mirror under .build for inspection / Lima copy debugging.
  const mirrorDir = path.join(options.cwd, ".build", "onnx-native", platformKey)
  fs.rmSync(libsDir, { recursive: true, force: true })
  fs.rmSync(mirrorDir, { recursive: true, force: true })
  fs.mkdirSync(libsDir, { recursive: true })
  fs.mkdirSync(mirrorDir, { recursive: true })

  const imports: string[] = ["// @generated by script/onnx-native.ts — do not edit"]
  const entries: string[] = ["export const ONNX_SHARED_LIB_FILES = ["]

  libs.forEach((lib, i) => {
    const dest = path.join(libsDir, lib.name)
    fs.copyFileSync(lib.absolutePath, dest)
    fs.copyFileSync(lib.absolutePath, path.join(mirrorDir, lib.name))
    if (fs.statSync(dest).size < 1024) {
      throw new Error(`onnx embed copy too small: ${dest}`)
    }
    // Import from on-disk path beside onnx-native.gen.ts (template-blobs pattern).
    const spec = `./onnx-libs/${platformKey}/${lib.name}`
    imports.push(`import file_${i} from ${JSON.stringify(spec)} with { type: "file" };`)
    entries.push(`  { name: ${JSON.stringify(lib.name)}, file: file_${i} },`)
  })

  entries.push("] as const")
  entries.push("")
  const moduleSource = [...imports, "", ...entries].join("\n")
  assertOnnxNativeModuleSource(moduleSource, options.target)
  const genPath = path.join(options.cwd, "src/generated/onnx-native.gen.ts")
  fs.writeFileSync(genPath, moduleSource)
  return { moduleSource, libsDir, libs, genPath }
}

/** Fail closed if the generated embed module would ship an empty ONNX lib list. */
export function assertOnnxNativeModuleSource(moduleSource: string, target: OnnxNativeTarget): void {
  if (!moduleSource.includes('with { type: "file" }')) {
    throw new Error(`onnx-native embed module missing file imports for ${target.os}-${target.arch}`)
  }
  if (!moduleSource.includes("ONNX_SHARED_LIB_FILES")) {
    throw new Error(`onnx-native embed module missing ONNX_SHARED_LIB_FILES for ${target.os}-${target.arch}`)
  }
  for (const name of onnxSharedLibNames(target.os)) {
    if (!moduleSource.includes(name)) {
      throw new Error(
        `onnx-native embed module missing ${name} for ${target.os}-${target.arch}`,
      )
    }
  }
  // Empty array means the virtual-files-map-only path that previously shipped broken binaries.
  if (/ONNX_SHARED_LIB_FILES\s*=\s*\[\s*\]/.test(moduleSource)) {
    throw new Error(
      `onnx-native embed module has empty ONNX_SHARED_LIB_FILES for ${target.os}-${target.arch}`,
    )
  }
}

export const ONNX_NATIVE_STUB_MODULE = `// @generated stub — binary builds overwrite via Bun.build files map
export const ONNX_SHARED_LIB_FILES: readonly { name: string; file: string }[] = []
`

/** Restore the tracked stub so platform-specific gen output is not left dirty. */
export function restoreOnnxNativeStub(cwd: string): void {
  fs.writeFileSync(path.join(cwd, "src/generated/onnx-native.gen.ts"), ONNX_NATIVE_STUB_MODULE)
}

/** Platform optional dependency package for `@napi-rs/canvas` (napi-rs naming). */
export function napiCanvasPlatformPackage(target: OnnxNativeTarget & { abi?: "musl" }): string {
  if (target.os === "darwin") {
    return target.arch === "arm64" ? "@napi-rs/canvas-darwin-arm64" : "@napi-rs/canvas-darwin-x64"
  }
  if (target.os === "linux") {
    const musl = target.abi === "musl"
    if (target.arch === "arm64") {
      return musl ? "@napi-rs/canvas-linux-arm64-musl" : "@napi-rs/canvas-linux-arm64-gnu"
    }
    return musl ? "@napi-rs/canvas-linux-x64-musl" : "@napi-rs/canvas-linux-x64-gnu"
  }
  if (target.os === "win32") {
    return target.arch === "arm64" ? "@napi-rs/canvas-win32-arm64-msvc" : "@napi-rs/canvas-win32-x64-msvc"
  }
  throw new Error(`unsupported canvas platform ${target.os}-${target.arch}`)
}

/** Fail closed if the platform canvas native package is not installed for this target. */
export function assertNapiCanvasPlatformInstalled(target: OnnxNativeTarget & { abi?: "musl" }, fromDir: string): string {
  const pkg = napiCanvasPlatformPackage(target)
  const candidates = [
    path.join(fromDir, "node_modules", ...pkg.split("/")),
    path.join(fromDir, "..", "..", "node_modules", ...pkg.split("/")),
    path.join(fromDir, "node_modules", "@napi-rs", pkg.split("/")[1]!),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return fs.realpathSync(candidate)
    }
  }
  // bun store entries look like `@napi-rs+canvas-darwin-x64@1.0.2`
  const storeRoots = [
    path.join(fromDir, "..", "..", "node_modules", ".bun"),
    path.join(fromDir, "node_modules", ".bun"),
  ]
  const leaf = pkg.replace("/", "+")
  for (const store of storeRoots) {
    if (!fs.existsSync(store)) continue
    for (const name of fs.readdirSync(store)) {
      if (!name.startsWith(leaf + "@") && name !== leaf) continue
      const root = path.join(store, name, "node_modules", ...pkg.split("/"))
      if (fs.existsSync(path.join(root, "package.json"))) return fs.realpathSync(root)
    }
  }
  throw new Error(
    `missing ${pkg} for ${target.os}-${target.arch}. Install with: bun install --os=* --cpu=* @napi-rs/canvas`,
  )
}

export function napiCanvasForceModule(pkg: string): string {
  return `// @generated — force-embed canvas + OCR packages into Bun --compile graph
import "@napi-rs/canvas"
import ${JSON.stringify(pkg)}
import "ppu-paddle-ocr"
export {}
`
}
