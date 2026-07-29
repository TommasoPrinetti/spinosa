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

const BETA_INSTALL_URL = "https://github.com/medialab/spinosa/releases/download/beta/install.sh"
const STABLE_INSTALL_URL = "https://github.com/medialab/spinosa/releases/download/stable/install.sh"
const FETCH_TIMEOUT_MS = 10_000

async function fetchLatestVersion(): Promise<string> {
  const url = InstallationChannel === "stable" ? STABLE_INSTALL_URL : BETA_INSTALL_URL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return InstallationVersion
    const script = await response.text()
    const match = script.match(/^PINNED_VERSION="([^"]+)"/m)
    return match?.[1]?.trim() || InstallationVersion
  } catch {
    return InstallationVersion
  } finally {
    clearTimeout(timer)
  }
}

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
    latest: () => Effect.tryPromise(() => fetchLatestVersion()),
    upgrade: () => Effect.fail(new UpgradeFailedError({ stderr: selfManagedMessage })),
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [] })
const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((service) => service.latest(...args))
export const method = () => runPromise((service) => service.method)
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((service) => service.upgrade(...args))

export * as Installation from "."
