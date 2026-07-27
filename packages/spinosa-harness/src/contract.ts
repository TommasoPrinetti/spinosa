// This file defines the contract for the spinosa harness.
// The harness is the boundary between spinosa runtime code and the spinosa kernel.
// All harness implementations must satisfy this contract.
// Kernel-specific types and transports must not leak into this file.

// A session is a container for a conversation with an agent.
// The session has a unique identifier and a path to the workspace.
// The session can have an optional title.
export type HarnessSession = {
  id: string
  workspacePath: string
  title?: string
}

// An event is a message from the kernel during agent execution.
// The event has a type and optional fields for session and execution.
// The payload contains additional data from the kernel.
export type HarnessEvent = {
  type: string
  sessionID?: string
  executionID?: string
  detail?: string
  payload?: Record<string, unknown>
}

// The reply from a user to a permission request.
// "allow" gives permission once.
// "always" gives permission permanently.
// "reject" denies the request.
export type PermissionReply = "allow" | "always" | "reject"

// The capabilities that a harness implementation supports.
// directToolExecution: true if the harness can run tools directly.
// permissions: true if the harness supports permission requests.
// cancellation: true if the harness supports cancellation of executions.
export type HarnessCapabilities = {
  directToolExecution: boolean
  permissions: boolean
  cancellation: boolean
}

// The interface for the spinosa harness.
// Each implementation must provide all the methods in this interface.
// The harness connects the spinosa runtime to the spinosa kernel.
export interface SpinosaHarness {
  // The capabilities of this harness implementation.
  readonly capabilities: HarnessCapabilities

  // Create a new session for a workspace.
  // The workspace path must point to an existing directory.
  // The title is optional.
  createSession(input: { workspacePath: string; title?: string }): Promise<HarnessSession>

  // Start an agent execution in a session.
  // The agent name selects the behavior for the execution.
  // The prompt contains the instructions for the agent.
  // The model is optional. When given, it selects the provider and model.
  executeAgent(input: { sessionID: string; agent: string; prompt: string; model?: { providerID: string; modelID: string } }): Promise<{ executionID: string }>

  // Run a tool directly without an agent.
  // The tool name selects which tool to run.
  // The arguments are the parameters for the tool.
  executeTool(input: { sessionID: string; tool: string; arguments: Record<string, unknown> }): Promise<{ output: unknown }>

  // Get a stream of events for a session.
  // The events arrive asynchronously during agent execution.
  // The executionID is optional. When given, the stream filters to that execution.
  streamEvents(input: { sessionID: string; executionID?: string }): AsyncIterable<HarnessEvent>

  // Reply to a permission request.
  // The requestID identifies the permission request.
  // The reply is the user decision for this request.
  replyPermission(input: { requestID: string; reply: PermissionReply }): Promise<void>

  // Cancel an execution in a session.
  // The executionID is optional. When not given, all executions cancel.
  cancelExecution(input: { sessionID: string; executionID?: string }): Promise<void>

  // Read a session by its identifier.
  // Returns undefined if the session does not exist.
  readSession(input: { sessionID: string }): Promise<HarnessSession | undefined>
}
