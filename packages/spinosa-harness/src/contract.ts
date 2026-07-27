export type HarnessSession = {
  id: string
  workspacePath: string
  title?: string
}

export type HarnessEvent = {
  type: string
  sessionID?: string
  executionID?: string
  detail?: string
  payload?: Record<string, unknown>
}

export type PermissionReply = "allow" | "always" | "reject"

export type HarnessCapabilities = {
  directToolExecution: boolean
  permissions: boolean
  cancellation: boolean
}

export interface SpinosaHarness {
  readonly capabilities: HarnessCapabilities
  createSession(input: { workspacePath: string; title?: string }): Promise<HarnessSession>
  executeAgent(input: { sessionID: string; agent: string; prompt: string; model?: { providerID: string; modelID: string } }): Promise<{ executionID: string }>
  executeTool(input: { sessionID: string; tool: string; arguments: Record<string, unknown> }): Promise<{ output: unknown }>
  streamEvents(input: { sessionID: string; executionID?: string }): AsyncIterable<HarnessEvent>
  replyPermission(input: { requestID: string; reply: PermissionReply }): Promise<void>
  cancelExecution(input: { sessionID: string; executionID?: string }): Promise<void>
  readSession(input: { sessionID: string }): Promise<HarnessSession | undefined>
}
