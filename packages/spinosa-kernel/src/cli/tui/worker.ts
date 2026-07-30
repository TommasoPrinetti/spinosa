import { Server } from "@/server/server"
import { InstanceRuntime } from "@/project/instance-runtime"
import { Rpc } from "@/util/rpc"
import { Config } from "@/config/config"
import { GlobalBus } from "@/bus/global"
import { ServerAuth } from "@/server/auth"
import { writeHeapSnapshot } from "node:v8"
import { Heap } from "@/cli/heap"
import { AppRuntime } from "@/effect/app-runtime"
import { Effect } from "effect"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { bootLog } from "@spinosa/kernel-core/observability/boot-log"

Heap.start()
bootLog("worker.init", "TUI background worker started", { pid: process.pid })

// Heartbeat to prove event loop is alive
setInterval(() => {
  bootLog("worker.alive", "worker event loop running", { rss: process.memoryUsage().rss })
}, 2000)

let fatal = false
const failWorker = (error: unknown) => {
  if (fatal) return
  fatal = true
  const detail = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`Fatal TUI worker error: ${detail}\n`)
  process.exitCode = 1
  queueMicrotask(() => process.exit(1))
}

const onUnhandledRejection = (error: unknown) => failWorker(error)

const onUncaughtException = (error: Error) => failWorker(error)

process.on("unhandledRejection", onUnhandledRejection)
process.on("uncaughtException", onUncaughtException)

// Subscribe to global events and forward them via RPC
GlobalBus.on("event", (event) => {
  Rpc.emit("global.event", event)
})

let server: Awaited<ReturnType<typeof Server.listen>> | undefined

export const rpc = {
  async fetch(input: { url: string; method: string; headers: Record<string, string>; body?: string }) {
    const headers = { ...input.headers }
    const auth = ServerAuth.header()
    if (auth && !headers["authorization"] && !headers["Authorization"]) {
      headers["Authorization"] = auth
    }
    const request = new Request(input.url, {
      method: input.method,
      headers,
      body: input.body,
    })
    bootLog("worker.fetch", "proxying fetch", { url: input.url, method: input.method })
    const response = await Server.Default().app.fetch(request)
    const body = await response.text()
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  },
  snapshot() {
    const result = writeHeapSnapshot("server.heapsnapshot")
    return result
  },
  async server(input: { port: number; hostname: string; mdns?: boolean; cors?: string[] }) {
    if (server) await server.stop(true)
    bootLog("worker.server", "starting server", { port: input.port, hostname: input.hostname })
    server = await Server.listen(input)
    const url = server.url.toString()
    bootLog("worker.server.running", "server is listening", { url })
    return { url }
  },
  async checkUpgrade(input: { directory: string }) {
    bootLog("worker.checkUpgrade", "loading instance (upgrade handled by launch preflight)", { directory: input.directory })
    try {
      await InstanceRuntime.load({ directory: input.directory })
    } catch (e) {
      bootLog("worker.checkUpgrade.load.error", "InstanceRuntime.load failed", { error: String(e) })
    }
  },
  async reload() {
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const cfg = yield* Config.Service
        yield* cfg.invalidate()
        yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
      }),
    )
  },
  async shutdown() {
    bootLog("worker.shutdown", "shutting down worker")
    await InstanceRuntime.disposeAllInstances()
    if (server) await server.stop(true)
    process.off("unhandledRejection", onUnhandledRejection)
    process.off("uncaughtException", onUncaughtException)
    bootLog("worker.shutdown.done", "worker shutdown complete")
  },
}

Rpc.listen(rpc)
