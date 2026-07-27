import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { createWorkspaceID, ensureWorkspaceID, parseWorkspaceID, readWorkspaceIDFromMarker } from "@spinosa/core/workspace/identity"

describe("workspace identity", () => {
  test("creates and round-trips strict Spinosa IDs", () => {
    const id = createWorkspaceID()
    expect(id).toMatch(/^spw_01_[0-9a-f]{32}$/)
    expect(parseWorkspaceID(id)).toBe(id)
    expect(readWorkspaceIDFromMarker(`project_name: test\nworkspace_id: ${id}\n`)).toBe(id)
  })

  test("rejects malformed IDs and preserves a valid marker ID", async () => {
    expect(parseWorkspaceID("spw_01_ABC")).toBeUndefined()
    expect(parseWorkspaceID("wrk_01_0123456789abcdef0123456789abcdef")).toBeUndefined()
    await using tmp = await tmpdir()
    const marker = path.join(tmp.path, ".spinosa", "workspace")
    mkdirSync(path.dirname(marker), { recursive: true })
    const id = createWorkspaceID()
    writeFileSync(marker, `project_name: test\nworkspace_id: ${id}\ncustom: retained\n`)
    expect(ensureWorkspaceID(tmp.path)).toBe(id)
    expect(await Bun.file(marker).text()).toContain("custom: retained")
  })
})
