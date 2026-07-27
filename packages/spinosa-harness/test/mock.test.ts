import { describe, expect, test } from "bun:test"
import { MockHarness } from "../src"

describe("MockHarness", () => {
  test("creates, executes, streams, and cancels a session", async () => {
    const harness = new MockHarness()
    const session = await harness.createSession({ workspacePath: "/tmp/research" })
    const execution = await harness.executeAgent({ sessionID: session.id, agent: "spinosa-searcher", prompt: "find evidence" })
    const events = []
    for await (const event of harness.streamEvents({ sessionID: session.id, executionID: execution.executionID })) events.push(event)
    await harness.cancelExecution({ sessionID: session.id, executionID: execution.executionID })
    expect(events.map((event) => event.type)).toEqual(["agent.started"])
    expect((await harness.readSession({ sessionID: session.id }))?.workspacePath).toBe("/tmp/research")
  })
})
