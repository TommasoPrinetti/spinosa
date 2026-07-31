import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs"
import path from "node:path"

/** Canonical binary-forwarder body embedded in the template pack. */
export const BINARY_WORKSPACE_LAUNCHER = [
  "#!/bin/sh",
  "# Managed by Spinosa binary distribution.",
  "# Forwards to the installed product binary. Never searches version trees or Bun.",
  "set -eu",
  "",
  'home="${SPINOSA_HOME:-$HOME/.spinosa}"',
  'target="$home/bin/spinosa"',
  "",
  'if [ ! -x "$target" ]; then',
  '  echo "spinosa: installed binary is missing or not executable" >&2',
  '  echo "spinosa: re-run the installer to repair the installation" >&2',
  "  exit 1",
  "fi",
  "",
  'exec "$target" "$@"',
  "",
].join("\n")

export function binaryWorkspaceLauncherHash(): string {
  return createHash("sha256").update(BINARY_WORKSPACE_LAUNCHER).digest("hex")
}

const SOURCE_LAUNCHER_MARKERS = [
  "Resolves the framework root and Bun runtime",
  'candidate="${SCRIPT_DIR}/.."',
  "installed_release=false",
  "ensure_opentui_links",
  "packages/spinosa-kernel/src/index.ts",
] as const

export type LauncherOwnership =
  | { status: "missing" }
  | { status: "managed-binary"; path: string }
  | { status: "managed-source"; path: string }
  | { status: "modified"; path: string }
  | { status: "unreadable"; path: string; error: string }

export function classifyWorkspaceLauncher(launcherPath: string): LauncherOwnership {
  if (!existsSync(launcherPath)) return { status: "missing" }
  let body: string
  try {
    body = readFileSync(launcherPath, "utf-8")
  } catch (error) {
    return {
      status: "unreadable",
      path: launcherPath,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const hash = createHash("sha256").update(body).digest("hex")
  if (hash === binaryWorkspaceLauncherHash()) {
    return { status: "managed-binary", path: launcherPath }
  }
  if (body.includes("# Managed by Spinosa binary distribution.")) {
    return { status: "managed-binary", path: launcherPath }
  }

  const sourceHits = SOURCE_LAUNCHER_MARKERS.filter((marker) => body.includes(marker)).length
  if (sourceHits >= 2) {
    return { status: "managed-source", path: launcherPath }
  }

  return { status: "modified", path: launcherPath }
}

export type LauncherMigrationResult = {
  migrated: string[]
  preserved: string[]
  missing: string[]
  errors: string[]
}

export function migrateWorkspaceLaunchers(workspacePaths: readonly string[]): LauncherMigrationResult {
  const result: LauncherMigrationResult = {
    migrated: [],
    preserved: [],
    missing: [],
    errors: [],
  }

  for (const workspace of workspacePaths) {
    const launcherPath = path.join(workspace, ".bin", "spinosa")
    const ownership = classifyWorkspaceLauncher(launcherPath)
    switch (ownership.status) {
      case "missing":
        result.missing.push(workspace)
        try {
          mkdirSync(path.dirname(launcherPath), { recursive: true })
          writeFileSync(launcherPath, BINARY_WORKSPACE_LAUNCHER, { mode: 0o755 })
          chmodSync(launcherPath, 0o755)
          result.migrated.push(launcherPath)
        } catch (error) {
          result.errors.push(
            `${launcherPath}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        break
      case "managed-binary":
        break
      case "managed-source":
        try {
          writeFileSync(launcherPath, BINARY_WORKSPACE_LAUNCHER, { mode: 0o755 })
          chmodSync(launcherPath, 0o755)
          result.migrated.push(launcherPath)
        } catch (error) {
          result.errors.push(
            `${launcherPath}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        break
      case "modified":
        result.preserved.push(launcherPath)
        break
      case "unreadable":
        result.errors.push(`${ownership.path}: ${ownership.error}`)
        result.preserved.push(ownership.path)
        break
    }
  }

  return result
}
