// This file provides a SpinosaHarness implementation that talks to the real kernel.
// It uses the spinosa SDK client to communicate with the kernel over HTTP.
// Use this implementation in production and integration tests.

import { createSpinosaClient } from "@spinosa/sdk/v2"
import type { HarnessCapabilities, HarnessEvent, HarnessSession, PermissionReply, SpinosaHarness } from "./contract"

// The raw result from a kernel API call.
// data is the response payload when the call succeeds.
// error is the error payload when the call fails.
type SpinosaKernelResult = { data?: Record<string, unknown>; error?: unknown }

// The shape of the spinosa kernel client from the SDK.
// Each method maps to a kernel API endpoint.
type SpinosaKernelClient = {
  session: {
    create(input: Record<string, unknown>): Promise<SpinosaKernelResult>
    prompt(input: Record<string, unknown>): Promise<SpinosaKernelResult>
    abort(input: Record<string, unknown>): Promise<SpinosaKernelResult>
    get(input: Record<string, unknown>): Promise<SpinosaKernelResult>
  }
  global: {
    event(input: Record<string, unknown>): Promise<{ stream: AsyncIterable<unknown> }>
  }
  permission: {
    reply(input: Record<string, unknown>): Promise<SpinosaKernelResult>
  }
}

// Cast an unknown value to a record.
// Returns an empty object when the value is not a non-null object.
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

// Extract a required string identifier from a kernel response.
// Throws an error when the identifier is missing or not a string.
function requiredID(value: unknown, label: string): string {
  const id = record(value).id
  if (typeof id !== "string" || !id) throw new Error("SpinosaKernel " + label + " response did not include an id")
  return id
}

// Map a spinosa agent name to a kernel agent name.
// Agents with the "spinosa-" prefix use the "build" agent in the kernel.
// All other agent names pass through unchanged.
function kernelAgent(agent: string): string {
  return agent.startsWith("spinosa-") ? "build" : agent
}

// Build a descriptive error for an agent execution failure.
// The error searches for a message in the kernel error response.
// It searches in the top level, the nested error, and the nested data.
// When a ref is available, it appends the ref to the message.
function executionError(agent: string, executor: string, error: unknown): Error {
  const value = record(error)
  const nested = record(value.error)
  const data = record(value.data)
  const message =
    typeof value.message === "string"
      ? value.message
      : typeof nested.message === "string"
        ? nested.message
        : typeof data.message === "string"
          ? data.message
          : "Unknown kernel error"
  const ref =
    typeof value.ref === "string"
      ? value.ref
      : typeof nested.ref === "string"
        ? nested.ref
        : typeof data.ref === "string"
          ? data.ref
          : undefined
  const details = ref ? ` [ref ${ref}]` : ""

  return new Error(`Spinosa kernel could not execute "${agent}" (kernel agent "${executor}"): ${message}${details}`)
}

// A SpinosaHarness implementation that connects to the real spinosa kernel.
// Use the static create factory method to build an instance with a kernel URL.
// This implementation does not support direct tool execution.
// It supports permission requests and cancellation.
export class SpinosaKernelHarness implements SpinosaHarness {
  readonly capabilities: HarnessCapabilities = { directToolExecution: false, permissions: true, cancellation: true }

  constructor(private readonly client: SpinosaKernelClient) {}

  // Create a new SpinosaKernelHarness from a kernel connection configuration.
  // baseUrl is the URL of the running spinosa kernel.
  // directory is the project directory for the connection (optional).
  // fetch is a custom fetch implementation (optional).
  // headers are custom HTTP headers for the connection (optional).
  static create(input: { baseUrl: string; directory?: string; fetch?: typeof fetch; headers?: RequestInit["headers"] }): SpinosaKernelHarness {
    const client = createSpinosaClient({
      baseUrl: input.baseUrl,
      directory: input.directory,
      fetch: input.fetch,
      headers: input.headers,
    }) as unknown as SpinosaKernelClient
    return new SpinosaKernelHarness(client)
  }

  // Create a new session for a workspace.
  // The kernel creates the session and returns its identifier.
  async createSession(input: { workspacePath: string; title?: string }): Promise<HarnessSession> {
    const response = await this.client.session.create({ directory: input.workspacePath, title: input.title })
    if (response.error) throw new Error("SpinosaKernel could not create a session")
    const data = record(response.data)
    return { id: requiredID(data, "session"), workspacePath: input.workspacePath, title: typeof data.title === "string" ? data.title : input.title }
  }

  // Start an agent execution in a session.
  // The kernel agent name comes from the kernelAgent mapping.
  // The execution identifier is the session identifier.
  async executeAgent(input: {
    sessionID: string
    agent: string
    prompt: string
    system?: string
    synthetic?: boolean
    model?: { providerID: string; modelID: string }
  }): Promise<{ executionID: string }> {
    const executor = kernelAgent(input.agent)
    const response = await this.client.session.prompt({
      sessionID: input.sessionID,
      agent: executor,
      model: input.model,
      ...(input.system ? { system: input.system } : {}),
      parts: [{ type: "text", text: input.prompt, ...(input.synthetic ? { synthetic: true } : {}) }],
    })
    if (response.error) throw executionError(input.agent, executor, response.error)
    return { executionID: input.sessionID }
  }

  // Direct tool execution is not supported by this harness.
  // This method always throws an error.
  async executeTool(): Promise<{ output: unknown }> {
    throw new Error("SpinosaKernelHarness does not expose direct tool execution")
  }

  // Get a stream of events from the kernel global event bus.
  // Events that do not match the session identifier are skipped.
  // The method yields only events for the requested session.
  async *streamEvents(input: { sessionID: string; executionID?: string }): AsyncIterable<HarnessEvent> {
    const events = await this.client.global.event({})
    for await (const event of events.stream) {
      const value = record(event)
      const properties = record(value.properties)
      const sessionID = typeof properties.sessionID === "string" ? properties.sessionID : undefined
      if (sessionID && sessionID !== input.sessionID) continue
      yield {
        type: typeof value.type === "string" ? value.type : "spinosa.event",
        sessionID,
        executionID: input.executionID,
        payload: value,
      }
    }
  }

  // Reply to a permission request.
  // The kernel sends the reply to the waiting permission handler.
  async replyPermission(input: { requestID: string; reply: PermissionReply }): Promise<void> {
    const response = await this.client.permission.reply({ requestID: input.requestID, response: input.reply })
    if (response.error) throw new Error("SpinosaKernel could not reply to the permission request")
  }

  // Cancel an execution in a session.
  // The kernel stops the execution and cleans up resources.
  async cancelExecution(input: { sessionID: string }): Promise<void> {
    const response = await this.client.session.abort({ sessionID: input.sessionID })
    if (response.error) throw new Error("SpinosaKernel could not cancel the execution")
  }

  // Read a session from the kernel.
  // Returns undefined when the session does not exist or the call fails.
  async readSession(input: { sessionID: string }): Promise<HarnessSession | undefined> {
    const response = await this.client.session.get({ sessionID: input.sessionID })
    if (response.error || !response.data) return
    const data = record(response.data)
    const id = typeof data.id === "string" ? data.id : input.sessionID
    const workspacePath = typeof data.directory === "string" ? data.directory : ""
    return { id, workspacePath, title: typeof data.title === "string" ? data.title : undefined }
  }
}
