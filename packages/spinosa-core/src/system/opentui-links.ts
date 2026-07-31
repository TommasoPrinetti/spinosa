import { existsSync, lstatSync, mkdirSync, symlinkSync } from "node:fs"
import path from "node:path"

/**
 * Bun installs `@opentui/*` under workspace packages, not the monorepo root.
 * Launch uses `bun --cwd <repoRoot> --preload @opentui/solid/preload`, so the
 * root must expose those packages. Idempotent — safe to call on every `bun run dev`.
 */
export function ensureOpenTuiRootLinks(frameworkRoot: string): void {
  const dest = path.join(frameworkRoot, "node_modules", "@opentui")
  const candidates = [
    path.join(frameworkRoot, "packages", "spinosa-kernel", "node_modules", "@opentui"),
    path.join(frameworkRoot, "packages", "tui", "node_modules", "@opentui"),
  ]
  const src = candidates.find((candidate) => existsSync(path.join(candidate, "solid")))
  if (!src) return
  if (existsSync(path.join(dest, "solid"))) return

  mkdirSync(dest, { recursive: true })
  for (const pkg of ["solid", "core", "keymap"] as const) {
    const from = path.join(src, pkg)
    const to = path.join(dest, pkg)
    if (!existsSync(from) || existsSync(to)) continue
    const relative = path.relative(dest, from)
    try {
      if (existsSync(to) && lstatSync(to).isSymbolicLink()) continue
      symlinkSync(relative, to)
    } catch {
      // Best-effort; launcher/install.sh also repair links.
    }
  }
}
