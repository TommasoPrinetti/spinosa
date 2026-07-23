import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { writeTextAtomic } from "../utils/fs"

declare const workspaceIDBrand: unique symbol
export type SpinosaWorkspaceID = string & { readonly [workspaceIDBrand]: "SpinosaWorkspaceID" }

const PREFIX = "spw_01_"
const WORKSPACE_ID_RE = /^spw_01_[0-9a-f]{32}$/
const WRK_WORKSPACE_ID_RE = /^wrk_[0-9a-zA-Z]+$/
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

export function parseWrkWorkspaceID(value: string | undefined): string | undefined {
  return value && WRK_WORKSPACE_ID_RE.test(value) ? value : undefined
}

export function createWorkspaceID(): SpinosaWorkspaceID {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return `${PREFIX}${Buffer.from(bytes).toString("hex")}` as SpinosaWorkspaceID
}

export function readWorkspaceIDFromMarker(text: string): SpinosaWorkspaceID | undefined {
  return parseWorkspaceID(text.match(/^workspace_id:\s*(.+)$/m)?.[1]?.trim())
}

export function readWrkWorkspaceIDFromMarker(text: string): string | undefined {
  return parseWrkWorkspaceID(text.match(/^wrk_workspace_id:\s*(.+)$/m)?.[1]?.trim())
}

export function readWorkspaceID(workspacePath: string): SpinosaWorkspaceID | undefined {
  return readWorkspaceIDAt(workspaceMarkerPath(workspacePath))
}

export function readWrkWorkspaceID(workspacePath: string): string | undefined {
  return readWrkWorkspaceIDAt(workspaceMarkerPath(workspacePath))
}

function readWorkspaceIDAt(markerPath: string): SpinosaWorkspaceID | undefined {
  try {
    return readWorkspaceIDFromMarker(readFileSync(markerPath, "utf8"))
  } catch { return }
}

function readWrkWorkspaceIDAt(markerPath: string): string | undefined {
  try {
    return readWrkWorkspaceIDFromMarker(readFileSync(markerPath, "utf8"))
  } catch { return }
}

/** Adds a valid spw_01_* ID to the workspace marker without modifying any other fields.
 *  Safe against concurrent calls: re-reads after write and returns the surviving ID. */
export function ensureWorkspaceID(workspacePath: string): SpinosaWorkspaceID {
  const markerPath = workspaceMarkerPath(workspacePath)
  const existing = readWorkspaceIDAt(markerPath)
  if (existing) return existing

  const workspaceID = createWorkspaceID()
  const text = existsSync(markerPath) ? readFileSync(markerPath, "utf8") : ""
  const updated = text.match(/^workspace_id:\s*.*$/m)
    ? text.replace(/^workspace_id:\s*.*$/m, `workspace_id: ${workspaceID}`)
    : `${text.trimEnd()}${text.trimEnd() ? "\n" : ""}workspace_id: ${workspaceID}\n`
  writeTextAtomic(markerPath, updated)

  // Re-read to handle concurrent write by another process
  return readWorkspaceIDAt(markerPath) ?? workspaceID
}

/** Reads the wrk_workspace_id line from the workspace marker. */
export function readMarkerWrkID(text: string): string | undefined {
  return readWrkWorkspaceIDFromMarker(text)
}

/** Writes (or replaces) the wrk_workspace_id line in the workspace marker.
 *  Safe against concurrent writes via writeTextAtomic rename. */
export function writeMarkerWrkID(workspacePath: string, wrkID: string): void {
  const markerPath = workspaceMarkerPath(workspacePath)
  const text = existsSync(markerPath) ? readFileSync(markerPath, "utf8") : ""
  const updated = text.match(/^wrk_workspace_id:\s*.*$/m)
    ? text.replace(/^wrk_workspace_id:\s*.*$/m, `wrk_workspace_id: ${wrkID}`)
    : `${text.trimEnd()}${text.trimEnd() ? "\n" : ""}wrk_workspace_id: ${wrkID}\n`
  writeTextAtomic(markerPath, updated)
}
