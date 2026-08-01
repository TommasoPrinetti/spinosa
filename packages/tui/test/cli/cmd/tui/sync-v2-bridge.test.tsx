/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import type { GlobalEvent } from "@spinosa/sdk/v2"
import { tmpdir } from "../../../fixture/fixture"
import { mount, wait } from "./sync-fixture"

const sessionID = "ses_v2_bridge"
const assistantMessageID = "msg_v2_bridge_assistant"
const reasoningID = "rsn_v2_bridge"
const callID = "call_v2_bridge"

function global(payload: GlobalEvent["payload"]): GlobalEvent {
  return { directory: "/tmp/other", project: "proj_test", payload }
}

describe("tui sync V2 → V1 part bridge", () => {
  test("bridges reasoning and tool events into the legacy part store", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)

    try {
      emit(
        global({
          id: "evt_step",
          type: "session.next.step.started",
          properties: {
            timestamp: 1000,
            sessionID,
            assistantMessageID,
            agent: "build",
            model: { providerID: "test", id: "model" },
          },
        }),
      )
      await wait(() => (sync.data.message[sessionID] ?? []).some((m) => m.id === assistantMessageID))

      emit(
        global({
          id: "evt_rsn_start",
          type: "session.next.reasoning.started",
          properties: {
            timestamp: 1001,
            sessionID,
            assistantMessageID,
            reasoningID,
          },
        }),
      )
      emit(
        global({
          id: "evt_rsn_delta",
          type: "session.next.reasoning.delta",
          properties: {
            timestamp: 1002,
            sessionID,
            assistantMessageID,
            reasoningID,
            delta: "thinking hard",
          },
        }),
      )
      await wait(() => {
        const part = sync.data.part[assistantMessageID]?.find((p) => p.id === reasoningID)
        return part?.type === "reasoning" && part.text === "thinking hard"
      })

      emit(
        global({
          id: "evt_tool_start",
          type: "session.next.tool.input.started",
          properties: {
            timestamp: 1003,
            sessionID,
            assistantMessageID,
            callID,
            name: "bash",
          },
        }),
      )
      emit(
        global({
          id: "evt_tool_called",
          type: "session.next.tool.called",
          properties: {
            timestamp: 1004,
            sessionID,
            assistantMessageID,
            callID,
            tool: "bash",
            input: { command: "echo hi" },
            provider: { executed: true },
          },
        }),
      )
      await wait(() => {
        const part = sync.data.part[assistantMessageID]?.find((p) => p.id === callID)
        return part?.type === "tool" && part.state.status === "running"
      })

      emit(
        global({
          id: "evt_tool_ok",
          type: "session.next.tool.success",
          properties: {
            timestamp: 1005,
            sessionID,
            assistantMessageID,
            callID,
            structured: { title: "echo" },
            content: [{ type: "text", text: "hi" }],
            provider: { executed: true },
          },
        }),
      )
      await wait(() => {
        const part = sync.data.part[assistantMessageID]?.find((p) => p.id === callID)
        return part?.type === "tool" && part.state.status === "completed"
      })

      const reasoning = sync.data.part[assistantMessageID]?.find((p) => p.id === reasoningID)
      const tool = sync.data.part[assistantMessageID]?.find((p) => p.id === callID)
      expect(reasoning).toMatchObject({
        type: "reasoning",
        text: "thinking hard",
      })
      expect(tool).toMatchObject({
        type: "tool",
        tool: "bash",
        callID,
        state: {
          status: "completed",
          output: "hi",
          title: "echo",
        },
      })
    } finally {
      app.renderer.destroy()
    }
  })
})
