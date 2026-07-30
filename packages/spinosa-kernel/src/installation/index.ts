import { AppNodeBuilder } from "@spinosa/kernel-core/effect/app-node-builder"
import { LayerNode } from "@spinosa/kernel-core/effect/layer-node"
import { makeRuntime } from "@spinosa/kernel-core/effect/runtime"
import { Context, Effect, Layer, Schema } from "effect"
import semver from "semver"
import { InstallationVersion } from "@spinosa/kernel-core/installation/version"
import { InstallationEvent } from "@spinosa/schema/installation-event"
import { spinosaReleaseChannel, resolveReleaseVersionForChannel } from "@spinosa/core/system/channels"
import { upgradeFramework } from "@spinosa/core/commands/upgrade"
import { resolveFrameworkRoot, installedReleaseVersion } from "@spinosa/core/framework/discovery"
import { GlobalBus } from "@/bus/global"

export type Method = "self-managed" | "unknown"
export type ReleaseType = "patch" | "minor" | "major"
export const Event = InstallationEvent

export function getReleaseType(current: string, latest: string): ReleaseType {
  if (semver.major(latest) > semver.major(current)) return "major"
  if (semver.minor(latest) > semver.minor(current)) return "minor"
  return "patch"
}

export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {}

export interface Interface {
  info: Effect.Effect<{ version: string; latest: string }>
  method: Effect.Effect<Method>
  latest: (method?: Method) => Effect.Effect<string>
  upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@spinosa/Installation") {}

async function resolveLatestForCurrentChannel(): Promise<string> {
  const channel = await spinosaReleaseChannel()
  const result = await resolveReleaseVersionForChannel(channel)
  return result || InstallationVersion
}

const layer = Layer.succeed(
  Service,
  Service.of({
    info: Effect.tryPromise(async () => {
      const latest = await resolveLatestForCurrentChannel()
      if (latest !== InstallationVersion) {
        GlobalBus.emit("event", {
          directory: "global",
          payload: {
            type: Event.UpdateAvailable.type,
            properties: { version: latest },
          },
        })
      }
      return { version: InstallationVersion, latest }
    }),
    method: Effect.sync((): Method => {
      const templateRoot = process.env.SPINOSA_TEMPLATE_ROOT
      if (templateRoot && installedReleaseVersion(templateRoot)) return "self-managed"
      try {
        const fwRoot = resolveFrameworkRoot()
        if (fwRoot && installedReleaseVersion(fwRoot)) return "self-managed"
      } catch {}
      return "unknown"
    }),
    latest: () => Effect.tryPromise(() => resolveLatestForCurrentChannel()),
    upgrade: (method: Method, target: string) =>
      Effect.tryPromise({
        try: async () => {
          const result = await upgradeFramework({ version: target, yes: true })
          if (!result.success) {
            const detail = result.error?.trim()
            throw new Error(
              detail ||
                (result.newVersion ? `Upgrade to v${result.newVersion} failed` : "Upgrade failed"),
            )
          }
        },
        catch: (error) => new UpgradeFailedError({ stderr: String(error) }),
      }),
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [] })
const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const info = () => runPromise((service) => service.info)
export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((service) => service.latest(...args))
export const method = () => runPromise((service) => service.method)
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((service) => service.upgrade(...args))

export * as Installation from "."
