// This file provides a SpinosaHarness implementation for tests.
// The mock adapter stores sessions and events in memory.
// It does not connect to a real kernel.
// Use this implementation in unit tests and contract tests.

import type { HarnessEvent, HarnessSession, PermissionReply, SpinosaHarness } from "./contract"

// An in-memory SpinosaHarness for testing.
// Sessions are stored in a Map.
// Events are stored in an array.
// The sequence counter generates unique identifiers.
export class MockHarness implements SpinosaHarness {
  readonly capabilities = { directToolExecution: true, permissions: true, cancellation: true }
  readonly events: HarnessEvent[] = []
  readonly executions: Array<{
    sessionID: string
    agent: string
    prompt: string
    system?: string
    synthetic?: boolean
    model?: { providerID: string; modelID: string }
  }> = []
  readonly sessions = new Map<string, HarnessSession>()
  private sequence = 0

  // Create a new session with a mock identifier.
  // The session is stored in the sessions map.
  // A session.created event is pushed to the event list.
  async createSession(input: { workspacePath: string; title?: string }): Promise<HarnessSession> {
    const session = { id: "mock-" + ++this.sequence, workspacePath: input.workspacePath, title: input.title }
    this.sessions.set(session.id, session)
    this.events.push({ type: "session.created", sessionID: session.id })
    return session
  }

  // Start a mock agent execution.
  // The method creates an agent.started event and returns a mock execution identifier.
  async executeAgent(input: {
    sessionID: string
    agent: string
    prompt: string
    system?: string
    synthetic?: boolean
    model?: { providerID: string; modelID: string }
  }): Promise<{ executionID: string }> {
    const executionID = "execution-" + ++this.sequence
    this.executions.push(input)
    this.events.push({ type: "agent.started", sessionID: input.sessionID, executionID, detail: input.agent })
    return { executionID }
  }

  // Execute a mock tool.
  // The method creates a tool.completed event and returns the input arguments as output.
  async executeTool(input: { sessionID: string; tool: string; arguments: Record<string, unknown> }): Promise<{ output: unknown }> {
    this.events.push({ type: "tool.completed", sessionID: input.sessionID, detail: input.tool, payload: input.arguments })
    return { output: input.arguments }
  }

  // Get a stream of stored events for a session.
  // The method filters events by session identifier and optional execution identifier.
  async *streamEvents(input: { sessionID: string; executionID?: string }): AsyncIterable<HarnessEvent> {
    for (const event of this.events) {
      if (event.sessionID === input.sessionID && (!input.executionID || event.executionID === input.executionID)) yield event
    }
  }

  // Reply to a permission request.
  // The method pushes a permission.replied event to the event list.
  async replyPermission(input: { requestID: string; reply: PermissionReply }): Promise<void> {
    this.events.push({ type: "permission.replied", detail: input.requestID + ":" + input.reply })
  }

  // Cancel a mock execution.
  // The method pushes an execution.cancelled event to the event list.
  async cancelExecution(input: { sessionID: string; executionID?: string }): Promise<void> {
    this.events.push({ type: "execution.cancelled", sessionID: input.sessionID, executionID: input.executionID })
  }

  // Read a session from the sessions map.
  // Returns undefined when the session does not exist.
  async readSession(input: { sessionID: string }): Promise<HarnessSession | undefined> {
    return this.sessions.get(input.sessionID)
  }
}
