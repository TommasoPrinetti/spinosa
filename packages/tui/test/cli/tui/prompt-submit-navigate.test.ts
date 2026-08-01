import { describe, expect, test } from "bun:test"
import { shouldNavigateBeforePrepare } from "../../../src/util/session-prompt-v2"

// Regression for Home Enter → conversation lag in
// packages/tui/src/component/prompt/index.tsx (`submitInner`).
//
// Before the fix, new-session submit awaited `prepareSpinosaSubmit` (and the
// old 50ms setTimeout) before `route.navigate`. Research-route prepare does
// disk I/O, so the user sat on Home until framing finished.
//
// Contract: as soon as `session.create` returns an id, navigate immediately;
// prepare + prompt admission continue after the route change.

type Timeline = {
  navigatedAt?: number
  preparedAt?: number
  promptedAt?: number
}

type Harness = {
  timeline: Timeline
  createSession(): Promise<string>
  prepare(): Promise<void>
  sendPrompt(sessionID: string): Promise<void>
  navigate(sessionID: string): void
}

function createHarness(opts: { prepareDelayMs: number }): Harness {
  const timeline: Timeline = {}
  let tick = 0
  return {
    timeline,
    async createSession() {
      tick += 1
      return `ses_${tick}`
    },
    async prepare() {
      await Bun.sleep(opts.prepareDelayMs)
      timeline.preparedAt = Date.now()
    },
    async sendPrompt(_sessionID: string) {
      timeline.promptedAt = Date.now()
    },
    navigate(_sessionID: string) {
      timeline.navigatedAt = Date.now()
    },
  }
}

async function submitNewSession(h: Harness) {
  const sessionID = await h.createSession()
  if (shouldNavigateBeforePrepare(false)) {
    h.navigate(sessionID)
  }
  await h.prepare()
  void h.sendPrompt(sessionID)
  if (!shouldNavigateBeforePrepare(false)) {
    h.navigate(sessionID)
  }
}

describe("Prompt.submit new-session navigate", () => {
  test("shouldNavigateBeforePrepare is true only for new sessions", () => {
    expect(shouldNavigateBeforePrepare(false)).toBe(true)
    expect(shouldNavigateBeforePrepare(true)).toBe(false)
  })

  test("navigates before prepare completes", async () => {
    const h = createHarness({ prepareDelayMs: 25 })
    const started = Date.now()
    await submitNewSession(h)

    expect(h.timeline.navigatedAt).toBeDefined()
    expect(h.timeline.preparedAt).toBeDefined()
    expect(h.timeline.navigatedAt!).toBeLessThan(h.timeline.preparedAt!)
    expect(h.timeline.navigatedAt! - started).toBeLessThan(20)
  })
})
