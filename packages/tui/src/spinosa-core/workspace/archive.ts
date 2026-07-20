import { existsSync, renameSync } from "node:fs"
import path from "node:path"

export function archiveWorkspaceState(workspacePath: string, timestamp = Date.now()): string | undefined {
  const source = path.join(workspacePath, ".spinosa")
  if (!existsSync(source)) return
  let suffix = 0
  while (true) {
    const candidate = path.join(workspacePath, `.spinosa.removed-${timestamp}${suffix === 0 ? "" : `-${suffix}`}`)
    if (!existsSync(candidate)) {
      renameSync(source, candidate)
      return candidate
    }
    suffix++
  }
}
