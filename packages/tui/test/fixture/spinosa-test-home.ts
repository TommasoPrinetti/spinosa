import { rmSync } from "node:fs"
import { unregisterWorkspace } from "@spinosa/core/workspace/registry"

const createdWorkspacePaths: string[] = []

export function trackCreatedWorkspace(workspacePath: string): void {
  createdWorkspacePaths.push(workspacePath)
}

export async function cleanupCreatedWorkspaces(): Promise<void> {
  while (createdWorkspacePaths.length > 0) {
    const workspacePath = createdWorkspacePaths.pop()
    if (!workspacePath) continue
    await unregisterWorkspace(workspacePath).catch(() => {})
    rmSync(workspacePath, { recursive: true, force: true })
  }
}
