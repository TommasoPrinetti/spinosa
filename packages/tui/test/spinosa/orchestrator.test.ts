import { afterAll, describe, expect, test } from "bun:test"
import { readdirSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { prepareSpinosaSubmit } from "../../src/spinosa/orchestrator"
import { tmpdir } from "../fixture/fixture"
import { mkdir } from "node:fs/promises"

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/workspace-started")

afterAll(() => {
  const reports = path.join(fixture, "agent_reports")
  for (const name of readdirSync(reports)) {
    if (name === "g_20260701-fixture.md") continue
    if (name === "01_fixture-report.md") continue
    if (name === "evidence_packet_20260701-fixture.md") continue
    if (name.startsWith("g_") || name.startsWith("evidence_packet_")) {
      rmSync(path.join(reports, name))
    }
  }
})

describe("prepareSpinosaSubmit", () => {
  test("frames non-fast-path prompts with goal artifact", async () => {
    const prepared = await prepareSpinosaSubmit(fixture, "Find source-grounded evidence for fixture topic")
    expect(prepared.framed).toBe(true)
    expect(prepared.goalPath).toMatch(/^agent_reports\/g_/)
    expect(prepared.text).toContain("<system-reminder>")
    if (prepared.goalPath) {
      expect(await Bun.file(path.join(fixture, prepared.goalPath)).exists()).toBe(true)
    }
  })

  test("skips framing for fast-path prompts", async () => {
    const prepared = await prepareSpinosaSubmit(fixture, "How do I open settings pane?")
    expect(prepared.framed).toBe(false)
    expect(prepared.route).toBe("fast_path")
  })

  test("creates agent_reports when framing a fresh workspace", async () => {
    await using tmp = await tmpdir()
    await mkdir(path.join(tmp.path, ".spinosa"), { recursive: true })
    await Bun.write(path.join(tmp.path, ".spinosa", "workspace"), "setup_status: workspace_started\n")

    const prepared = await prepareSpinosaSubmit(tmp.path, "Compare the evidence in two source documents")

    expect(prepared.framed).toBe(true)
    expect(prepared.goalPath).toBeDefined()
    expect(await Bun.file(path.join(tmp.path, prepared.goalPath!)).exists()).toBe(true)
  })
})
