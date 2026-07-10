import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  symlinkSync,
  unlinkSync,
} from "node:fs"
import { writeFileSync } from "node:fs"
import { copyFile as copyFileAsync, mkdir as mkdirAsync, rm as rmAsync } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"

import { isCloudStoragePath } from "./path"

const DEFAULT_RETRIES = 3
const CLOUD_TIMEOUT_SEC = 60
const LOCAL_TIMEOUT_SEC = 30
const asyncCopyQueues = new Map<string, Promise<void>>()

export { isCloudStoragePath }

export function safeCopyTimeoutSecFor(p: string): number {
  return isCloudStoragePath(p) ? CLOUD_TIMEOUT_SEC : LOCAL_TIMEOUT_SEC
}

export interface SafeCopyOptions {
  retries?: number
  onRetry?: (attempt: number, reason: string) => void
}

export function shouldSkipTemplateCopyEntry(name: string, isDirectory: boolean): boolean {
  if (name === ".DS_Store" || name.startsWith("._")) return true
  if (isDirectory && (name === "node_modules" || name === ".git" || name === "__pycache__")) return true
  return !isDirectory && name.endsWith(".pyc")
}

function safeCopyDelaySec(p: string): number {
  return isCloudStoragePath(p) ? 4 : 2
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function replaceFromTemp(tmp: string, dest: string): void {
  if (existsSync(dest) && statSync(dest).isDirectory()) {
    throw new Error(`Refusing to replace directory with file: ${dest}`)
  }
  const backup = `${dest}.spinosa-backup-${process.pid}-${crypto.randomUUID()}`
  let backedUp = false
  try {
    if (existsSync(dest)) {
      renameSync(dest, backup)
      backedUp = true
    }
    renameSync(tmp, dest)
    if (backedUp) rmSync(backup, { force: true })
  } catch (error) {
    try { unlinkSync(tmp) } catch { /* temp cleanup */ }
    if (backedUp && !existsSync(dest)) {
      try { renameSync(backup, dest) } catch { /* preserve original error */ }
    }
    throw error
  }
}

function copyFileAtomically(src: string, dest: string): boolean {
  const tmp = `${dest}.spinosa-part-${process.pid}-${crypto.randomUUID()}`
  try {
    mkdirSync(path.dirname(dest), { recursive: true })
    copyFileSync(src, tmp)
    replaceFromTemp(tmp, dest)
    return true
  } catch {
    try { unlinkSync(tmp) } catch { /* temp cleanup, ignore */ }
    return false
  }
}

export function safeCopy(src: string, dest: string, options?: SafeCopyOptions): boolean {
  const retries = options?.retries ?? DEFAULT_RETRIES
  const useStream = isCloudStoragePath(dest)
  let delayMs = safeCopyDelaySec(dest) * 1000
  let lastReason = ""

  mkdirSync(path.dirname(dest), { recursive: true })

  for (let i = 1; i <= retries; i++) {
    if (useStream) {
      if (copyFileAtomically(src, dest)) return true
      lastReason = "atomic copy failed"
    } else {
      if (copyFileAtomically(src, dest)) return true
      lastReason = "atomic copy failed"
    }
    if (i >= retries) break
    options?.onRetry?.(i, lastReason)
    sleepMs(delayMs)
    delayMs *= 2
  }
  return false
}

export function writeTextAtomic(dest: string, content: string): void {
  const tmp = `${dest}.spinosa-part-${process.pid}-${crypto.randomUUID()}`
  mkdirSync(path.dirname(dest), { recursive: true })
  try {
    writeFileSync(tmp, content, "utf-8")
    renameSync(tmp, dest)
  } catch (error) {
    try { unlinkSync(tmp) } catch { /* temp cleanup */ }
    throw error
  }
}

export async function safeCopyAsync(src: string, dest: string, options?: SafeCopyOptions): Promise<boolean> {
  const previous = asyncCopyQueues.get(dest) ?? Promise.resolve()
  const gate = Promise.withResolvers<void>()
  const queued = previous.then(() => gate.promise)
  asyncCopyQueues.set(dest, queued)
  await previous
  try {
  const retries = options?.retries ?? DEFAULT_RETRIES
  let delayMs = safeCopyDelaySec(dest) * 1000
  let lastReason = ""

  await mkdirAsync(path.dirname(dest), { recursive: true })

  for (let i = 1; i <= retries; i++) {
    const tmp = `${dest}.spinosa-part-${process.pid}-${crypto.randomUUID()}`
    try {
      await copyFileAsync(src, tmp)
      replaceFromTemp(tmp, dest)
      return true
    } catch (err) {
      await rmAsync(tmp, { force: true }).catch(() => {})
      lastReason = String(err)
    }
    if (i >= retries) break
    options?.onRetry?.(i, lastReason)
    await new Promise((r) => setTimeout(r, delayMs))
    delayMs *= 2
  }
  return false
  } finally {
    gate.resolve()
    if (asyncCopyQueues.get(dest) === queued) asyncCopyQueues.delete(dest)
  }
}

export function safeCopyTree(src: string, dest: string): void {
  const srcReal = path.resolve(src)
  mkdirSync(dest, { recursive: true })

  for (const entry of readdirSync(srcReal, { withFileTypes: true })) {
    if (shouldSkipTemplateCopyEntry(entry.name, entry.isDirectory())) continue

    const srcPath = path.join(srcReal, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isSymbolicLink()) {
      const target = readlinkSync(srcPath)
      mkdirSync(path.dirname(destPath), { recursive: true })
      try { unlinkSync(destPath) } catch { /* missing destination */ }
      symlinkSync(target, destPath)
    } else if (entry.isDirectory()) {
      safeCopyTree(srcPath, destPath)
    } else if (entry.isFile()) {
      if (!safeCopy(srcPath, destPath)) {
        throw new Error(`Failed to copy file: ${srcPath}`)
      }
    }
  }
}

function rsyncCopyDirContents(src: string, dest: string): boolean {
  const which = spawnSync("which", ["rsync"], { encoding: "utf-8" })
  if (which.status !== 0) return false
  if (isCloudStoragePath(src) || isCloudStoragePath(dest)) return false

  mkdirSync(dest, { recursive: true })
  const result = spawnSync("rsync", [
    "-a",
    "--exclude",
    ".DS_Store",
    "--exclude",
    "._*",
    "--exclude",
    "node_modules/",
    "--exclude",
    ".git/",
    "--exclude",
    "__pycache__/",
    "--exclude",
    "*.pyc",
    `${src}/`,
    `${dest}/`,
  ])
  return result.status === 0
}

export function copyDirContents(src: string, dest: string): void {
  const srcReal = path.resolve(src)
  mkdirSync(dest, { recursive: true })

  const frameworkRoot = process.env.SPINOSA_FRAMEWORK_ROOT
  if (frameworkRoot) {
    const fwReal = path.resolve(frameworkRoot)
    if (srcReal === fwReal) {
      throw new Error(
        "Refusing to copy framework root as a directory; check workspace-template/.spinosa/workspace-files.tsv for blank or unsafe paths.",
      )
    }
  }

  if (rsyncCopyDirContents(srcReal, dest)) return

  try {
    safeCopyTree(srcReal, dest)
  } catch {
    if (isCloudStoragePath(dest)) {
      throw new Error(
        "Failed to copy directory to cloud storage destination — open the folder in Finder, wait for sync, then retry",
      )
    }
    throw new Error(`Failed to copy directory: ${src}`)
  }
}

export function cleanMacMetadata(dir: string): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      cleanMacMetadata(full)
    } else if (entry.name === ".DS_Store" || entry.name.startsWith("._")) {
      try { rmSync(full, { force: true }) } catch (e) { console.error("spinosa: failed to clean metadata", full, e) }
    }
  }
}

export function fileSizeBytes(filePath: string): number {
  return statSync(filePath).size
}

export function availableDiskBytes(targetPath: string): number {
  const s = statfsSync(targetPath)
  return s.bavail * s.bsize
}
