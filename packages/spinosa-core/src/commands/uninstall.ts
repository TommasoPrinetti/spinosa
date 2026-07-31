import { existsSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { BINARY_UNINSTALL_RUNTIME_TARGETS } from "../distribution/contract"

/** @deprecated Prefer BINARY_UNINSTALL_RUNTIME_TARGETS. Legacy source uninstall list. */
export const FRAMEWORK_RUNTIME_TARGETS = ["versions", "bin", "lib", "logs", "env.sh"] as const

export function spinosaHome(): string {
  return process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa")
}

export function validateSpinosaHome(home: string): string | undefined {
  const resolved = path.resolve(home)
  const homeDir = path.resolve(homedir())
  if (!resolved || resolved === "/" || resolved === "." || resolved === ".." || resolved === homeDir) {
    return "refusing unsafe SPINOSA_HOME"
  }
  if (!path.isAbsolute(resolved)) {
    return "SPINOSA_HOME must be an absolute path"
  }
  if (!existsSync(path.join(resolved, "metadata", "config.yaml"))) {
    return "does not look like a Spinosa installation"
  }
  return undefined
}

export function verifySpinosaInstallMarker(home: string): string | undefined {
  const markerPath = path.join(home, "metadata", "config.yaml")
  try {
    const marker = readFileSync(markerPath, "utf-8")
    if (!marker.includes("spinosa") && !marker.includes("SPINOSA")) {
      return `${home} is not a valid Spinosa installation (marker missing)`
    }
  } catch {
    return `Cannot verify Spinosa installation marker at ${markerPath}`
  }
  return undefined
}

export type UninstallTarget = { path: string; label: string }

/**
 * Binary uninstall removes the active binary, template caches, staging, and logs.
 * Legacy `versions/` is preserved unless explicitly requested.
 */
export function frameworkRuntimeTargets(home: string, options?: { purgeLegacyVersions?: boolean }): UninstallTarget[] {
  const targets: UninstallTarget[] = BINARY_UNINSTALL_RUNTIME_TARGETS.map((target) => ({
    path: path.join(home, target),
    label: `Framework ${target}`,
  }))

  // Also clear empty/legacy bin leftovers except we already remove bin/spinosa.
  // Keep bin/bun dormant unless purge is requested with full legacy cleanup.
  if (options?.purgeLegacyVersions) {
    for (const legacy of ["versions", "lib", "env.sh", "bin/bun"] as const) {
      targets.push({ path: path.join(home, legacy), label: `Legacy ${legacy}` })
    }
  }
  return targets
}

/** Common user-level launcher shim written by install.sh. */
export function launcherShimTargets(): UninstallTarget[] {
  return [
    { path: path.join(homedir(), ".local", "bin", "spinosa"), label: "Launcher shim" },
  ]
}

export function removeUninstallTargets(targets: UninstallTarget[]): UninstallTarget[] {
  const removed: UninstallTarget[] = []
  for (const target of targets) {
    if (!existsSync(target.path)) continue
    rmSync(target.path, { recursive: true, force: true })
    removed.push(target)
  }
  return removed
}

/**
 * Remove binary runtime under SPINOSA_HOME and the user launcher shim.
 * Leaves metadata/ and legacy versions/ intact for reinstall / explicit cleanup.
 */
export function uninstallFrameworkRuntime(
  home = spinosaHome(),
  options?: { purgeLegacyVersions?: boolean },
): {
  home: string
  removed: UninstallTarget[]
  error?: string
} {
  const validationError = validateSpinosaHome(home)
  if (validationError) return { home, removed: [], error: validationError }

  const markerError = verifySpinosaInstallMarker(home)
  if (markerError) return { home, removed: [], error: markerError }

  const removed = removeUninstallTargets([
    ...frameworkRuntimeTargets(home, options),
    ...launcherShimTargets(),
  ])
  return { home, removed }
}
