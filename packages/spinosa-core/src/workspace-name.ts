import path from "node:path"

export function resolveWorkspaceDisplayName(workspacePath: string, projectName?: string | null): string {
  const trimmed = projectName?.trim()
  if (trimmed && trimmed.toLowerCase() !== "unknown") return trimmed
  return path.basename(workspacePath) || workspacePath
}

/** Strip the conventional `-spinosa` suffix before rendering the home ASCII banner. */
export function workspaceAsciiBannerText(workspacePath: string): string | undefined {
  const name = path.basename(workspacePath) || workspacePath
  const trimmed = name.trim()
  if (!trimmed) return undefined
  const withoutSuffix = trimmed.replace(/-spinosa(?=-\d+$|$)/i, "")
  return (withoutSuffix || trimmed).toUpperCase()
}
