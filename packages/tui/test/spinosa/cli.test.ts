import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { parseSpinosaCliArgs, runSpinosaCli } from "../../src/spinosa-cli"
import { readFileSync } from "node:fs"

const repoRoot = path.resolve(import.meta.dir, "../../../..")
const EXPECTED_VERSION = "0.9.0-beta.4"

function capture() {
  const output: string[] = []
  const errors: string[] = []
  return {
    output,
    errors,
    io: {
      out: (message: string) => { output.push(message) },
      error: (message: string) => { errors.push(message) },
      format: "human" as const,
    },
  }
}

describe("Spinosa CLI", () => {
  test("parses option order and explicit upgrade values", () => {
    const parsed = parseSpinosaCliArgs(["--yes", "--version", "1.2.3", "--channel=beta"])
    expect(parsed.flags.has("yes")).toBe(true)
    expect(parsed.values.get("version")).toBe("1.2.3")
    expect(parsed.values.get("channel")).toBe("beta")
  })

  test("prints repository version", async () => {
    const originalRoot = process.env.SPINOSA_TEMPLATE_ROOT
    process.env.SPINOSA_TEMPLATE_ROOT = repoRoot
    const result = capture()
    try {
      expect(await runSpinosaCli(["version"], result.io)).toBe(0)
      expect(result.output).toEqual([`spinosa ${EXPECTED_VERSION}`])
    } finally {
      if (originalRoot === undefined) delete process.env.SPINOSA_TEMPLATE_ROOT
      else process.env.SPINOSA_TEMPLATE_ROOT = originalRoot
    }
  })

  test("returns nonzero for missing create source", async () => {
    const result = capture()
    expect(await runSpinosaCli(["create", "/definitely/missing"], result.io)).toBe(1)
    expect(result.errors[0]).toContain("does not exist")
  })

  test("rejects unknown options and accepts subcommand help without side effects", async () => {
    const unknown = capture()
    expect(await runSpinosaCli(["doctor", "--bogus"], unknown.io)).toBe(1)
    expect(unknown.errors[0]).toContain("Unknown option")

    const help = capture()
    expect(await runSpinosaCli(["upgrade", "--help"], help.io)).toBe(0)
    expect(help.output.join("\n")).toContain("spinosa upgrade")
  })

  test("launcher dispatches version instead of treating it as a project path", async () => {
    await using tmp = await tmpdir()
    const spawned = Bun.spawnSync({
      cmd: ["bash", path.join(repoRoot, "workspace-template", ".bin", "spinosa"), "version"],
      cwd: repoRoot,
      env: { ...process.env, SPINOSA_HOME: path.join(tmp.path, "home") },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(spawned.exitCode).toBe(0)
    expect(spawned.stdout.toString()).toContain(`spinosa ${EXPECTED_VERSION}`)
    expect(spawned.stderr.toString()).not.toContain("Failed to change directory")
  })

  test("uninstall help never removes files", async () => {
    await using tmp = await tmpdir()
    const sentinel = path.join(tmp.path, "keep.txt")
    await Bun.write(sentinel, "keep\n")
    const spawned = Bun.spawnSync({
      cmd: ["bash", path.join(repoRoot, "workspace-template", ".bin", "spinosa"), "uninstall", "--help"],
      cwd: repoRoot,
      env: { ...process.env, SPINOSA_HOME: tmp.path },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(spawned.exitCode).toBe(0)
    expect(spawned.stdout.toString()).toContain("spinosa uninstall")
    expect(await Bun.file(sentinel).text()).toBe("keep\n")
  })

  test("uninstall rejects unsafe spinosa home", async () => {
    await using tmp = await tmpdir()
    const sentinel = path.join(tmp.path, "keep.txt")
    await Bun.write(sentinel, "keep\n")
    const spawned = Bun.spawnSync({
      cmd: ["bash", path.join(repoRoot, "workspace-template", ".bin", "spinosa"), "uninstall", "--yes"],
      cwd: repoRoot,
      env: { ...process.env, SPINOSA_HOME: tmp.path },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(spawned.exitCode).toBe(1)
    expect(await Bun.file(sentinel).text()).toBe("keep\n")
    expect(spawned.stderr.toString()).toContain("does not look like a Spinosa installation")
  })

  test("status reports framework info", async () => {
    const originalRoot = process.env.SPINOSA_TEMPLATE_ROOT
    process.env.SPINOSA_TEMPLATE_ROOT = repoRoot
    const result = capture()
    try {
      const code = await runSpinosaCli(["status"], result.io)
      expect(code).toBe(0)
      expect(result.output[0]).toContain("Spinosa")
    } finally {
      if (originalRoot === undefined) delete process.env.SPINOSA_TEMPLATE_ROOT
      else process.env.SPINOSA_TEMPLATE_ROOT = originalRoot
    }
  })

  test("list shows workspaces", async () => {
    const result = capture()
    expect(await runSpinosaCli(["list"], result.io)).toBe(0)
    expect(result.output.length).toBeGreaterThan(0)
  })

  test("help text lists all commands", async () => {
    const result = capture()
    expect(await runSpinosaCli(["help"], result.io)).toBe(0)
    const text = result.output.join("\n")
    expect(text).toContain("spinosa status")
    expect(text).toContain("spinosa list")
    expect(text).toContain("spinosa uninstall")
    expect(text).toContain("--json")
    expect(text).toContain("--quiet")
  })

  test("version-only mode via env", async () => {
    const result = capture()
    expect(await runSpinosaCli(["--version"], result.io)).toBe(0)
    expect(result.output[0]).toMatch(/^spinosa /)
  })
})
