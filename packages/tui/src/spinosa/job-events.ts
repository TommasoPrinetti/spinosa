import type { GlobalEvent } from "@spinosa/sdk/v2"
import {
  bridgeJobLog,
  createJobId,
  emitJobCancelled,
  emitJobFinished,
  emitJobStarted,
  type JobEvent,
  type JobEventListener,
} from "@spinosa/core/progress/job-event"
import { ProgressEmitter } from "@spinosa/core/progress/progress"

export type PublishGlobalJobEvent = (input: {
  directory?: string
  workspace?: string
  event: JobEvent
}) => void | Promise<void>

export type ImportJobHandle = {
  jobId: string
  prog: ProgressEmitter
  onJobEvent: JobEventListener
  wrapLog: (onLog?: (msg: string) => void) => (msg: string) => void
  start: (kind?: string, title?: string) => void
  finish: (status?: "completed" | "error", summary?: string) => void
  cancel: () => void
}

/** Build a ProgressEmitter that dual-publishes to local listeners and job bus events. */
export function createImportJob(input: {
  kind?: string
  title?: string
  directory?: string
  workspace?: string
  /** Host callback that publishes onto GlobalBus (worker RPC or in-process). */
  publish?: PublishGlobalJobEvent
  /** Local TUI SDK emitter so in-process subscribers also see events immediately. */
  localEmit?: (event: GlobalEvent) => void
}): ImportJobHandle {
  const kind = input.kind ?? "import"
  const jobId = createJobId(kind)

  const onJobEvent: JobEventListener = (event) => {
    void input.publish?.({
      directory: input.directory,
      workspace: input.workspace,
      event,
    })
    input.localEmit?.({
      directory: input.directory ?? "global",
      workspace: input.workspace,
      payload: event as GlobalEvent["payload"],
    } as GlobalEvent)
  }

  const prog = new ProgressEmitter({ jobId, onJobEvent })

  return {
    jobId,
    prog,
    onJobEvent,
    wrapLog: (onLog) => bridgeJobLog(jobId, onJobEvent, onLog),
    start: (k = kind, title = input.title) => emitJobStarted(onJobEvent, jobId, k, title),
    finish: (status = "completed", summary) => emitJobFinished(onJobEvent, jobId, status, summary),
    cancel: () => emitJobCancelled(onJobEvent, jobId),
  }
}
