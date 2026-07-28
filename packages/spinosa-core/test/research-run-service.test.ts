import { describe, expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { MockHarness } from "@spinosa/harness"
import { FileResearchRunRepository } from "@spinosa/runtime"
import { ResearchRunService } from "../src"

describe("ResearchRunService", () => {
  async function workspace(): Promise<string> {
    const root = path.join(tmpdir(), "spinosa-run-" + crypto.randomUUID())
    await mkdir(path.join(root, ".spinosa"), { recursive: true })
    await mkdir(path.join(root, "agent_reports"), { recursive: true })
    await Bun.write(path.join(root, ".spinosa", "workspace"), "setup_status: workspace_started\n")
    return root
  }

  test("writes one runtime journal matching goal artifact", async () => {
    const root = await workspace()
    const prepared = await new ResearchRunService().prepare(root, "find evidence about interviews")

    expect(prepared.framed).toBe(true)
    expect(prepared.runID).toBeDefined()
    expect(await Bun.file(path.join(root, ".spinosa", "runs", prepared.runID!, "run.json")).exists()).toBe(true)
    expect(await Bun.file(path.join(root, prepared.goalPath!)).exists()).toBe(true)
  })

  test("advances the complete route through the harness", async () => {
    const root = await workspace()
    const harness = new MockHarness()
    const service = new ResearchRunService(new FileResearchRunRepository(), harness)
    const prepared = await service.prepare(root, "find evidence about interviews")

    await service.execute({
      sessionID: "session-1",
      prepared,
      model: { providerID: "test", modelID: "test" },
    })

    expect(harness.events.filter((event) => event.type === "agent.started").map((event) => event.detail)).toEqual([
      "spinosa-searcher",
      "spinosa-writer",
      "spinosa-verifier",
      "spinosa-evaluator",
    ])
    expect(harness.executions.map((execution) => execution.prompt)).toEqual([
      "find evidence about interviews",
      "Continue with the assigned phase.",
      "Continue with the assigned phase.",
      "Continue with the assigned phase.",
    ])
    expect(harness.executions.map((execution) => execution.synthetic)).toEqual([true, true, true, true])
    expect(harness.executions.map((execution) => execution.silent)).toEqual([true, false, true, true])
    expect(harness.executions.filter((execution) => !execution.silent).map((execution) => execution.agent)).toEqual([
      "spinosa-writer",
    ])
    expect(harness.executions[0].system).toContain("Do not call the Task tool or dispatch subagents")
    const run = await Bun.file(path.join(root, ".spinosa", "runs", prepared.runID!, "run.json")).json()
    expect(run.status).toBe("completed")
  })
})
