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
  test("hydrates child sessions from session.created", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)

    try {
      const parentID = "ses_parent_created"
      const childID = "ses_child_created"
      emit(
        global({
          id: "evt_session_created",
          type: "session.created",
          properties: {
            sessionID: childID,
            info: {
              id: childID,
              parentID,
              title: "Inspect (@explore subagent)",
              time: { created: 1, updated: 1 },
              version: "test",
              directory: "/tmp/project",
            },
          },
        }),
      )
      await wait(() => sync.data.session.some((session) => session.id === childID))
      const child = sync.data.session.find((session) => session.id === childID)
      expect(child).toMatchObject({
        id: childID,
        parentID,
        title: "Inspect (@explore subagent)",
      })
    } finally {
      app.renderer.destroy()
    }
  })

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

  test("aliases V2 write path onto filePath and stamps diagnostics for content UI", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)
    const writeCallID = "call_v2_write"

    try {
      emit(
        global({
          id: "evt_step_write",
          type: "session.next.step.started",
          properties: {
            timestamp: 2000,
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
          id: "evt_write_called",
          type: "session.next.tool.called",
          properties: {
            timestamp: 2001,
            sessionID,
            assistantMessageID,
            callID: writeCallID,
            tool: "write",
            input: { path: "notes/hello.md", content: "# hi" },
            provider: { executed: true },
          },
        }),
      )
      await wait(() => {
        const part = sync.data.part[assistantMessageID]?.find((p) => p.id === writeCallID)
        return part?.type === "tool" && part.state.status === "running" && part.state.input?.filePath === "notes/hello.md"
      })

      emit(
        global({
          id: "evt_write_ok",
          type: "session.next.tool.success",
          properties: {
            timestamp: 2002,
            sessionID,
            assistantMessageID,
            callID: writeCallID,
            structured: {
              operation: "write",
              target: "notes/hello.md",
              resource: "notes/hello.md",
              existed: false,
            },
            content: [{ type: "text", text: "Created file successfully: notes/hello.md" }],
            provider: { executed: true },
          },
        }),
      )
      await wait(() => {
        const part = sync.data.part[assistantMessageID]?.find((p) => p.id === writeCallID)
        return part?.type === "tool" && part.state.status === "completed"
      })

      const write = sync.data.part[assistantMessageID]?.find((p) => p.id === writeCallID)
      expect(write?.type).toBe("tool")
      if (write?.type !== "tool") throw new Error("expected tool part")
      expect(write.state.status).toBe("completed")
      if (write.state.status !== "completed") throw new Error("expected completed")
      expect(write.state.input).toEqual({
        path: "notes/hello.md",
        content: "# hi",
        filePath: "notes/hello.md",
      })
      expect(write.state.metadata?.diagnostics).toEqual({ "notes/hello.md": [] })
      expect(write.state.metadata?.operation).toBe("write")
    } finally {
      app.renderer.destroy()
    }
  })

  test("bridges compaction, shell, and retry into the legacy store", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)
    const compactionMessageID = "msg_v2_compaction"
    const shellMessageID = "msg_v2_shell"
    const shellCallID = "call_v2_shell"

    try {
      emit(
        global({
          id: "evt_compaction",
          type: "session.next.compaction.ended",
          properties: {
            timestamp: 3000,
            sessionID,
            messageID: compactionMessageID,
            reason: "auto",
            text: "summary",
            recent: "recent",
          },
        }),
      )
      await wait(() => (sync.data.message[sessionID] ?? []).some((m) => m.id === compactionMessageID))
      expect(sync.data.part[compactionMessageID]?.some((p) => p.type === "compaction")).toBe(true)

      emit(
        global({
          id: "evt_shell_start",
          type: "session.next.shell.started",
          properties: {
            timestamp: 3001,
            sessionID,
            messageID: shellMessageID,
            callID: shellCallID,
            command: "ls",
          },
        }),
      )
      await wait(() => {
        const part = sync.data.part[shellMessageID]?.find((p) => p.id === shellCallID)
        return part?.type === "tool" && part.state.status === "running"
      })

      emit(
        global({
          id: "evt_shell_end",
          type: "session.next.shell.ended",
          properties: {
            timestamp: 3002,
            sessionID,
            callID: shellCallID,
            output: "a.ts\n",
          },
        }),
      )
      await wait(() => {
        const part = sync.data.part[shellMessageID]?.find((p) => p.id === shellCallID)
        return part?.type === "tool" && part.state.status === "completed"
      })
      const shell = sync.data.part[shellMessageID]?.find((p) => p.id === shellCallID)
      expect(shell?.type).toBe("tool")
      if (shell?.type === "tool" && shell.state.status === "completed") {
        expect(shell.tool).toBe("bash")
        expect(shell.state.output).toBe("a.ts\n")
      }

      emit(
        global({
          id: "evt_retried",
          type: "session.next.retried",
          properties: {
            timestamp: 3003,
            sessionID,
            attempt: 2,
            error: {
              name: "APIError",
              message: "rate limited",
              statusCode: 429,
              isRetryable: true,
            },
          },
        }),
      )
      await wait(() => sync.data.session_status[sessionID]?.type === "retry")
      expect(sync.data.session_status[sessionID]).toMatchObject({
        type: "retry",
        attempt: 2,
        message: "rate limited",
      })
    } finally {
      app.renderer.destroy()
    }
  })
})
