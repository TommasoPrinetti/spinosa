import path from "node:path"

export function resolveWorkspaceDisplayName(workspacePath: string, projectName?: string | null) {
  const trimmed = projectName?.trim()
  if (trimmed && trimmed.toLowerCase() !== "unknown") return trimmed
  return path.basename(workspacePath) || workspacePath
}

/** Show the source-like workspace name by removing the generated `-spinosa` suffix. */
export function workspaceAsciiBannerText(workspacePath: string) {
  const name = path.basename(workspacePath) || workspacePath
  const trimmed = name.trim().replace(/-spinosa$/i, "")
  return trimmed?.toUpperCase() ?? undefined
}
