import { existsSync } from "node:fs"
import path from "node:path"

const MD_PATH_RE = /[\w\/\\\-]+\.md/gi

/** Extract clickable workspace-relative `.md` paths from chat text. */
export function extractMdPaths(text: string, workspaceRoot?: string): string[] {
  const matches = text.match(MD_PATH_RE)
  if (!matches) return []
  const seen = new Set<string>()
  return matches
    .filter((p) => {
      if (seen.has(p)) return false
      seen.add(p)
      if (!p.includes("/") && !p.includes("\\")) return false
      if (p.startsWith("http://") || p.startsWith("https://")) return false
      if (workspaceRoot) {
        try {
          const resolved = path.resolve(workspaceRoot, p)
          if (!resolved.startsWith(workspaceRoot)) return false
          // Skip stale chat/docs links that point at files never written (or deleted).
          return existsSync(resolved)
        } catch {
          return false
        }
      }
      return true
    })
    .slice(0, 5)
}
