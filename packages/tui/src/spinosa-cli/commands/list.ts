import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import type { SpinosaCliIo } from "../io"
import { emitResult } from "../io"
import { inspectWorkspacePresence, parseWorkspaceID, registryUnescape, readWorkspaceMeta, workspacePresenceLabel } from "../../spinosa-core"

interface WorkspaceEntry {
  path: string
  name: string
  registered: string
  status: string
}

function registryPath(): string {
  const home = process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa")
  return path.join(home, "metadata", "workspaces.txt")
}

async function loadWorkspaces(): Promise<WorkspaceEntry[]> {
  const reg = registryPath()
  if (!existsSync(reg)) return []

  const text = readFileSync(reg, "utf-8")
  const entries: WorkspaceEntry[] = []

  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const parts = line.split("|")
    if (parts.length < 2) continue
    const wsPath = registryUnescape(parts[0]!)
    const wsName = registryUnescape(parts[1]!)
    const registered = parts[2] ?? ""
    const workspaceID = parseWorkspaceID(parts[3])
    let status = "unknown"
    const presence = inspectWorkspacePresence({ workspacePath: wsPath, workspaceID })
    status = workspacePresenceLabel(presence.status) ?? status
    try {
      const meta = await readWorkspaceMeta(wsPath)
      if (meta && presence.status !== "non_existent" && presence.status !== "invalid" && presence.status !== "identity_mismatch") {
        status = meta.setupStatus
      }
    } catch {
      // workspace may have been deleted
    }
    entries.push({ path: wsPath, name: wsName, registered, status })
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
    })),
  }, `${workspaces.length} workspace(s)`)

  return 0
}
