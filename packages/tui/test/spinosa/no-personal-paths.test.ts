import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dir, "../../../..")

// Built at runtime so this file does not embed the forbidden literal itself.
const maintainerHome = ["", "Users", "tommasoprinetti"].join("/")
const localCloneMarker = ["Documents", "spinosa-main"].join("/")

describe("no personal machine paths in tracked files", () => {
  test("git ls-files has no maintainer home paths", async () => {
    const listed = await $`git ls-files`.cwd(repoRoot).text()
    const files = listed.split("\n").filter(Boolean)

    const pathHits = files.filter((file) => {
      const lower = file.toLowerCase()
      if (lower.includes(maintainerHome.toLowerCase())) return true
      if (lower.includes("tommasoprinetti/") || lower.includes("tommasoprinetti\\")) return true
      if (file.includes(localCloneMarker)) return true
      // Accidental install.sh die() message turned into a filename
      if (file.includes("Cannot read from terminal")) return true
      return false
    })
    expect(pathHits).toEqual([])
  })

  test("tracked file contents do not embed maintainer home directory", async () => {
    const listed = await $`git ls-files`.cwd(repoRoot).text()
    const files = listed.split("\n").filter(Boolean)
    const self = path.relative(repoRoot, import.meta.path)

    const contentHits: string[] = []
    for (const file of files) {
      if (file === self) continue
      if (/\.(png|jpg|jpeg|gif|webp|woff2?|ttf|ico|gz|tgz)$/i.test(file)) continue

      const abs = path.join(repoRoot, file)
      const bunFile = Bun.file(abs)
      if (!(await bunFile.exists())) continue
      if (bunFile.size > 2_000_000) continue

      let text: string
      try {
        text = await bunFile.text()
      } catch {
        continue
      }

      // Absolute home path or local clone path — not the public GitHub username / copyright name
      if (text.includes(maintainerHome) || text.includes(localCloneMarker)) {
        contentHits.push(file)
      }
    }

    expect(contentHits).toEqual([])
  })

  test("no tracked workspace log or ndjson artifacts", async () => {
    const listed = await $`git ls-files`.cwd(repoRoot).text()
    const files = listed.split("\n").filter(Boolean)

    const logHits = files.filter((file) => {
      if (!/\.(log|ndjson)$/i.test(file)) return false
      // Template scaffold only — no runtime traces
      if (file === "workspace-template/.logs/.gitkeep") return false
      if (file === "workspace-template/.logs/AGENTS.md") return false
      return true
    })

    expect(logHits).toEqual([])
  })
})
