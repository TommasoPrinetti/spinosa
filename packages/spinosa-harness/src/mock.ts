import type { HarnessEvent, HarnessSession, PermissionReply, SpinosaHarness } from "./contract"

export class MockHarness implements SpinosaHarness {
  readonly capabilities = { directToolExecution: true, permissions: true, cancellation: true }
  readonly events: HarnessEvent[] = []
  readonly sessions = new Map<string, HarnessSession>()
  private sequence = 0

  async createSession(input: { workspacePath: string; title?: string }): Promise<HarnessSession> {
    const session = { id: "mock-" + ++this.sequence, workspacePath: input.workspacePath, title: input.title }
    this.sessions.set(session.id, session)
    this.events.push({ type: "session.created", sessionID: session.id })
    return session
  }

  async executeAgent(input: { sessionID: string; agent: string; prompt: string }): Promise<{ executionID: string }> {
    const executionID = "execution-" + ++this.sequence
    this.events.push({ type: "agent.started", sessionID: input.sessionID, executionID, detail: input.agent })
    return { executionID }
  }

  async executeTool(input: { sessionID: string; tool: string; arguments: Record<string, unknown> }): Promise<{ output: unknown }> {
    this.events.push({ type: "tool.completed", sessionID: input.sessionID, detail: input.tool, payload: input.arguments })
    return { output: input.arguments }
  }

  async *streamEvents(input: { sessionID: string; executionID?: string }): AsyncIterable<HarnessEvent> {
    for (const event of this.events) {
      if (event.sessionID === input.sessionID && (!input.executionID || event.executionID === input.executionID)) yield event
    }
  }

  async replyPermission(input: { requestID: string; reply: PermissionReply }): Promise<void> {
    this.events.push({ type: "permission.replied", detail: input.requestID + ":" + input.reply })
  }

  async cancelExecution(input: { sessionID: string; executionID?: string }): Promise<void> {
    this.events.push({ type: "execution.cancelled", sessionID: input.sessionID, executionID: input.executionID })
  }

  async readSession(input: { sessionID: string }): Promise<HarnessSession | undefined> {
    return this.sessions.get(input.sessionID)
  }
}
