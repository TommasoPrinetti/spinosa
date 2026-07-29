import { bootLog } from "@spinosa/kernel-core/observability/boot-log"
import { AppRuntime } from "@/effect/app-runtime"
import { type InstanceContext } from "./instance-context"
import { InstanceStore, type LoadInput } from "./instance-store"

// Bridge for Promise/ALS callers that cannot yet yield InstanceStore.Service.
// Delete this module once those callers are migrated to Effect boundaries that
// provide InstanceStore directly.

export const load = (input: LoadInput) => {
  bootLog("instance-runtime.load", "InstanceRuntime.load called", { directory: input.directory })
  const t1 = Date.now()
  return AppRuntime.runPromise(
    InstanceStore.Service.use((store) => store.load(input)),
  ).then(
    (ctx) => {
      bootLog("instance-runtime.load.done", "InstanceRuntime.load resolved", { elapsedMs: Date.now() - t1, worktree: ctx.worktree })
      return ctx
    },
    (err) => {
      bootLog("instance-runtime.load.error", "InstanceRuntime.load rejected", { elapsedMs: Date.now() - t1, error: String(err) })
      throw err
    },
  )
}
export const disposeInstance = (ctx: InstanceContext) =>
  AppRuntime.runPromise(InstanceStore.Service.use((store) => store.dispose(ctx)))
export const disposeAllInstances = () => AppRuntime.runPromise(InstanceStore.Service.use((store) => store.disposeAll()))
export const reloadInstance = (input: LoadInput) =>
  AppRuntime.runPromise(InstanceStore.Service.use((store) => store.reload(input)))

export * as InstanceRuntime from "./instance-runtime"
