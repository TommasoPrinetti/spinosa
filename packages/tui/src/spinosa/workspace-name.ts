import path from "node:path"

export function resolveWorkspaceDisplayName(workspacePath: string, projectName?: string | null) {
  const trimmed = projectName?.trim()
  if (trimmed && trimmed.toLowerCase() !== "unknown") return trimmed
  return path.basename(workspacePath) || workspacePath
}

/** Show the full workspace name including `-spinosa` suffix so the user identifies it as the Spinosa version of the original folder. */
export function workspaceAsciiBannerText(workspacePath: string) {
  const name = path.basename(workspacePath) || workspacePath
  const trimmed = name.trim()
  return trimmed?.toUpperCase() ?? undefined
}
