import { describe, expect, test } from "bun:test"
import {
  createPendingSessionID,
  newSessionSubmitPhases,
  shouldNavigateBeforeCreate,
  shouldNavigateBeforePrepare,
  shouldSeedSessionBeforeNavigate,
} from "../../../src/util/session-prompt-v2"

// Regression for Home Enter → conversation lag / bounce in
// packages/tui/src/component/prompt/index.tsx (`submitInner`).
//
// History:
// - Pre-3f97ea0d: awaited prepareSpinosaSubmit (+ 50ms timer) before navigate
// - 3f97ea0d: navigate after create, prepare in background
// - b17fb079: seed create response before navigate
// - navigate-before-create: optimistic client ID → Session session.get 404 → Home
// - current: create → seed → navigate; prepare/prompt stay async after navigate
//
// Contract: await create, seed real session, navigate; then prepare + prompt
// without blocking submit return from that point.

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

function createHarness(opts: { createDelayMs: number; prepareDelayMs: number }): Harness {
  const timeline: Timeline = {}
  const sessions = new Map<string, SessionInfo>()
  let nextID = 0
  return {
    timeline,
    sessions,
    async createSession() {
      await Bun.sleep(opts.createDelayMs)
      timeline.createdAt = Date.now()
      nextID += 1
      return { id: `ses_server_${nextID}`, title: "New session" }
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
      // Session mounts session.get — server must already own this id.
      if (!sessionID.startsWith("ses_server_")) {
        throw new Error("navigate before create: Session session.get would 404")
      }
      timeline.navigatedAt = Date.now()
    },
  }
}

async function submitNewSession(h: Harness): Promise<void> {
  // Mirror shouldNavigateBeforeCreate === false: await create first.
  expect(shouldNavigateBeforeCreate(false)).toBe(false)
  const session = await h.createSession()
  if (shouldSeedSessionBeforeNavigate(false)) {
    h.seed(session)
  }
  if (shouldNavigateBeforePrepare(false)) {
    h.navigate(session.id)
  }
  // Fire-and-forget prepare + prompt after navigate (must not gate return).
  void (async () => {
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
    expect(shouldNavigateBeforeCreate(false)).toBe(false)
    expect(shouldNavigateBeforeCreate(true)).toBe(false)
  })

  test("submit phase order is create → seed → navigate → prepare → prompt", () => {
    expect([...newSessionSubmitPhases()]).toEqual(["create", "seed", "navigate", "prepare", "prompt"])
  })

  test("awaits create, seeds, navigates, then returns without waiting on prepare", async () => {
    const h = createHarness({ createDelayMs: 40, prepareDelayMs: 40 })
    const started = Date.now()
    await submitNewSession(h)

    expect(h.timeline.createdAt).toBeDefined()
    expect(h.timeline.seededAt).toBeDefined()
    expect(h.timeline.navigatedAt).toBeDefined()
    expect(h.timeline.returnedAt).toBeDefined()
    expect(h.timeline.preparedAt).toBeUndefined() // prepare still in flight

    expect(h.timeline.createdAt!).toBeGreaterThanOrEqual(started)
    expect(h.timeline.seededAt!).toBeGreaterThanOrEqual(h.timeline.createdAt!)
    expect(h.timeline.navigatedAt!).toBeGreaterThanOrEqual(h.timeline.seededAt!)
    expect(h.timeline.navigatedAt!).toBeGreaterThanOrEqual(h.timeline.createdAt!)
    expect(h.timeline.returnedAt! - h.timeline.navigatedAt!).toBeLessThan(20)

    await Bun.sleep(90)
    expect(h.timeline.preparedAt).toBeDefined()
    expect(h.timeline.promptedAt).toBeDefined()
    expect(h.timeline.navigatedAt!).toBeLessThan(h.timeline.preparedAt!)
  })

  test("refuses navigate when session was not seeded (activation gate)", async () => {
    const h = createHarness({ createDelayMs: 1, prepareDelayMs: 1 })
    const session = { id: "ses_server_orphan", title: "New session" }
    expect(() => h.navigate(session.id)).toThrow(/navigate before seed/)
  })

  test("refuses navigate with a client-only pending id", async () => {
    const h = createHarness({ createDelayMs: 1, prepareDelayMs: 1 })
    const pending = { id: createPendingSessionID(), title: "New session" }
    h.seed(pending)
    expect(() => h.navigate(pending.id)).toThrow(/navigate before create/)
  })
})
