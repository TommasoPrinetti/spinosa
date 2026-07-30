import { existsSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

/** Runtime dirs/files under SPINOSA_HOME that uninstall removes. Metadata is kept. */
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

/** Framework runtime paths under SPINOSA_HOME (excludes metadata/). */
export function frameworkRuntimeTargets(home: string): UninstallTarget[] {
  return FRAMEWORK_RUNTIME_TARGETS.map((target) => ({
    path: path.join(home, target),
    label: `Framework ${target}`,
  }))
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
 * Remove framework runtime under SPINOSA_HOME and the user launcher shim.
 * Leaves metadata/ (workspaces + config) intact for reinstall.
 */
export function uninstallFrameworkRuntime(home = spinosaHome()): {
  home: string
  removed: UninstallTarget[]
  error?: string
} {
  const validationError = validateSpinosaHome(home)
  if (validationError) return { home, removed: [], error: validationError }

  const markerError = verifySpinosaInstallMarker(home)
  if (markerError) return { home, removed: [], error: markerError }

  const removed = removeUninstallTargets([
    ...frameworkRuntimeTargets(home),
    ...launcherShimTargets(),
  ])
  return { home, removed }
}
