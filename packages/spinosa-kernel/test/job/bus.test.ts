import { describe, expect, test } from "bun:test"
import { GlobalBus, type GlobalEvent } from "../../src/bus/global"
import { publishJobEvent } from "../../src/job/bus"
import type { JobEvent } from "@spinosa/core/progress/job-event"

describe("JobBus.publishJobEvent", () => {
  test("fans job.progress onto GlobalBus", async () => {
    const seen: GlobalEvent[] = []
    const on = (event: GlobalEvent) => seen.push(event)
    GlobalBus.on("event", on)
    try {
      const event: JobEvent = {
        type: "job.progress",
        properties: {
          jobId: "job_bus_1",
          phase: "OCR",
          current: 2,
          total: 5,
          relPath: "page.pdf",
        },
      }
      publishJobEvent({ directory: "/tmp/ws", event })
      expect(seen).toHaveLength(1)
      expect(seen[0]?.directory).toBe("/tmp/ws")
      expect(seen[0]?.payload.type).toBe("job.progress")
      expect(seen[0]?.payload.properties).toEqual(event.properties)
      expect(typeof seen[0]?.payload.id).toBe("string")
    } finally {
      GlobalBus.off("event", on)
    }
  })
})
