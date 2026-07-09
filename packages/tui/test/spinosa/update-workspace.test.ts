import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "../fixture/fixture"
import { updateWorkspace } from "../../src/spinosa-core/commands/update"

describe("workspace update flow", () => {
  test("updates a workspace from repo-root workspace-template layout", async () => {
    await using tmp = await tmpdir()
    const frameworkRoot = path.join(tmp.path, "install")
    const templateRoot = path.join(frameworkRoot, "workspace-template")
    const workspace = path.join(tmp.path, "workspace")

    await mkdir(path.join(templateRoot, ".spinosa"), { recursive: true })
    await mkdir(path.join(templateRoot, "logs"), { recursive: true })
    await mkdir(path.join(templateRoot, "docs"), { recursive: true })
    await mkdir(path.join(frameworkRoot, "metadata"), { recursive: true })
    await mkdir(path.join(workspace, ".spinosa"), { recursive: true })
    await mkdir(path.join(workspace, "logs"), { recursive: true })

    await Bun.write(path.join(frameworkRoot, "metadata", "version"), "1.2.3\n")
    await Bun.write(
      path.join(templateRoot, ".spinosa", "workspace-files.tsv"),
      [
        "path\trole\tupdate_policy",
        "AGENTS.md\tframework\talways_replace",
        "docs/guide.md\tframework\treplace_if_unmodified",
        "logs/.gitkeep\tframework\treplace_if_unmodified",
      ].join("\n") + "\n",
    )
    await Bun.write(path.join(templateRoot, "AGENTS.md"), "# Agents\n")
    await Bun.write(path.join(templateRoot, "docs", "guide.md"), "# Guide\n")
    await Bun.write(path.join(templateRoot, "logs", ".gitkeep"), "")
    await Bun.write(
      path.join(workspace, ".spinosa", "workspace"),
      [
        "workspace_version: 1",
        "framework_version: 1.0.0",
        "project_name: demo",
        "setup_status: cli_started",
      ].join("\n") + "\n",
    )
    await Bun.write(path.join(workspace, "logs", "user.log"), "keep me\n")

    const result = await updateWorkspace({ workspacePath: workspace, frameworkRoot })

    expect(result.success).toBe(true)
    expect(await Bun.file(path.join(workspace, "AGENTS.md")).text()).toContain("# Agents")
    expect(await Bun.file(path.join(workspace, "docs", "guide.md")).text()).toContain("# Guide")
    expect(await Bun.file(path.join(workspace, ".spinosa", "workspace")).text()).toContain("framework_version: 1.2.3")
    expect(await Bun.file(path.join(workspace, ".spinosa", "manifest.tsv")).text()).toContain("docs/guide.md\tfile")
    expect(existsSync(path.join(workspace, ".spinosa", "framework-checksums.json"))).toBe(true)
    expect(existsSync(path.join(workspace, "logs", "user.log"))).toBe(true)
    expect(existsSync(path.join(workspace, ".logs"))).toBe(false)
  })
})
