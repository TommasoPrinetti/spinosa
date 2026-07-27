import { AppNodeBuilder } from "@spinosa/kernel-core/effect/app-node-builder"
import { LayerNode } from "@spinosa/kernel-core/effect/layer-node"
import { makeRuntime } from "@spinosa/kernel-core/effect/runtime"
import { Context, Effect, Layer, Schema } from "effect"
import semver from "semver"
import { InstallationChannel, InstallationVersion } from "@spinosa/kernel-core/installation/version"
import { InstallationEvent } from "@spinosa/schema/installation-event"

export type Method = "self-managed" | "unknown"
export type ReleaseType = "patch" | "minor" | "major"
export const Event = InstallationEvent
export const selfManagedMessage = "This local Spinosa build is self-managed; install updates from your Spinosa distribution."

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

const layer = Layer.succeed(
  Service,
  Service.of({
    info: Effect.succeed({ version: InstallationVersion, latest: InstallationVersion }),
    method: Effect.succeed("self-managed" as Method),
    latest: () => Effect.succeed(InstallationVersion),
    upgrade: () => Effect.fail(new UpgradeFailedError({ stderr: selfManagedMessage })),
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [] })
const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((service) => service.latest(...args))
export const method = () => runPromise((service) => service.method)
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((service) => service.upgrade(...args))

export * as Installation from "."
