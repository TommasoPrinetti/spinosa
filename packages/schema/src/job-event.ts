export * as JobEvent from "./job-event"

import { Schema } from "effect"
import { optional } from "./schema"
import { Event } from "./event"

/** Non-durable import/OCR job lifecycle — process-local fan-out via GlobalBus, not SQLite. */

export const Started = Event.define({
  type: "job.started",
  schema: {
    jobId: Schema.String,
    kind: Schema.String,
    title: optional(Schema.String),
  },
})

export const Progress = Event.define({
  type: "job.progress",
  schema: {
    jobId: Schema.String,
    phase: Schema.String,
    current: Schema.Number,
    total: Schema.Number,
    relPath: optional(Schema.String),
    /** Optional per-file lifecycle for TUI accents (backward compatible). */
    status: optional(
      Schema.Literals(["queued", "processing", "done", "failed", "error"] as const),
    ),
  },
})

export const Log = Event.define({
  type: "job.log",
  schema: {
    jobId: Schema.String,
    message: Schema.String,
  },
})

export const Finished = Event.define({
  type: "job.finished",
  schema: {
    jobId: Schema.String,
    status: Schema.Literals(["completed", "error"]),
    summary: optional(Schema.String),
  },
})

export const Cancelled = Event.define({
  type: "job.cancelled",
  schema: {
    jobId: Schema.String,
  },
})

export const Definitions = Event.inventory(Started, Progress, Log, Finished, Cancelled)
