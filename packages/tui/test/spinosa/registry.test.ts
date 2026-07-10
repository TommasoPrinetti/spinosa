import { describe, expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import {
  loadRegistry,
  registerWorkspace,
  registryEscape,
  registryUnescape,
} from "../../src/spinosa-core/workspace/registry"

describe("workspace registry", () => {
  test("round-trips delimiters and line breaks", () => {
    const value = "line one|100%\nline two\r"
    expect(registryUnescape(registryEscape(value))).toBe(value)
    expect(registryEscape(value)).not.toMatch(/[\r\n]/)
  })

  test("keeps every registration from concurrent processes", async () => {
    await using tmp = await tmpdir()
    const spinosaHome = path.join(tmp.path, "home")
    const modulePath = path.resolve(import.meta.dir, "../../src/spinosa-core/workspace/registry.ts")
    const count = 20
    const children = Array.from({ length: count }, (_, index) => Bun.spawn({
      cmd: [
        process.execPath,
        "-e",
        `import { registerWorkspace } from ${JSON.stringify(modulePath)}; await registerWorkspace(${JSON.stringify(path.join(tmp.path, "ws"))} + ${JSON.stringify(String(index))}, ${JSON.stringify("project")} + ${JSON.stringify(String(index))});`,
      ],
      env: { ...process.env, SPINOSA_HOME: spinosaHome },
      stdout: "pipe",
      stderr: "pipe",
    }))

    const exits = await Promise.all(children.map((child) => child.exited))
    expect(exits).toEqual(Array(count).fill(0))
    const entries = await loadRegistry(path.join(spinosaHome, "metadata", "workspaces.txt"), { allowMissingMarker: true })
    expect(entries).toHaveLength(count)
  })

  test("serializes same-process registrations", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      await Promise.all(Array.from({ length: 10 }, (_, index) => registerWorkspace(path.join(tmp.path, `ws-${index}`), `p-${index}`)))
      const entries = await loadRegistry(undefined, { allowMissingMarker: true })
      expect(entries).toHaveLength(10)
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })
})
