import { describe, expect, test } from "bun:test"
import { beginExecution, completeExecution, createResearchRun, nextExecution } from "../src"

describe("research runtime", () => {
  test("runs the Q1 chain deterministically", () => {
    let run = createResearchRun({
      id: "run-1",
      workspacePath: "/tmp/workspace",
      prompt: "find evidence",
      route: "Q1",
      createdAt: "2026-07-27T00:00:00.000Z",
    })
    expect(nextExecution(run)?.agent).toBe("spinosa-searcher")
    run = beginExecution(run, "2026-07-27T00:01:00.000Z")
    expect(run.status).toBe("searching")
    run = completeExecution(run, "2026-07-27T00:02:00.000Z")
    expect(nextExecution(run)?.agent).toBe("spinosa-writer")
    run = completeExecution(run)
    run = completeExecution(run)
    run = completeExecution(run)
    expect(run.status).toBe("completed")
  })
})
