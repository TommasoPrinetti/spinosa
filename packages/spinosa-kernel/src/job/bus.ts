import { GlobalBus } from "@/bus/global"
import type { JobEvent } from "@spinosa/core/progress/job-event"

export type PublishJobEventInput = {
  directory?: string
  project?: string
  workspace?: string
  event: JobEvent
}

/** Publish a non-durable import/OCR job event onto GlobalBus (SSE + TUI RPC fan-out). */
export function publishJobEvent(input: PublishJobEventInput): void {
  GlobalBus.emit("event", {
    directory: input.directory,
    project: input.project,
    workspace: input.workspace,
    payload: input.event,
  })
}

export * as JobBus from "./bus"
