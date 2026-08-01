import type { SpinosaWorkspacePresence } from "@spinosa/core/types"
import type { SpinosaWorkspaceID } from "@spinosa/core/workspace/identity"
import { workspacePresenceLabel } from "@spinosa/core/workspace/presence"
import { truncatePathTail } from "./truncate-path"

export const RECENT_WORKSPACE_COUNT = 4
export const RECENT_WORKSPACE_COUNT_COMPACT = 1

export function recentDisplayCap(compact: boolean): number {
  return compact ? RECENT_WORKSPACE_COUNT_COMPACT : RECENT_WORKSPACE_COUNT
}

export function recentOverflowCount(total: number, visibleCap: number): number {
  return Math.max(0, total - Math.max(0, visibleCap))
}

export function formatRecentWorkspacesLabel(total: number, visibleCap: number): string {
  if (total <= 0) return "Recent workspaces"
  if (recentOverflowCount(total, visibleCap) > 0) return `Recent workspaces (${total})`
  return "Recent workspaces"
}

export function formatRecentLoadError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  const trimmed = detail.trim()
  if (!trimmed) return "Couldn’t load recent workspaces."
  return `Couldn’t load recent workspaces: ${trimmed}`
}

export function formatMaintenanceStalePaths(
  installDirs: string[],
  tempDirs: string[],
  maxListed = 8,
): { count: number; paths: string[]; message: string } {
  const paths = [...installDirs, ...tempDirs]
  const count = paths.length
  const listed = paths.slice(0, Math.max(0, maxListed)).map((path) => truncatePathTail(path, 64))
  const remaining = count - listed.length
  const lines = listed.map((path) => `· ${path}`)
  if (remaining > 0) lines.push(`· …and ${remaining} more`)
  const intro =
    count === 1
      ? "Remove this leftover install/temp path? Your installed Spinosa versions will stay."
      : `Remove these ${count} leftover install/temp paths? Your installed Spinosa versions will stay.`
  return {
    count,
    paths,
    message: lines.length > 0 ? `${intro}\n\n${lines.join("\n")}` : intro,
  }
}

export function formatCompactMaintenanceCue(input: {
  staleCount: number
  repairRequired: boolean
}): string | undefined {
  const parts: string[] = []
  if (input.staleCount > 0) {
    parts.push(
      input.staleCount === 1
        ? "1 leftover install path"
        : `${input.staleCount} leftover install paths`,
    )
  }
  if (input.repairRequired) parts.push("runtime needs repair")
  if (parts.length === 0) return undefined
  return `Maintenance: ${parts.join(" · ")}`
}

export function formatRepairVersionUnknownMessage(): string {
  return "Can’t repair runtime: Spinosa version unknown. Restart Spinosa or reinstall, then try again."
}

export function humanizeWorkspacePresence(presence?: SpinosaWorkspacePresence): string {
  const label = workspacePresenceLabel(presence)
  if (!label) return "unavailable"
  if (label === "NON EXISTENT") return "not found"
  return label.toLowerCase().replaceAll("_", " ")
}

export function formatOpenWorkspaceFailureMessage(input: {
  path: string
  presence?: SpinosaWorkspacePresence
  reason?: string
}): string {
  const path = truncatePathTail(input.path, 64)
  const presence = input.presence ? humanizeWorkspacePresence(input.presence) : undefined
  const reason = input.reason?.trim()
  if (reason && presence) return `${path}\n${presence} — ${reason}`
  if (reason) return `${path}\n${reason}`
  if (presence) return `${path}\nPresence: ${presence}`
  return `${path}\nWorkspace couldn’t be opened.`
}

export function isRecoverableOpenFailure(presence?: SpinosaWorkspacePresence): boolean {
  return (
    presence === undefined ||
    presence === "non_existent" ||
    presence === "moved" ||
    presence === "invalid" ||
    presence === "unknown"
  )
}

export type OpenWorkspaceSoftFail = {
  path: string
  name: string
  workspaceID?: SpinosaWorkspaceID
  presence?: SpinosaWorkspacePresence
  reason: string
  recoverable: boolean
}

export function buildOpenWorkspaceSoftFail(input: {
  path: string
  name: string
  workspaceID?: SpinosaWorkspaceID
  presence?: SpinosaWorkspacePresence
  reason: string
}): OpenWorkspaceSoftFail {
  return {
    path: input.path,
    name: input.name,
    workspaceID: input.workspaceID,
    presence: input.presence,
    reason: input.reason,
    recoverable: isRecoverableOpenFailure(input.presence),
  }
}
