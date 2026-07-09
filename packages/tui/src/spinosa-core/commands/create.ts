import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { copyDirContents, cleanMacMetadata } from "../utils/fs"
import { registerWorkspace, writeSetupFiles } from "../workspace/registry"
import { writeWorkspaceStatus } from "../workspace/meta"
import { spinosaLogInfo } from "../utils/log"
import { resolveTemplateRootFromFrameworkRoot } from "../framework/discovery"

export interface CreateWorkspaceOptions {
  corpusPath: string
  frameworkRoot: string
  extensions?: string
  preferredCli?: string
  launch?: "copy" | "run"
  workspaceName?: string
  onProgress?: (message: string) => void
}

export interface CreateWorkspaceResult {
  workspacePath: string
  projectName: string
  success: boolean
}

export function resolveWorkspacePath(corpusPath: string, workspaceName?: string): string {
  const resolvedCorpus = path.resolve(corpusPath)
  const corpusName = path.basename(resolvedCorpus)
  const parentDir = path.dirname(resolvedCorpus)
  const baseName = workspaceName?.trim() || `${corpusName}-spinosa`

  let workspacePath = path.join(parentDir, baseName)
  let n = 2
  while (existsSync(workspacePath)) {
    workspacePath = path.join(parentDir, `${baseName}-${n}`)
    n++
  }

  return workspacePath
}

function reserveWorkspacePath(corpusPath: string, workspaceName?: string): string {
  const resolvedCorpus = path.resolve(corpusPath)
  const corpusName = path.basename(resolvedCorpus)
  const parentDir = path.dirname(resolvedCorpus)
  const baseName = workspaceName?.trim() || `${corpusName}-spinosa`

  let n = 1
  while (true) {
    const suffix = n === 1 ? "" : `-${n}`
    const candidate = path.join(parentDir, `${baseName}${suffix}`)
    try {
      mkdirSync(candidate)
      return candidate
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
        n++
        continue
      }
      throw error
    }
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function frameworkVersion(frameworkRoot: string): string {
  const versionPath = path.join(frameworkRoot, "metadata", "version")
  if (existsSync(versionPath)) {
    return readFileSync(versionPath, "utf-8").trim()
  }
  return "dev"
}

export async function createWorkspace(options: CreateWorkspaceOptions): Promise<CreateWorkspaceResult> {
  const { corpusPath, frameworkRoot, extensions, preferredCli, launch, workspaceName, onProgress } = options
  const progress = onProgress ?? (() => {})
  spinosaLogInfo("create", `corpusPath=${corpusPath} frameworkRoot=${frameworkRoot}`)

  const resolvedCorpus = path.resolve(corpusPath)
  const corpusName = path.basename(resolvedCorpus)
  const workspacePath = reserveWorkspacePath(corpusPath, workspaceName)

  const projectName = workspaceName?.trim() || corpusName

  try {
    progress("Creating workspace directory...")
    mkdirSync(path.join(workspacePath, ".spinosa"), { recursive: true })

    // ── Step 1: Copy workspace-template/ → workspace root ───────────────
    const srcTemplate = resolveTemplateRootFromFrameworkRoot(frameworkRoot)
    if (!srcTemplate || !existsSync(srcTemplate)) {
      rmSync(workspacePath, { recursive: true, force: true })
      return { workspacePath, projectName, success: false }
    }
    progress("Copying workspace template...")
    copyDirContents(srcTemplate, workspacePath)

    cleanMacMetadata(workspacePath)

    // ── Step 3: Create user-state directories (with .gitkeep) ──────────
    progress("Creating user-state directories...")
    for (const dir of ["raw", "maps", "logs", "agent_reports", ".trash"]) {
      mkdirSync(path.join(workspacePath, dir), { recursive: true })
      writeFileSync(path.join(workspacePath, dir, ".gitkeep"), "", "utf-8")
    }

    // ── Step 4: Write workspace metadata ───────────────────────────────
    const sourceFrameworkVersion = frameworkVersion(frameworkRoot)
    progress("Writing workspace metadata...")
    const markerLines = [
      `workspace_version: 1`,
      `framework_version: ${sourceFrameworkVersion}`,
      `created: ${today()}`,
      `project_name: ${projectName}`,
      `source_location: ${resolvedCorpus}`,
      `setup_status: not_started`,
      "",
    ]
    writeFileSync(path.join(workspacePath, ".spinosa", "workspace"), markerLines.join("\n"), "utf-8")

    // ── Step 5: Register workspace ─────────────────────────────────────
    progress("Registering in global registry...")
    await registerWorkspace(workspacePath, projectName)

    if (preferredCli) {
      const cliLabel = preferredCli
      progress(`Writing setup files (CLI: ${cliLabel})...`)
      await writeSetupFiles(workspacePath, projectName, resolvedCorpus, cliLabel)
      await writeWorkspaceStatus(workspacePath, "cli_started")
    }
  } catch (error) {
    rmSync(workspacePath, { recursive: true, force: true })
    throw error
  }

  return { workspacePath, projectName, success: true }
}
