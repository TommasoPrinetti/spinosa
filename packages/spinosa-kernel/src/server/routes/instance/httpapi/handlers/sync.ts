import { Workspace } from "@/control-plane/workspace"
import * as InstanceState from "@/effect/instance-state"
import { Session } from "@/session/session"
import { Database } from "@spinosa/kernel-core/database/database"
import { EventV2 } from "@spinosa/kernel-core/event"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventTable } from "@spinosa/kernel-core/event/sql"
import { SessionTable } from "@spinosa/kernel-core/session/sql"
import { asc } from "drizzle-orm"
import { and } from "drizzle-orm"
import { eq } from "drizzle-orm"
import { inArray } from "drizzle-orm"
import { lte } from "drizzle-orm"
import { not } from "drizzle-orm"
import { or } from "drizzle-orm"
import { Effect, Scope } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { HistoryPayload, ReplayPayload, SessionPayload } from "../groups/sync"
import { SessionID } from "@/session/schema"
import { NotFoundError } from "@/storage/storage"

export const syncHandlers = HttpApiBuilder.group(InstanceHttpApi, "sync", (handlers) =>
  Effect.gen(function* () {
    const workspace = yield* Workspace.Service
    const session = yield* Session.Service
    const scope = yield* Scope.Scope
    const events = yield* EventV2Bridge.Service
    const { db } = yield* Database.Service

    const start = Effect.fn("SyncHttpApi.start")(function* () {
      yield* workspace
        .startWorkspaceSyncing((yield* InstanceState.context).project.id)
        .pipe(Effect.ignore, Effect.forkIn(scope))
      return true
    })

    const replay = Effect.fn("SyncHttpApi.replay")(function* (ctx: { payload: typeof ReplayPayload.Type }) {
      const payload: EventV2.SerializedEvent[] = ctx.payload.events.map((event) => ({
        id: event.id,
        aggregateID: event.aggregateID,
        seq: event.seq,
        type: event.type,
        data: { ...event.data },
      }))
      const source = payload[0].aggregateID

      // The requester's project must be allowed to own this aggregate: an
      // existing session must not be claimed by a different project (first-
      // writer-wins must never cross project boundaries).
      const projectID = (yield* InstanceState.context).project.id
      const existing = yield* session.get(SessionID.make(source)).pipe(
        Effect.catchIf(
          (error): error is NotFoundError => NotFoundError.isInstance(error),
          () => Effect.succeed(undefined),
        ),
      )
      if (existing && existing.projectID !== projectID) {
        yield* Effect.logInfo("sync replay refused: aggregate owned by another project", {
          sessionID: source,
          project: projectID,
        })
        return yield* new HttpApiError.BadRequest({})
      }

      yield* Effect.logInfo("sync replay requested", {
        sessionID: source,
        events: payload.length,
        first: payload[0]?.seq,
        last: payload.at(-1)?.seq,
        directory: ctx.payload.directory,
      })
      const ownerID = yield* InstanceState.workspaceID
      yield* events.replayAll(payload, { ownerID, strictOwner: true })
      yield* Effect.logInfo("sync replay complete", {
        sessionID: source,
        events: payload.length,
        first: payload[0]?.seq,
        last: payload.at(-1)?.seq,
      })
      return { sessionID: source }
    })

    const steal = Effect.fn("SyncHttpApi.steal")(function* (ctx: { payload: typeof SessionPayload.Type }) {
      const workspaceID = yield* InstanceState.workspaceID
      if (!workspaceID) return yield* new HttpApiError.BadRequest({})

      const projectID = (yield* InstanceState.context).project.id
      const target = yield* session.get(ctx.payload.sessionID).pipe(
        Effect.catchIf(
          (error): error is NotFoundError => NotFoundError.isInstance(error),
          () => Effect.succeed(undefined),
        ),
      )
      if (!target) return yield* new HttpApiError.BadRequest({})
      if (target.projectID !== projectID) {
        yield* Effect.logError("sync steal rejected: session belongs to another project", {
          sessionID: ctx.payload.sessionID,
          targetProject: target.projectID,
        })
        return yield* new HttpApiError.BadRequest({})
      }

      yield* session.setWorkspace({ sessionID: ctx.payload.sessionID, workspaceID })

      yield* Effect.logInfo("sync session stolen", { sessionID: ctx.payload.sessionID, workspaceID })

      return { sessionID: ctx.payload.sessionID }
    })

    const history = Effect.fn("SyncHttpApi.history")(function* (ctx: { payload: typeof HistoryPayload.Type }) {
      const exclude = Object.entries(ctx.payload)

      // Scope the global event table to the current project: sync history must
      // never enumerate aggregates that belong to other directories on this
      // machine. Sessions the caller knows are still answered in full.
      // scope the global event table to the current project: sync history must
      // never enumerate aggregates that belong to other directories on this
      // machine. Sessions the caller knows are still answered in full.
      const instance = yield* InstanceState.context
      const ownSessions = yield* db
        .select({ id: SessionTable.id })
        .from(SessionTable)
        .where(eq(SessionTable.project_id, instance.project.id))
        .all()
        .pipe(Effect.orDie)
      const ownIDs = ownSessions.map((row) => row.id)

      const inProject = ownIDs.length > 0 ? inArray(EventTable.aggregate_id, ownIDs) : undefined
      const alreadyConsumed =
        exclude.length > 0
          ? not(or(...exclude.map(([id, seq]) => and(eq(EventTable.aggregate_id, id), lte(EventTable.seq, seq))))!)
          : undefined

      return yield* db
        .select()
        .from(EventTable)
        .where(
          and(inProject ?? undefined, alreadyConsumed ?? undefined),
        )
        .orderBy(asc(EventTable.seq))
        .all()
        .pipe(Effect.orDie)
    })

    return handlers.handle("start", start).handle("replay", replay).handle("steal", steal).handle("history", history)
  }),
)
