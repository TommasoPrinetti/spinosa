import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  acquireWorkspaceUpdateLock,
  UPDATE_LOCK_STALE_MS,
} from "../src/system/update-lock"

let testDir = ""

function resetDir() {
  if (testDir) rmSync(testDir, { recursive: true, force: true })
  testDir = mkdtempSync(path.join(tmpdir(), "spinosa-update-lock-"))
  mkdirSync(path.join(testDir, ".spinosa"), { recursive: true })
}

afterEach(() => {
  if (testDir) rmSync(testDir, { recursive: true, force: true })
  testDir = ""
})

function stampLock(mtimeAgeMs: number): void {
  const lockPath = path.join(testDir, ".spinosa", "update.lock")
  mkdirSync(lockPath, { recursive: true })
  const old = new Date(Date.now() - mtimeAgeMs)
  utimesSync(lockPath, old, old)
}

describe("workspace update lock", () => {
  test("acquires, releases and leaves no residue", () => {
    resetDir()
    const lock = acquireWorkspaceUpdateLock(testDir)
    expect(existsSync(path.join(testDir, ".spinosa", "update.lock"))).toBe(true)
    lock.release()
    expect(existsSync(path.join(testDir, ".spinosa", "update.lock"))).toBe(false)
  })

  test("an active owner blocks acquisition until the timeout", () => {
    resetDir()
    const first = acquireWorkspaceUpdateLock(testDir)
    try {
      expect(() => acquireWorkspaceUpdateLock(testDir, { timeoutMs: 300 })).toThrow(
        /already in progress/i,
      )
    } finally {
      first.release()
    }
  })

  test("an owned lock is never stolen even when old", () => {
    resetDir()
    const first = acquireWorkspaceUpdateLock(testDir)
    stampLock(UPDATE_LOCK_STALE_MS + 60_000)
    try {
      // Owner pid is alive → the stale mtime must NOT allow a steal.
      expect(() => acquireWorkspaceUpdateLock(testDir, { timeoutMs: 300 })).toThrow(
        /already in progress/i,
      )
    } finally {
      first.release()
    }
  })

  test("a lock held by a dead process is reaped after the stale horizon", () => {
    resetDir()
    const lockPath = path.join(testDir, ".spinosa", "update.lock")
    mkdirSync(lockPath, { recursive: true })
    // pid 9999999 is virtually never alive on any host.
    writeFileSync(path.join(lockPath, "pid"), "9999999", "utf-8")
    stampLock(UPDATE_LOCK_STALE_MS + 60_000)
    const lock = acquireWorkspaceUpdateLock(testDir)
    lock.release()
    expect(existsSync(lockPath)).toBe(false)
  })

  test("a stale lock without a pid file is reaped", () => {
    resetDir()
    const lockPath = path.join(testDir, ".spinosa", "update.lock")
    mkdirSync(lockPath, { recursive: true })
    stampLock(UPDATE_LOCK_STALE_MS + 60_000)
    const lock = acquireWorkspaceUpdateLock(testDir)
    lock.release()
    expect(existsSync(lockPath)).toBe(false)
  })

  test("release never removes a lock that was taken over", async () => {
    resetDir()
    const lockPath = path.join(testDir, ".spinosa", "update.lock")
    const first = acquireWorkspaceUpdateLock(testDir)
    // Simulate takeover by a different owner while we still hold the lock.
    writeFileSync(path.join(lockPath, "pid"), "1234567", "utf-8")
    first.release()
    // The taken-over lock must survive our release.
    expect(existsSync(lockPath)).toBe(true)
    expect((await Bun.file(path.join(lockPath, "pid")).text()).trim()).toBe("1234567")
  })
})