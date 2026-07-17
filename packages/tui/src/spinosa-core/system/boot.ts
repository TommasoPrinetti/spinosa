import path from "node:path"
import { cleanupStaleInstallDirectories, type SpinosaCleanupResult } from "./maintenance"
import {
  loadRegistry,
  registerWorkspace,
  setWorkspacePresence,
} from "../workspace/registry"
import { inspectWorkspacePresence, type WorkspacePresence } from "../workspace/presence"

export type SpinosaBootOperationStatus = "pending" | "running" | "complete" | "warning" | "error"

export type SpinosaBootOperation = {
  id: "workspace-index" | "maintenance" | "ready"
  label: string
  status: SpinosaBootOperationStatus
  detail?: string
}

export type SpinosaBootHealth = {
  workspaces: Array<WorkspacePresence & { name: string }>
  cleanup: SpinosaCleanupResult
  error?: string
}

export const SPINOSA_BOOT_OPERATIONS: readonly SpinosaBootOperation[] = [
  { id: "maintenance", label: "Cleaning up startup files", status: "pending" },
  { id: "workspace-index", label: "Checking workspace IDs and locations", status: "pending" },
  { id: "ready", label: "Starting Spinosa TUI", status: "pending" },
]

export async function runSpinosaBootHealth(input: {
  searchRoots?: string[]
  onProgress?: (operation: SpinosaBootOperation) => void
  minimumOperationDurationMs?: number
} = {}): Promise<SpinosaBootHealth> {
  const minimumOperationDurationMs = input.minimumOperationDurationMs ?? 1_000
  const operations = new Map(SPINOSA_BOOT_OPERATIONS.map((operation) => [operation.id, operation]))
  const progress = (id: SpinosaBootOperation["id"], status: SpinosaBootOperationStatus, detail?: string) => {
    const next = { ...operations.get(id)!, status, ...(detail ? { detail } : {}) }
    operations.set(id, next)
    input.onProgress?.(next)
  }

  const holdOperation = async (startedAt: number) => {
    const remaining = minimumOperationDurationMs - (Date.now() - startedAt)
    if (remaining > 0) await Bun.sleep(remaining)
  }

  progress("maintenance", "running")
  const maintenanceStartedAt = Date.now()
  let cleanup: SpinosaCleanupResult
  let cleanupError = false
  let indexError: string | undefined
  try {
    cleanup = await cleanupStaleInstallDirectories()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    indexError = detail
    cleanupError = true
    cleanup = {
      installInProgress: false,
      staleInstallDirectories: [],
      staleNodeModulesDirectories: 0,
      dependencyRepairRequired: false,
      removedDirectories: [],
    }
    progress("maintenance", "error", detail)
  }
  await holdOperation(maintenanceStartedAt)
  if (!cleanupError) {
    progress(
      "maintenance",
      cleanup.installInProgress ? "warning" : "complete",
      cleanup.installInProgress
        ? "Install in progress; cleanup deferred"
        : cleanup.removedDirectories.length > 0
          ? `Removed ${cleanup.removedDirectories.length} stale installer director${cleanup.removedDirectories.length === 1 ? "y" : "ies"}`
          : "No stale installer files found",
    )
  }

  progress("workspace-index", "running")
  const workspaceIndexStartedAt = Date.now()
  let entries: Awaited<ReturnType<typeof loadRegistry>>
  try {
    entries = await loadRegistry(undefined, { allowMissingMarker: true })
  } catch (error) {
    indexError ??= error instanceof Error ? error.message : String(error)
    entries = []
    progress("workspace-index", "error", indexError)
  }
  const workspaces: Array<WorkspacePresence & { name: string }> = []
  for (const entry of entries) {
    try {
      const presence = inspectWorkspacePresence({
        workspacePath: entry.path,
        workspaceID: entry.workspaceID,
        searchRoots: [path.dirname(entry.path), ...(input.searchRoots ?? [])],
      })
      workspaces.push({ ...presence, name: entry.name })

      if (presence.status === "moved" && presence.resolvedPath && presence.currentWorkspaceID) {
        await registerWorkspace(presence.resolvedPath, entry.name, undefined, presence.currentWorkspaceID, {
          presence: "present",
          replacePath: entry.path,
        })
        continue
      }

      await setWorkspacePresence({
        workspacePath: entry.path,
        workspaceID: entry.workspaceID,
        presence: presence.status,
      })
    } catch (error) {
      indexError ??= error instanceof Error ? error.message : String(error)
      progress("workspace-index", "warning", `Could not persist ${entry.name || entry.path}: ${indexError}`)
    }
  }

  const missing = workspaces.filter((workspace) => workspace.status === "non_existent").length
  const moved = workspaces.filter((workspace) => workspace.status === "moved").length
  await holdOperation(workspaceIndexStartedAt)
  progress(
    "workspace-index",
    missing > 0 || indexError ? "warning" : "complete",
    `${entries.length} indexed workspace(s) checked; ${missing} NON EXISTENT${moved ? `; ${moved} moved path(s) recovered` : ""}${indexError ? `; ${indexError}` : ""}`,
  )

  progress("ready", "running")
  const readyStartedAt = Date.now()
  await holdOperation(readyStartedAt)
  progress("ready", indexError ? "warning" : "complete", indexError ? "Workspace index needs attention" : "Workspace checks complete")
  return { workspaces, cleanup, ...(indexError ? { error: indexError } : {}) }
}
