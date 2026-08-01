import type { ChildProcess } from "node:child_process"
import { createJobId } from "./job-event"
import { terminateChild } from "./child-kill"

export type JobStatus = "running" | "cancelling" | "cancelled" | "completed" | "error"

export type JobInfo = {
  jobId: string
  kind: string
  title?: string
  status: JobStatus
  startedAt: number
}

export type RegisteredJob = {
  jobId: string
  kind: string
  title?: string
  status: () => JobStatus
  signal: AbortSignal
  /** Cooperative abort flag (true after cancel()). */
  shouldAbort: () => boolean
  /** Track a child so cancel() can SIGTERM/SIGKILL it. */
  registerChild: (child: ChildProcess) => void
  /** Real cancel-by-id: abort signal + kill children. Returns false if unknown/already terminal. */
  cancel: () => boolean
  finish: (status?: "completed" | "error") => void
}

type InternalJob = {
  info: JobInfo
  controller: AbortController
  children: Set<ChildProcess>
  onCancel?: () => void
}

function createRegistry() {
  const jobs = new Map<string, InternalJob>()

  function register(input: {
    jobId?: string
    kind: string
    title?: string
    onCancel?: () => void
  }): RegisteredJob {
    const jobId = input.jobId ?? createJobId(input.kind)
    const existing = jobs.get(jobId)
    if (existing) {
      // Re-register replaces cancel hook but keeps the same controller/children.
      existing.onCancel = input.onCancel
      return wrap(existing)
    }

    const controller = new AbortController()
    const internal: InternalJob = {
      info: {
        jobId,
        kind: input.kind,
        title: input.title,
        status: "running",
        startedAt: Date.now(),
      },
      controller,
      children: new Set(),
      onCancel: input.onCancel,
    }
    jobs.set(jobId, internal)
    return wrap(internal)
  }

  function wrap(internal: InternalJob): RegisteredJob {
    const { jobId, kind, title } = internal.info
    return {
      jobId,
      kind,
      title,
      status: () => internal.info.status,
      signal: internal.controller.signal,
      shouldAbort: () =>
        internal.info.status === "cancelling" ||
        internal.info.status === "cancelled" ||
        internal.controller.signal.aborted,
      registerChild: (child) => {
        if (internal.info.status !== "running" && internal.info.status !== "cancelling") return
        internal.children.add(child)
        child.once("close", () => internal.children.delete(child))
        // If already cancelling, kill immediately.
        if (internal.info.status === "cancelling" || internal.controller.signal.aborted) {
          void terminateChild(child)
        }
      },
      cancel: () => cancel(jobId),
      finish: (status = "completed") => {
        if (internal.info.status === "cancelled" || internal.info.status === "cancelling") return
        internal.info.status = status
        internal.children.clear()
        // Keep briefly for get/list, then drop.
        setTimeout(() => {
          if (jobs.get(jobId) === internal) jobs.delete(jobId)
        }, 30_000)
      },
    }
  }

  function cancel(jobId: string): boolean {
    const internal = jobs.get(jobId)
    if (!internal) return false
    if (
      internal.info.status === "cancelled" ||
      internal.info.status === "completed" ||
      internal.info.status === "error"
    ) {
      return false
    }

    internal.info.status = "cancelling"
    if (!internal.controller.signal.aborted) {
      try {
        internal.controller.abort()
      } catch {
        // AbortError listeners may throw; ignore.
      }
    }

    const children = [...internal.children]
    for (const child of children) {
      void terminateChild(child)
    }
    try {
      internal.onCancel?.()
    } catch {
      // Caller hooks must not block cancel.
    }

    internal.info.status = "cancelled"
    setTimeout(() => {
      if (jobs.get(jobId) === internal) jobs.delete(jobId)
    }, 30_000)
    return true
  }

  function get(jobId: string): RegisteredJob | undefined {
    const internal = jobs.get(jobId)
    return internal ? wrap(internal) : undefined
  }

  function list(): JobInfo[] {
    return [...jobs.values()].map((j) => ({ ...j.info }))
  }

  /** Test helper — drop all registrations. */
  function reset(): void {
    for (const job of jobs.values()) {
      for (const child of job.children) void terminateChild(child, 200)
    }
    jobs.clear()
  }

  return { register, cancel, get, list, reset }
}

/** Process-local Spinosa job control plane (progress + real cancel-by-id). */
export const JobRunner = createRegistry()
