import { describe, expect, test } from "bun:test"
import { MockHarness } from "../src/mock"

/**
 * Faux-provider style harness checks for loop-control admission semantics.
 * Keeps spinosa-harness additive — does not pull in the full session runner.
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
})
