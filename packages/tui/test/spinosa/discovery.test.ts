import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  hasFrameworkMarker,
  resolveFrameworkRoot,
  resolveFrameworkBin,
  installedReleaseVersion,
} from "../../src/spinosa-core/framework/discovery"

let tmpDir: string
let realTmpDir: string
let originalCwd: string

beforeAll(() => {
  originalCwd = process.cwd()
  tmpDir = mkdtempSync(path.join(tmpdir(), "spinosa-test-"))
  realTmpDir = realpathSync(tmpDir) // resolve macOS /var → /private/var

  // Simulate repo structure: root/workspace-template/.spinosa/workspace-files.tsv
  mkdirSync(path.join(tmpDir, "workspace-template", ".spinosa"), { recursive: true })
  writeFileSync(path.join(tmpDir, "workspace-template", ".spinosa", "workspace-files.tsv"), "path\trole\tupdate_policy\n")

  // metadata/version
  mkdirSync(path.join(tmpDir, "metadata"))
  writeFileSync(path.join(tmpDir, "metadata", "version"), "0.8.0-beta.16\n")

  // workspace-template/.bin/spinosa
  mkdirSync(path.join(tmpDir, "workspace-template", ".bin"), { recursive: true })
  writeFileSync(path.join(tmpDir, "workspace-template", ".bin", "spinosa"), "#!/usr/bin/env bash\necho 'spinosa'\n", { mode: 0o755 })
})

afterAll(() => {
  delete process.env.SPINOSA_FRAMEWORK_ROOT
  delete process.env.SPINOSA_TEMPLATE_ROOT
  process.chdir(originalCwd)
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── hasFrameworkMarker ────────────────────────────────────────────────

describe("hasFrameworkMarker", () => {
  test("detects canonical marker (workspace-template/.spinosa/workspace-files.tsv)", () => {
    expect(hasFrameworkMarker(tmpDir)).toBe(true)
  })

  test("detects legacy template-root marker (.spinosa/workspace-files.tsv)", () => {
    const d = mkdtempSync(path.join(tmpdir(), "spinosa-legacy-"))
    mkdirSync(path.join(d, ".spinosa"))
    writeFileSync(path.join(d, ".spinosa", "workspace-files.tsv"), "path\trole\tupdate_policy\n")
    expect(hasFrameworkMarker(d)).toBe(true)
    rmSync(d, { recursive: true, force: true })
  })

  test("returns false for directory without any marker", () => {
    const d = mkdtempSync(path.join(tmpdir(), "spinosa-empty-"))
    expect(hasFrameworkMarker(d)).toBe(false)
    rmSync(d, { recursive: true, force: true })
  })

  test("rejects dir with workspace-template/ but no marker", () => {
    const d = mkdtempSync(path.join(tmpdir(), "spinosa-partial-"))
    mkdirSync(path.join(d, "workspace-template"))
    expect(hasFrameworkMarker(d)).toBe(false)
    rmSync(d, { recursive: true, force: true })
  })
})

// ── resolveFrameworkRoot ──────────────────────────────────────────────

describe("resolveFrameworkRoot", () => {
  test("finds framework root when cwd has the marker (dev mode)", () => {
    process.chdir(tmpDir)
    expect(resolveFrameworkRoot()).toBe(realTmpDir)
  })

  test("finds framework root via SPINOSA_TEMPLATE_ROOT env var", () => {
    process.chdir("/tmp")
    process.env.SPINOSA_TEMPLATE_ROOT = tmpDir
    expect(resolveFrameworkRoot()).toBe(realTmpDir)
    delete process.env.SPINOSA_TEMPLATE_ROOT
  })

  test("uses SPINOSA_TEMPLATE_ROOT even when cwd has the marker", () => {
    process.chdir(tmpDir)
    const alt = mkdtempSync(path.join(tmpdir(), "spinosa-alt-"))
    const realAlt = realpathSync(alt)
    mkdirSync(path.join(alt, "workspace-template", ".spinosa"), { recursive: true })
    writeFileSync(path.join(alt, "workspace-template", ".spinosa", "workspace-files.tsv"), "path\trole\tupdate_policy\n")
    process.env.SPINOSA_TEMPLATE_ROOT = alt
    expect(resolveFrameworkRoot()).toBe(realAlt)
    delete process.env.SPINOSA_TEMPLATE_ROOT
    rmSync(alt, { recursive: true, force: true })
  })
})

// ── resolveFrameworkBin ───────────────────────────────────────────────

describe("resolveFrameworkBin", () => {
  test("finds spinosa binary in workspace-template/.bin/", () => {
    process.chdir(tmpDir)
    expect(resolveFrameworkBin()).toBe(path.join(realTmpDir, "workspace-template", ".bin", "spinosa"))
  })
})

// ── installedReleaseVersion ───────────────────────────────────────────

describe("installedReleaseVersion", () => {
  test("reads version from framework root metadata/version", () => {
    expect(installedReleaseVersion(tmpDir)).toBe("0.8.0-beta.16")
  })

  test("returns empty string when no framework root given", () => {
    expect(installedReleaseVersion(undefined)).toBe("")
  })

  test("returns empty string for non-existent path", () => {
    expect(installedReleaseVersion("/nonexistent/path")).toBe("")
  })
})
