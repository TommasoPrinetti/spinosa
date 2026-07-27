import type { SpinosaCliIo } from "../io"
import { emitResult } from "../io"
import { inspectWorkspacePresence, loadRegistry, readWorkspaceMeta, workspacePresenceLabel } from "@spinosa/core"

interface WorkspaceEntry {
  path: string
  name: string
  registered: string
  status: string
  id?: string
  tags: string[]
}

async function loadWorkspaces(): Promise<WorkspaceEntry[]> {
  const entries: WorkspaceEntry[] = []
  for (const workspace of await loadRegistry(undefined, { allowMissingMarker: true })) {
    let status = workspacePresenceLabel(workspace.presence) ?? workspace.setupStatus
    const presence = inspectWorkspacePresence({ workspacePath: workspace.path, workspaceID: workspace.workspaceID })
    status = workspacePresenceLabel(presence.status) ?? status
    try {
      const meta = await readWorkspaceMeta(workspace.path)
      if (meta && presence.status !== "non_existent" && presence.status !== "invalid" && presence.status !== "identity_mismatch") {
        status = meta.setupStatus
      }
    } catch {
      // workspace may have been deleted
    }
    entries.push({
      path: workspace.path,
      name: workspace.name,
      registered: workspace.registeredAt,
      status,
      ...(workspace.workspaceID ? { id: workspace.workspaceID } : {}),
      tags: workspace.tags,
    })
  }

  return entries
}

export async function runList(io: SpinosaCliIo): Promise<number> {
  const workspaces = await loadWorkspaces()

  if (io.format === "human") {
    if (workspaces.length === 0) {
      io.out("No Spinosa workspaces found.")
      io.out("Create one: spinosa new /path/to/documents")
    } else {
      io.out(`${workspaces.length} workspace(s):`)
      for (const ws of workspaces) {
        io.out(`  ${ws.name}  (${ws.status})  ${ws.path}`)
      }
    }
  }

  emitResult(io, "list", {
    count: workspaces.length,
    workspaces: workspaces.map((w) => ({
      name: w.name,
      path: w.path,
      status: w.status,
      registered: w.registered,
      id: w.id,
      tags: w.tags,
    })),
  }, `${workspaces.length} workspace(s)`)

  return 0
}
