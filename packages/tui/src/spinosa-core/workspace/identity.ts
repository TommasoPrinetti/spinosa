import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { writeTextAtomic } from "../utils/fs"

declare const workspaceIDBrand: unique symbol
export type SpinosaWorkspaceID = string & { readonly [workspaceIDBrand]: "SpinosaWorkspaceID" }

const PREFIX = "spw_01_"
const WORKSPACE_ID_RE = /^spw_01_[0-9a-f]{32}$/
const MARKER_RELATIVE_PATHS = [
  path.join(".spinosa", "workspace"),
  path.join("spinosa", "workspace"),
  path.join("framework", "spinosa", "workspace"),
]

export function workspaceMarkerPath(workspacePath: string): string {
  const existing = MARKER_RELATIVE_PATHS
    .map((relative) => path.join(workspacePath, relative))
    .find((candidate) => existsSync(candidate))
  return existing ?? path.join(workspacePath, MARKER_RELATIVE_PATHS[0]!)
}

export function parseWorkspaceID(value: string | undefined): SpinosaWorkspaceID | undefined {
  return value && WORKSPACE_ID_RE.test(value) ? value as SpinosaWorkspaceID : undefined
}

export function createWorkspaceID(): SpinosaWorkspaceID {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return `${PREFIX}${Buffer.from(bytes).toString("hex")}` as SpinosaWorkspaceID
}

export function readWorkspaceIDFromMarker(text: string): SpinosaWorkspaceID | undefined {
  return parseWorkspaceID(text.match(/^workspace_id:\s*(.+)$/m)?.[1]?.trim())
}

export function readWorkspaceID(workspacePath: string): SpinosaWorkspaceID | undefined {
  try {
    return readWorkspaceIDFromMarker(readFileSync(workspaceMarkerPath(workspacePath), "utf8"))
  } catch {
    return
  }
}

/** Adds a valid ID to the workspace marker without modifying any other fields. */
export function ensureWorkspaceID(workspacePath: string): SpinosaWorkspaceID {
  const markerPath = workspaceMarkerPath(workspacePath)
  const text = existsSync(markerPath) ? readFileSync(markerPath, "utf8") : ""
  const existing = readWorkspaceIDFromMarker(text)
  if (existing) return existing

  const workspaceID = createWorkspaceID()
  const updated = text.match(/^workspace_id:\s*.*$/m)
    ? text.replace(/^workspace_id:\s*.*$/m, `workspace_id: ${workspaceID}`)
    : `${text.trimEnd()}${text.trimEnd() ? "\n" : ""}workspace_id: ${workspaceID}\n`
  writeTextAtomic(markerPath, updated)
  return workspaceID
}
