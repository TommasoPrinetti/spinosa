import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, utimes } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import {
  cleanupStaleInstallDirectories,
  inspectSpinosaMaintenance,
  MIN_STALE_INSTALL_AGE_MS,
} from "@spinosa/core/system/maintenance"

test("maintenance inspection finds only abandoned installer directories", async () => {
  await using tmp = await tmpdir()
  const versions = path.join(tmp.path, "versions")
  const stale = path.join(versions, ".0.9.0.staging.999999")
  const fresh = path.join(versions, ".0.9.0.backup.999998")
  const release = path.join(versions, "0.9.0")
  await mkdir(path.join(stale, "node_modules"), { recursive: true })
  await mkdir(fresh, { recursive: true })
  await mkdir(release, { recursive: true })
  const old = new Date(Date.now() - MIN_STALE_INSTALL_AGE_MS - 1)
  await utimes(stale, old, old)

  const status = await inspectSpinosaMaintenance({ home: tmp.path, frameworkRoot: release })
  expect(status.staleInstallDirectories).toEqual([stale])
  expect(status.staleNodeModulesDirectories).toBe(1)
  expect(status.dependencyRepairRequired).toBe(true)

  const result = await cleanupStaleInstallDirectories({ home: tmp.path, frameworkRoot: release })
  expect(result.removedDirectories).toEqual([stale])
  expect(existsSync(stale)).toBe(false)
  expect(existsSync(fresh)).toBe(true)
  expect(existsSync(release)).toBe(true)
})

test("maintenance inspection does not clean while an install is active", async () => {
  await using tmp = await tmpdir()
  const versions = path.join(tmp.path, "versions")
  const stale = path.join(versions, ".0.9.0.staging.999999")
  await mkdir(stale, { recursive: true })
  await mkdir(path.join(versions, ".install.lock"), { recursive: true })
  const old = new Date(Date.now() - MIN_STALE_INSTALL_AGE_MS - 1)
  await utimes(stale, old, old)

  const result = await cleanupStaleInstallDirectories({ home: tmp.path })
  expect(result.installInProgress).toBe(true)
  expect(result.removedDirectories).toEqual([])
  expect(existsSync(stale)).toBe(true)
})
