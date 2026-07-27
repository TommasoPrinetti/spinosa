import { createSpinosaClient } from "@spinosa/sdk/v2"
import type { HarnessCapabilities, HarnessEvent, HarnessSession, PermissionReply, SpinosaHarness } from "./contract"

type SpinosaKernelResult = { data?: Record<string, unknown>; error?: unknown }

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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function requiredID(value: unknown, label: string): string {
  const id = record(value).id
  if (typeof id !== "string" || !id) throw new Error("SpinosaKernel " + label + " response did not include an id")
  return id
}

function kernelAgent(agent: string): string {
  return agent.startsWith("spinosa-") ? "build" : agent
}

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

export class SpinosaKernelHarness implements SpinosaHarness {
  readonly capabilities: HarnessCapabilities = { directToolExecution: false, permissions: true, cancellation: true }

  constructor(private readonly client: SpinosaKernelClient) {}

  static create(input: { baseUrl: string; directory?: string; fetch?: typeof fetch; headers?: RequestInit["headers"] }): SpinosaKernelHarness {
    const client = createSpinosaClient({
      baseUrl: input.baseUrl,
      directory: input.directory,
      fetch: input.fetch,
      headers: input.headers,
    }) as unknown as SpinosaKernelClient
    return new SpinosaKernelHarness(client)
  }

  async createSession(input: { workspacePath: string; title?: string }): Promise<HarnessSession> {
    const response = await this.client.session.create({ directory: input.workspacePath, title: input.title })
    if (response.error) throw new Error("SpinosaKernel could not create a session")
    const data = record(response.data)
    return { id: requiredID(data, "session"), workspacePath: input.workspacePath, title: typeof data.title === "string" ? data.title : input.title }
  }

  async executeAgent(input: { sessionID: string; agent: string; prompt: string; model?: { providerID: string; modelID: string } }): Promise<{ executionID: string }> {
    const executor = kernelAgent(input.agent)
    const response = await this.client.session.prompt({
      sessionID: input.sessionID,
      agent: executor,
      model: input.model,
      parts: [{ type: "text", text: input.prompt }],
    })
    if (response.error) throw executionError(input.agent, executor, response.error)
    return { executionID: input.sessionID }
  }

  async executeTool(): Promise<{ output: unknown }> {
    throw new Error("SpinosaKernelHarness does not expose direct tool execution")
  }

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

  async replyPermission(input: { requestID: string; reply: PermissionReply }): Promise<void> {
    const response = await this.client.permission.reply({ requestID: input.requestID, response: input.reply })
    if (response.error) throw new Error("SpinosaKernel could not reply to the permission request")
  }

  async cancelExecution(input: { sessionID: string }): Promise<void> {
    const response = await this.client.session.abort({ sessionID: input.sessionID })
    if (response.error) throw new Error("SpinosaKernel could not cancel the execution")
  }

  async readSession(input: { sessionID: string }): Promise<HarnessSession | undefined> {
    const response = await this.client.session.get({ sessionID: input.sessionID })
    if (response.error || !response.data) return
    const data = record(response.data)
    const id = typeof data.id === "string" ? data.id : input.sessionID
    const workspacePath = typeof data.directory === "string" ? data.directory : ""
    return { id, workspacePath, title: typeof data.title === "string" ? data.title : undefined }
  }
}
