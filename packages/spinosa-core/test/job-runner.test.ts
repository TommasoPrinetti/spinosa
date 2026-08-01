import { describe, expect, test, afterEach } from "bun:test"
import { spawn } from "node:child_process"
import { JobRunner } from "../src/progress/job-runner"
import { terminateChild } from "../src/progress/child-kill"
import { listImportProcessors, runImportProcessor } from "../src/import/processors"
import { SpinosaCancellationError } from "../src/import/cancellation"

afterEach(() => {
  JobRunner.reset()
})

describe("JobRunner cancel-by-id", () => {
  test("cancel aborts signal and marks job cancelled", () => {
    const job = JobRunner.register({ kind: "import", title: "test" })
    expect(job.shouldAbort()).toBe(false)
    expect(JobRunner.cancel(job.jobId)).toBe(true)
    expect(job.shouldAbort()).toBe(true)
    expect(job.status()).toBe("cancelled")
    expect(JobRunner.cancel(job.jobId)).toBe(false)
  })

  test("cancel kills registered child process", async () => {
    const job = JobRunner.register({ kind: "ocr", title: "child kill" })
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
      detached: true,
    })
    job.registerChild(child)

    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()))
    expect(JobRunner.cancel(job.jobId)).toBe(true)
    await Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("child not killed in time")), 3000)),
    ])
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })

  test("list and get expose running jobs", () => {
    const a = JobRunner.register({ kind: "import" })
    const b = JobRunner.register({ kind: "research" })
    expect(JobRunner.list().map((j) => j.jobId).sort()).toEqual([a.jobId, b.jobId].sort())
    expect(JobRunner.get(a.jobId)?.kind).toBe("import")
  })
})

describe("terminateChild", () => {
  test("SIGTERM then closes a long-running child", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
      detached: true,
    })
    await terminateChild(child, 500)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })
})

describe("import processor registry", () => {
  test("exposes direct, markitdown, and ocr processors", () => {
    const ids = listImportProcessors().map((p) => p.id)
    expect(ids).toEqual(["direct", "markitdown", "ocr"])
  })

  test("ocr processor respects shouldAbort before work", async () => {
    await expect(
      runImportProcessor("ocr", {
        files: [{ src: "/nope", rel: "x.png", dest: "/nope.md" }],
        logsDir: "/tmp",
        shouldAbort: () => true,
      }),
    ).rejects.toBeInstanceOf(SpinosaCancellationError)
  })
})
