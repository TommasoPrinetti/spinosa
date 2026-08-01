import { describe, expect, test } from "bun:test"
import {
  createPendingSessionID,
  newSessionSubmitPhases,
  shouldNavigateBeforeCreate,
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
// - b17fb079: seed create response before navigate — still blocked on session.create
// - workspace-home fix: seed optimistic session + navigate before session.create
//
// Contract: seed → navigate immediately; create + prepare + prompt continue
// afterward without blocking submit return.

type Timeline = {
  seededAt?: number
  navigatedAt?: number
  createdAt?: number
  preparedAt?: number
  promptedAt?: number
  returnedAt?: number
}

type SessionInfo = { id: string; title: string }

type Harness = {
  timeline: Timeline
  sessions: Map<string, SessionInfo>
  createSession(id: string): Promise<SessionInfo>
  seed(session: SessionInfo): void
  prepare(): Promise<void>
  sendPrompt(sessionID: string): Promise<void>
  navigate(sessionID: string): void
}

function createHarness(opts: { createDelayMs: number; prepareDelayMs: number }): Harness {
  const timeline: Timeline = {}
  const sessions = new Map<string, SessionInfo>()
  return {
    timeline,
    sessions,
    async createSession(id) {
      await Bun.sleep(opts.createDelayMs)
      timeline.createdAt = Date.now()
      return { id, title: "New session" }
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
  const pendingID = createPendingSessionID()
  const optimistic = { id: pendingID, title: "New session" }
  if (shouldSeedSessionBeforeNavigate(false)) {
    h.seed(optimistic)
  }
  if (shouldNavigateBeforeCreate(false)) {
    h.navigate(pendingID)
  }
  // Fire-and-forget create + prepare + prompt (must not gate submit return / navigate).
  void (async () => {
    const session = await h.createSession(pendingID)
    h.seed(session)
    await h.prepare()
    await h.sendPrompt(session.id)
  })()
  h.timeline.returnedAt = Date.now()
}

describe("Prompt.submit new-session navigate", () => {
  test("shouldNavigateBeforePrepare is true only for new sessions", () => {
    expect(shouldNavigateBeforePrepare(false)).toBe(true)
    expect(shouldNavigateBeforePrepare(true)).toBe(false)
    expect(shouldSeedSessionBeforeNavigate(false)).toBe(true)
    expect(shouldSeedSessionBeforeNavigate(true)).toBe(false)
    expect(shouldNavigateBeforeCreate(false)).toBe(true)
    expect(shouldNavigateBeforeCreate(true)).toBe(false)
  })

  test("submit phase order is seed → navigate → create → prepare → prompt", () => {
    expect([...newSessionSubmitPhases()]).toEqual(["seed", "navigate", "create", "prepare", "prompt"])
  })

  test("seeds sync and navigates before create; submit returns without waiting", async () => {
    const h = createHarness({ createDelayMs: 40, prepareDelayMs: 40 })
    const started = Date.now()
    await submitNewSession(h)

    expect(h.timeline.seededAt).toBeDefined()
    expect(h.timeline.navigatedAt).toBeDefined()
    expect(h.timeline.returnedAt).toBeDefined()
    expect(h.timeline.createdAt).toBeUndefined() // create still in flight

    expect(h.timeline.seededAt!).toBeGreaterThanOrEqual(started)
    expect(h.timeline.navigatedAt!).toBeGreaterThanOrEqual(h.timeline.seededAt!)
    expect(h.timeline.navigatedAt! - started).toBeLessThan(20)
    expect(h.timeline.returnedAt! - started).toBeLessThan(20)

    await Bun.sleep(90)
    expect(h.timeline.createdAt).toBeDefined()
    expect(h.timeline.preparedAt).toBeDefined()
    expect(h.timeline.promptedAt).toBeDefined()
    expect(h.timeline.navigatedAt!).toBeLessThan(h.timeline.createdAt!)
    expect(h.timeline.createdAt!).toBeLessThan(h.timeline.preparedAt!)
  })

  test("refuses navigate when session was not seeded (activation gate)", async () => {
    const h = createHarness({ createDelayMs: 1, prepareDelayMs: 1 })
    const session = { id: createPendingSessionID(), title: "New session" }
    expect(() => h.navigate(session.id)).toThrow(/navigate before seed/)
  })
})
