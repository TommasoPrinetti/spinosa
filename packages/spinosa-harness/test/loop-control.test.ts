import { describe, expect, test } from "bun:test"
import { MockHarness } from "../src/mock"

/**
 * Faux-provider style harness checks for loop-control admission semantics.
 * Keeps spinosa-harness additive — does not pull in the full session runner.
 *
 * Core owns save points / prepareNextTurn / beforeToolCall / busy rejection
 * (see packages/core/test/session-loop-control.test.ts). Here we only assert
 * the harness boundary still admits steer vs queue-style sequential prompts
 * and cancel without a live LLM.
 */
describe("harness loop-control faux provider", () => {
  test("admits steer then queue prompts without dropping either", async () => {
    const harness = new MockHarness()
    const session = await harness.createSession({ workspacePath: "/tmp/ws" })
    await harness.executeAgent({ sessionID: session.id, agent: "build", prompt: "first" })
    await harness.executeAgent({ sessionID: session.id, agent: "build", prompt: "steer" })
    await harness.executeAgent({ sessionID: session.id, agent: "build", prompt: "queued" })
    expect(harness.executions.map((item) => item.prompt)).toEqual(["first", "steer", "queued"])
  })

  test("cancel clears in-flight execution", async () => {
    const harness = new MockHarness()
    const session = await harness.createSession({ workspacePath: "/tmp/ws" })
    const { executionID } = await harness.executeAgent({
      sessionID: session.id,
      agent: "build",
      prompt: "long running",
    })
    await harness.cancelExecution({ sessionID: session.id, executionID })
    const events = []
    for await (const event of harness.streamEvents({ sessionID: session.id })) events.push(event)
    expect(events.some((event) => event.type === "execution.cancelled")).toBe(true)
  })

  test("faux provider records tool skip-style settlement without live LLM", async () => {
    const harness = new MockHarness()
    const session = await harness.createSession({ workspacePath: "/tmp/ws" })
    await harness.executeAgent({ sessionID: session.id, agent: "build", prompt: "use tools" })
    // Simulate beforeToolCall skip: tool never runs; harness still accepts a reply-shaped event.
    const skipped = await harness.executeTool({
      sessionID: session.id,
      tool: "bash",
      arguments: { skipped: true, reason: "beforeToolCall" },
    })
    expect(skipped.output).toMatchObject({ skipped: true, reason: "beforeToolCall" })
    const events = []
    for await (const event of harness.streamEvents({ sessionID: session.id })) events.push(event)
    expect(events.some((event) => event.type === "tool.completed" && event.detail === "bash")).toBe(true)
  })

  test("sequential executions act as turn barriers (save-point style ordering)", async () => {
    const harness = new MockHarness()
    const session = await harness.createSession({ workspacePath: "/tmp/ws" })
    await harness.executeAgent({
      sessionID: session.id,
      agent: "build",
      prompt: "turn-1",
      system: "sys-v1",
    })
    await harness.executeAgent({
      sessionID: session.id,
      agent: "build",
      prompt: "turn-2",
      system: "sys-v2",
    })
    expect(harness.executions.map((item) => item.system)).toEqual(["sys-v1", "sys-v2"])
    // Mid-run mutation of a prior execution record must not rewrite later barriers.
    harness.executions[0]!.system = "mutated"
    expect(harness.executions[1]!.system).toBe("sys-v2")
  })
})
