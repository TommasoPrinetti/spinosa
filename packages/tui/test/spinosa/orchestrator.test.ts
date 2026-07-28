import { afterAll, describe, expect, test } from "bun:test"
import { readdirSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  cancelSpinosaSubmit,
  executeSpinosaSubmit,
  prepareSpinosaSubmit,
} from "../../src/spinosa/orchestrator"
import { tmpdir } from "../fixture/fixture"
import { mkdir } from "node:fs/promises"
import { isSilentResearchAssistant } from "../../src/spinosa/visibility"

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/workspace-started")

afterAll(() => {
  const reports = path.join(fixture, "agent_reports")
  for (const name of readdirSync(reports)) {
    if (name === "g_20260701-fixture.md") continue
    if (name === "01_fixture-report.md") continue
    if (name === "evidence_packet_20260701-fixture.md") continue
    if (name.startsWith("g_") || name.startsWith("evidence_packet_")) {
      rmSync(path.join(reports, name))
    }
  }
  rmSync(path.join(fixture, ".spinosa", "runs"), { recursive: true, force: true })
})

describe("prepareSpinosaSubmit", () => {
  test("frames non-fast-path prompts with goal artifact", async () => {
    const prepared = await prepareSpinosaSubmit(fixture, "Find source-grounded evidence for fixture topic")
    expect(prepared.framed).toBe(true)
    expect(prepared.goalPath).toMatch(/^agent_reports\/g_/)
    expect(prepared.text).toBe("Find source-grounded evidence for fixture topic")
    if (prepared.goalPath) {
      expect(await Bun.file(path.join(fixture, prepared.goalPath)).exists()).toBe(true)
    }
  })

  test("skips framing for fast-path prompts", async () => {
    const prepared = await prepareSpinosaSubmit(fixture, "How do I open settings pane?")
    expect(prepared.framed).toBe(false)
    expect(prepared.route).toBe("fast_path")
  })

  test("sends greetings directly without a runtime preamble", async () => {
    const prepared = await prepareSpinosaSubmit(fixture, "Hi")

    expect(prepared.framed).toBe(false)
    expect(prepared.route).toBe("fast_path")
    expect(prepared.text).toBe("Hi")
  })

  test("keeps ordinary workspace chat out of the research pipeline", async () => {
    for (const prompt of ["Can you help me?", "Write a function", "Good morning", "Fix this typo"]) {
      const prepared = await prepareSpinosaSubmit(fixture, prompt)
      expect(prepared.framed).toBe(false)
      expect(prepared.route).toBe("fast_path")
    }
  })

  test("creates agent_reports when framing a fresh workspace", async () => {
    await using tmp = await tmpdir()
    await mkdir(path.join(tmp.path, ".spinosa"), { recursive: true })
    await Bun.write(path.join(tmp.path, ".spinosa", "workspace"), "setup_status: workspace_started\n")

    const prepared = await prepareSpinosaSubmit(tmp.path, "Compare the evidence in two source documents")

    expect(prepared.framed).toBe(true)
    expect(prepared.goalPath).toBeDefined()
    expect(await Bun.file(path.join(tmp.path, prepared.goalPath!)).exists()).toBe(true)
  })

  test("an older run finishing cannot clear a newer run's cancellation ownership", async () => {
    await using tmp = await tmpdir()
    await mkdir(path.join(tmp.path, ".spinosa"), { recursive: true })
    await Bun.write(path.join(tmp.path, ".spinosa", "workspace"), "setup_status: workspace_started\n")
    const first = await prepareSpinosaSubmit(tmp.path, "Find evidence in the corpus about the first topic")
    const second = await prepareSpinosaSubmit(tmp.path, "Find evidence in the corpus about the second topic")

    let rejectFirst!: (error: Error) => void
    let resolveSecond!: (value: { data: Record<string, unknown> }) => void
    let markFirstStarted!: () => void
    let markSecondStarted!: () => void
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const secondStarted = new Promise<void>((resolve) => {
      markSecondStarted = resolve
    })
    const firstPrompt = new Promise<never>((_, reject) => {
      rejectFirst = reject
    })
    const secondPrompt = new Promise<{ data: Record<string, unknown> }>((resolve) => {
      resolveSecond = resolve
    })
    let aborts = 0
    const client = {
      session: {
        prompt: ({ parts }: { parts: Array<{ text: string }> }) => {
          if (parts[0]?.text.includes("first topic")) {
            markFirstStarted()
            return firstPrompt
          }
          markSecondStarted()
          return secondPrompt
        },
        deleteMessage: async () => ({ data: {} }),
        abort: async () => {
          aborts++
          return { data: {} }
        },
      },
    }
    const model = { providerID: "test", modelID: "test" }
    const oldRun = executeSpinosaSubmit({ client, sessionID: "session-1", prepared: first, model })
    await firstStarted
    const newRun = executeSpinosaSubmit({ client, sessionID: "session-1", prepared: second, model })
    await secondStarted
    expect(aborts).toBe(1)

    rejectFirst(new Error("old run stopped"))
    await oldRun
    expect(await cancelSpinosaSubmit({ client, sessionID: "session-1" })).toBe(true)
    expect(aborts).toBe(2)

    resolveSecond({ data: { info: { id: "msg_second" }, parts: [] } })
    await newRun
  })

  test("hides assistant messages whose research parent is marked silent", () => {
    const parts = {
      user_silent: [{ metadata: { spinosaSilent: true } }],
      user_visible: [{ metadata: {} }],
    }

    expect(isSilentResearchAssistant({ role: "assistant", parentID: "user_silent" }, parts)).toBe(true)
    expect(isSilentResearchAssistant({ role: "assistant", parentID: "user_visible" }, parts)).toBe(false)
    expect(isSilentResearchAssistant({ role: "user", parentID: "user_silent" }, parts)).toBe(false)
  })
})
