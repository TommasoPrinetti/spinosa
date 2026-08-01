import { describe, expect, test } from "bun:test"
import {
  createJobId,
  emitJobCancelled,
  emitJobFinished,
  emitJobStarted,
  type JobEvent,
} from "../src/progress/job-event"
import { ProgressEmitter } from "../src/progress/progress"
import { consumeOcrWorkerNdjsonLine } from "../src/import/pipeline"

describe("job progress bus bridge", () => {
  test("ProgressEmitter dual-publishes job.progress when jobId + onJobEvent are set", () => {
    const events: JobEvent[] = []
    const prog = new ProgressEmitter({
      jobId: "job_test_1",
      onJobEvent: (e) => events.push(e),
    })
    const local: Array<{ phase: string; current: number }> = []
    prog.on((e) => local.push({ phase: e.phase, current: e.current }))

    prog.file("OCR", 1, 3, "scan.pdf")

    expect(local).toEqual([{ phase: "OCR", current: 1 }])
    expect(events).toEqual([
      {
        type: "job.progress",
        properties: { jobId: "job_test_1", phase: "OCR", current: 1, total: 3, relPath: "scan.pdf" },
      },
    ])
  })

  test("OCR NDJSON file-start/progress drive job.progress via ProgressEmitter bridge", () => {
    const events: JobEvent[] = []
    const jobId = createJobId("ocr")
    const prog = new ProgressEmitter({
      jobId,
      onJobEvent: (e) => events.push(e),
    })
    emitJobStarted((e) => events.push(e), jobId, "import", "OCR batch")

    const state = {
      workerConverted: 0,
      workerSkipped: 0,
      errors: [] as string[],
      fileResults: [] as Array<{ rel: string; ok: boolean; error?: string }>,
      finishedRels: [] as string[],
      inFlightRel: undefined as string | undefined,
    }
    // Mirror processOcr: progress/page events are label-only (numerator = completed).
    let processed = 0
    const total = 1
    const opts = {
      onFileStart: (rel: string) => prog.file("OCR", processed, total, rel, "processing"),
      onPageProgress: (_c: number, _t: number, rel: string, page: string) =>
        prog.file("OCR", processed, total, page ? `${rel} (${page})` : rel, "processing"),
      onProgress: (_c: number, _t: number, rel: string) =>
        prog.file("OCR", processed, total, rel, "processing"),
      onFile: (fr: { rel: string; ok: boolean }) => {
        prog.file("OCR", ++processed, total, fr.rel, fr.ok ? "done" : "failed")
      },
    }

    for (const line of [
      `{"type":"file-start","relPath":"scan.pdf"}`,
      `{"type":"pageProgress","current":1,"total":1,"relPath":"scan.pdf","page":"1/2"}`,
      `{"type":"file","relPath":"scan.pdf","ok":true}`,
      `{"type":"progress","current":1,"total":1,"relPath":"scan.pdf"}`,
      `{"type":"done","converted":1,"skipped":0}`,
    ]) {
      consumeOcrWorkerNdjsonLine(line, state, opts)
    }

    emitJobFinished((e) => events.push(e), jobId, "completed", "1 file")

    expect(events[0]?.type).toBe("job.started")
    expect(events.some((e) => e.type === "job.progress" && e.properties.relPath === "scan.pdf")).toBe(true)
    expect(events.some((e) => e.type === "job.progress" && e.properties.relPath === "scan.pdf (1/2)")).toBe(true)
    // After file done, a late worker progress event must not bump past completed count
    // or overwrite the terminal status with processing.
    const progressEvents = events.filter((e) => e.type === "job.progress")
    expect(progressEvents.every((e) => e.type === "job.progress" && e.properties.current <= 1)).toBe(true)
    expect(processed).toBe(1)
    expect(events.at(-1)).toMatchObject({
      type: "job.finished",
      properties: { jobId, status: "completed", summary: "1 file" },
    })
    expect(state.finishedRels).toEqual(["scan.pdf"])
  })

  test("cancel emits job.cancelled", () => {
    const events: JobEvent[] = []
    const jobId = "job_cancel"
    emitJobCancelled((e) => events.push(e), jobId)
    expect(events).toEqual([{ type: "job.cancelled", properties: { jobId } }])
  })
})
