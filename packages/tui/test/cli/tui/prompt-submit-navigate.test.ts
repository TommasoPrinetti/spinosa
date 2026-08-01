import { describe, expect, test } from "bun:test"
import {
  newSessionSubmitPhases,
  shouldNavigateBeforePrepare,
  shouldSeedSessionBeforeNavigate,
} from "../../../src/util/session-prompt-v2"

// Regression for Home Enter → conversation lag in
// packages/tui/src/component/prompt/index.tsx (`submitInner`).
//
// History:
// - Pre-3f97ea0d: awaited prepareSpinosaSubmit (+ 50ms timer) before navigate
// - 3f97ea0d: navigate after create, prepare in background — but Session UI stays
//   blank until sync has the session (`<Show when={session()}>`), so activation
//   still felt delayed while waiting for SSE / sync.session.sync
//
// Contract: create → seed sync → navigate immediately; prepare + prompt continue
// afterward without blocking submit return.

type Timeline = {
  createdAt?: number
  seededAt?: number
  navigatedAt?: number
  preparedAt?: number
  promptedAt?: number
  returnedAt?: number
}

type SessionInfo = { id: string; title: string }

type Harness = {
  timeline: Timeline
  sessions: Map<string, SessionInfo>
  createSession(): Promise<SessionInfo>
  seed(session: SessionInfo): void
  prepare(): Promise<void>
  sendPrompt(sessionID: string): Promise<void>
  navigate(sessionID: string): void
}

function createHarness(opts: { prepareDelayMs: number }): Harness {
  const timeline: Timeline = {}
  const sessions = new Map<string, SessionInfo>()
  let tick = 0
  return {
    timeline,
    sessions,
    async createSession() {
      tick += 1
      timeline.createdAt = Date.now()
      return { id: `ses_${tick}`, title: "New session" }
    },
    seed(session) {
      sessions.set(session.id, session)
      timeline.seededAt = Date.now()
    },
    async prepare() {
      await Bun.sleep(opts.prepareDelayMs)
      timeline.preparedAt = Date.now()
    },
    async sendPrompt(_sessionID: string) {
      timeline.promptedAt = Date.now()
    },
    navigate(sessionID: string) {
      // Session route only "activates" when the session is already in sync.
      if (!sessions.has(sessionID)) {
        throw new Error("navigate before seed: Session UI would stay blank")
      }
      timeline.navigatedAt = Date.now()
    },
  }
}

async function submitNewSession(h: Harness): Promise<void> {
  const session = await h.createSession()
  if (shouldSeedSessionBeforeNavigate(false)) {
    h.seed(session)
  }
  if (shouldNavigateBeforePrepare(false)) {
    h.navigate(session.id)
  }
  // Fire-and-forget prepare+prompt (must not gate submit return / navigate).
  void (async () => {
    await h.prepare()
    await h.sendPrompt(session.id)
  })()
  if (!shouldNavigateBeforePrepare(false)) {
    h.navigate(session.id)
  }
  h.timeline.returnedAt = Date.now()
}

describe("Prompt.submit new-session navigate", () => {
  test("shouldNavigateBeforePrepare is true only for new sessions", () => {
    expect(shouldNavigateBeforePrepare(false)).toBe(true)
    expect(shouldNavigateBeforePrepare(true)).toBe(false)
    expect(shouldSeedSessionBeforeNavigate(false)).toBe(true)
    expect(shouldSeedSessionBeforeNavigate(true)).toBe(false)
  })

  test("submit phase order is create → seed → navigate → prepare → prompt", () => {
    expect([...newSessionSubmitPhases()]).toEqual(["create", "seed", "navigate", "prepare", "prompt"])
  })

  test("seeds sync and navigates before prepare; submit returns without waiting", async () => {
    const h = createHarness({ prepareDelayMs: 40 })
    const started = Date.now()
    await submitNewSession(h)

    expect(h.timeline.createdAt).toBeDefined()
    expect(h.timeline.seededAt).toBeDefined()
    expect(h.timeline.navigatedAt).toBeDefined()
    expect(h.timeline.returnedAt).toBeDefined()
    expect(h.timeline.preparedAt).toBeUndefined() // prepare still in flight

    expect(h.timeline.seededAt!).toBeGreaterThanOrEqual(h.timeline.createdAt!)
    expect(h.timeline.navigatedAt!).toBeGreaterThanOrEqual(h.timeline.seededAt!)
    expect(h.timeline.navigatedAt! - started).toBeLessThan(20)
    expect(h.timeline.returnedAt! - started).toBeLessThan(20)

    await Bun.sleep(50)
    expect(h.timeline.preparedAt).toBeDefined()
    expect(h.timeline.promptedAt).toBeDefined()
    expect(h.timeline.navigatedAt!).toBeLessThan(h.timeline.preparedAt!)
  })

  test("refuses navigate when session was not seeded (activation gate)", async () => {
    const h = createHarness({ prepareDelayMs: 1 })
    const session = await h.createSession()
    expect(() => h.navigate(session.id)).toThrow(/navigate before seed/)
  })
})
