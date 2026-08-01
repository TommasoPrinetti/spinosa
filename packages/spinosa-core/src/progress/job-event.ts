/** Plain job-event payloads for import/OCR progress (mirrors @spinosa/schema JobEvent). */

export type JobEvent =
  | {
      type: "job.started"
      properties: { jobId: string; kind: string; title?: string }
    }
  | {
      type: "job.progress"
      properties: {
        jobId: string
        phase: string
        current: number
        total: number
        relPath?: string
      }
    }
  | {
      type: "job.log"
      properties: { jobId: string; message: string }
    }
  | {
      type: "job.finished"
      properties: { jobId: string; status: "completed" | "error"; summary?: string }
    }
  | {
      type: "job.cancelled"
      properties: { jobId: string }
    }

export type JobEventListener = (event: JobEvent) => void

export function createJobId(kind = "import"): string {
  return `job_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function emitJobStarted(
  onJobEvent: JobEventListener | undefined,
  jobId: string,
  kind: string,
  title?: string,
): void {
  onJobEvent?.({ type: "job.started", properties: { jobId, kind, title } })
}

export function emitJobFinished(
  onJobEvent: JobEventListener | undefined,
  jobId: string,
  status: "completed" | "error",
  summary?: string,
): void {
  onJobEvent?.({ type: "job.finished", properties: { jobId, status, summary } })
}

export function emitJobCancelled(onJobEvent: JobEventListener | undefined, jobId: string): void {
  onJobEvent?.({ type: "job.cancelled", properties: { jobId } })
}

/** Dual-publish log lines to the existing onLog callback and job.log events. */
export function bridgeJobLog(
  jobId: string,
  onJobEvent: JobEventListener | undefined,
  onLog?: (msg: string) => void,
): (msg: string) => void {
  return (msg: string) => {
    onLog?.(msg)
    onJobEvent?.({ type: "job.log", properties: { jobId, message: msg } })
  }
}
