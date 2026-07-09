import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { copyFile as copyFileAsync, mkdir as mkdirAsync } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"

import { isCloudStoragePath } from "./path"

const DEFAULT_RETRIES = 3
const CLOUD_TIMEOUT_SEC = 60
const LOCAL_TIMEOUT_SEC = 30

export { isCloudStoragePath }

export function safeCopyTimeoutSecFor(p: string): number {
  return isCloudStoragePath(p) ? CLOUD_TIMEOUT_SEC : LOCAL_TIMEOUT_SEC
}

export interface SafeCopyOptions {
  retries?: number
  onRetry?: (attempt: number, reason: string) => void
}

function safeCopyDelaySec(p: string): number {
  return isCloudStoragePath(p) ? 4 : 2
}

function sleepMs(ms: number): void {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    /* busy wait */
  }
}

function copyFileViaStream(src: string, dest: string): boolean {
  const tmp = dest + ".spinosa-part"
  try {
    mkdirSync(path.dirname(dest), { recursive: true })
    try { unlinkSync(tmp) } catch { /* ignore */ }
    const content = readFileSync(src)
    writeFileSync(tmp, content)
    renameSync(tmp, dest)
    return true
  } catch {
    try { unlinkSync(tmp) } catch { /* ignore */ }
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
      if (copyFileViaStream(src, dest)) return true
      lastReason = "stream copy failed"
    } else {
      try {
        copyFileSync(src, dest)
        return true
      } catch (err) {
        lastReason = String(err)
      }
    }
    if (i >= retries) break
    options?.onRetry?.(i, lastReason)
    sleepMs(delayMs)
    delayMs *= 2
  }
  return false
}

export async function safeCopyAsync(src: string, dest: string, options?: SafeCopyOptions): Promise<boolean> {
  const retries = options?.retries ?? DEFAULT_RETRIES
  let delayMs = safeCopyDelaySec(dest) * 1000
  let lastReason = ""

  await mkdirAsync(path.dirname(dest), { recursive: true })

  for (let i = 1; i <= retries; i++) {
    try {
      await copyFileAsync(src, dest)
      return true
    } catch (err) {
      lastReason = String(err)
    }
    if (i >= retries) break
    options?.onRetry?.(i, lastReason)
    await new Promise((r) => setTimeout(r, delayMs))
    delayMs *= 2
  }
  return false
}

export function safeCopyTree(src: string, dest: string): void {
  const srcReal = path.resolve(src)
  mkdirSync(dest, { recursive: true })

  for (const entry of readdirSync(srcReal, { withFileTypes: true })) {
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) continue

    const srcPath = path.join(srcReal, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isSymbolicLink()) {
      try {
        const target = readlinkSync(srcPath)
        mkdirSync(path.dirname(destPath), { recursive: true })
        try { unlinkSync(destPath) } catch { /* ignore */ }
        symlinkSync(target, destPath)
      } catch {
        /* symlink copy failure */
      }
    } else if (entry.isDirectory()) {
      safeCopyTree(srcPath, destPath)
    } else if (entry.isFile()) {
      safeCopy(srcPath, destPath)
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
      try { rmSync(full, { force: true }) } catch { /* ignore */ }
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
