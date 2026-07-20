import { describe, expect, test } from "bun:test"
import path from "node:path"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "../fixture/fixture"
import { archiveWorkspaceState } from "../../src/spinosa-core/workspace/archive"

describe("workspace state archive", () => {
  test("moves state to a recoverable path without touching workspace files", async () => {
    await using tmp = await tmpdir()
    const workspace = path.join(tmp.path, "workspace")
    await mkdir(path.join(workspace, ".spinosa"), { recursive: true })
    await mkdir(path.join(workspace, "raw"), { recursive: true })
    await Bun.write(path.join(workspace, ".spinosa", "workspace"), "setup_status: workspace_started\n")
    await Bun.write(path.join(workspace, "raw", "source.md"), "keep\n")

    const archived = archiveWorkspaceState(workspace, 1234)

    expect(archived).toBe(path.join(workspace, ".spinosa.removed-1234"))
    expect(existsSync(path.join(workspace, ".spinosa"))).toBe(false)
    expect(await Bun.file(path.join(archived!, "workspace")).text()).toContain("workspace_started")
    expect(await Bun.file(path.join(workspace, "raw", "source.md")).text()).toBe("keep\n")
  })
})
