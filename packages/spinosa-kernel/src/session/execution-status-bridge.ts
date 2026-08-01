import { makeGlobalNode } from "@spinosa/kernel-core/effect/app-node"
import { SessionExecutionStatus } from "@spinosa/kernel-core/session/execution-status"
import { SessionSchema } from "@spinosa/kernel-core/session/schema"
import { SessionStore } from "@spinosa/kernel-core/session/store"
import { Effect, Layer } from "effect"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { SessionStatus } from "./status"
import { SessionID } from "./schema"

/**
 * Publishes V2 SessionExecution busy/idle onto the existing session.status
 * wire contract so TUI ESC/spinner UX stays intact when V2 is the live path.
 *
 * Must use makeGlobalNode (same tag as SessionExecutionStatus.node) so
 * AppNodeBuilder replacements do not throw "Cannot replace … across tags".
 *
 * V2 `/api/session/...` handlers provide LocationServices but not InstanceRef.
 * SessionStatus.set is instance-scoped, so we bind InstanceRef from the
 * session's directory before publishing busy/idle (otherwise wake dies with
 * "InstanceRef not provided" and mid-run steer + ESC status never work).
 */
const layer = Layer.effect(
  SessionExecutionStatus.Service,
  Effect.gen(function* () {
    const status = yield* SessionStatus.Service
    const sessions = yield* SessionStore.Service
    const instances = yield* InstanceStore.Service
    const asSessionID = (sessionID: SessionSchema.ID) => SessionID.make(sessionID)

    const set = (sessionID: SessionSchema.ID, next: SessionStatus.Info) =>
      Effect.gen(function* () {
        const effect = status.set(asSessionID(sessionID), next)
        const existing = yield* InstanceRef
        if (existing) return yield* effect

        const session = yield* sessions.get(sessionID)
        if (!session) return yield* effect

        const ctx = yield* instances.load({ directory: session.location.directory })
        return yield* effect.pipe(
          Effect.provideService(InstanceRef, ctx),
          Effect.provideService(WorkspaceRef, session.location.workspaceID),
        )
      })

    return SessionExecutionStatus.Service.of({
      setBusy: (sessionID) => set(sessionID, { type: "busy" }),
      setIdle: (sessionID) => set(sessionID, { type: "idle" }),
    })
  }),
)

export const node = makeGlobalNode({
  service: SessionExecutionStatus.Service,
  layer,
  deps: [SessionStatus.node, SessionStore.node, InstanceStore.node],
})

export * as SessionExecutionStatusBridge from "./execution-status-bridge"
