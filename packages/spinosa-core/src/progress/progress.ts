import type { JobEventListener, FileProgressStatus } from "./job-event"

export type { FileProgressStatus }

export interface ProgressEvent {
  phase: string
  current: number
  total: number
  relPath: string
  status?: FileProgressStatus
}

export type ProgressListener = (e: ProgressEvent) => void

export type ProgressEmitterOptions = {
  /** When set with onJobEvent, each file() also publishes job.progress. */
  jobId?: string
  onJobEvent?: JobEventListener
}

export class ProgressEmitter {
  private listeners = new Set<ProgressListener>()

  constructor(private options?: ProgressEmitterOptions) {}

  on(cb: ProgressListener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  emit(e: ProgressEvent): void {
    for (const cb of this.listeners) cb(e)
  }

  file(
    phase: string,
    current: number,
    total: number,
    relPath: string,
    status?: FileProgressStatus,
  ): void {
    this.emit({ phase, current, total, relPath, ...(status ? { status } : {}) })
    const { jobId, onJobEvent } = this.options ?? {}
    if (jobId && onJobEvent) {
      onJobEvent({
        type: "job.progress",
        properties: {
          jobId,
          phase,
          current,
          total,
          relPath: relPath || undefined,
          ...(status ? { status } : {}),
        },
      })
    }
  }
}
