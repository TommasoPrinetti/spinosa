import { bootLog } from "@spinosa/kernel-core/observability/boot-log"
import { makeGlobalNode } from "@spinosa/kernel-core/effect/app-node"
import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "@/lsp/lsp"
import { Snapshot } from "../snapshot"
import * as Project from "./project"
import * as Vcs from "./vcs"
import { InstanceState } from "@/effect/instance-state"
import { ShareNext } from "@/share/share-next"
import { Effect, Layer } from "effect"
import { Config } from "@/config/config"
import { Service } from "./bootstrap-service"

export { Service } from "./bootstrap-service"
export type { Interface } from "./bootstrap-service"

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // Yield each bootstrap dep at layer init so `run` itself has R = never.
    // InstanceStore imports only the lightweight tag from bootstrap-service.ts,
    // so it can depend on bootstrap without importing this implementation graph.
    const config = yield* Config.Service
    const format = yield* Format.Service
    const lsp = yield* LSP.Service
    const plugin = yield* Plugin.Service
    const project = yield* Project.Service
    const shareNext = yield* ShareNext.Service
    const snapshot = yield* Snapshot.Service
    const vcs = yield* Vcs.Service

    const run = Effect.gen(function* () {
      const ctx = yield* InstanceState.context
      yield* Effect.logInfo("bootstrapping", { directory: ctx.directory })
      const t0 = Date.now()

      // everything depends on config so eager load it for nice traces
      const t1 = Date.now()
      yield* config.get()
      bootLog("bootstrap.config", "config.get() done", { elapsedMs: Date.now() - t1 })

      // Plugin can mutate config so it has to be initialized before anything else.
      const t2 = Date.now()
      yield* plugin.init()
      bootLog("bootstrap.plugin", "plugin.init() done", { elapsedMs: Date.now() - t2 })

      // Each service self-manages its own slow work via Effect.forkScoped against
      // its per-instance state scope. We just await materialization here.
      const t3 = Date.now()
      bootLog("bootstrap.init.start", "init all starting")
      yield* Effect.forEach(
        [lsp, shareNext, format, vcs, snapshot, project],
        (s) => s.init().pipe(Effect.catchCause((cause) => Effect.logWarning("init failed", { cause }))),
        { concurrency: "unbounded", discard: true },
      ).pipe(Effect.withSpan("InstanceBootstrap.init"))
      bootLog("bootstrap.init.done", "all service inits completed", { elapsedMs: Date.now() - t3 })

      bootLog("bootstrap.run.done", "InstanceBootstrap.run completed", { totalMs: Date.now() - t0 })
    }).pipe(Effect.withSpan("InstanceBootstrap"))

    return Service.of({ run })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer: layer,
  deps: [Config.node, Format.node, LSP.node, Plugin.node, Project.node, ShareNext.node, Snapshot.node, Vcs.node],
})

export * as InstanceBootstrap from "./bootstrap"
