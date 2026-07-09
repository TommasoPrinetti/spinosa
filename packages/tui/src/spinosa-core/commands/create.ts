import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { copyDirContents, cleanMacMetadata } from "../utils/fs"
import { registerWorkspace, writeSetupFiles } from "../workspace/registry"
import { writeWorkspaceStatus } from "../workspace/meta"
import { spinosaLogInfo } from "../utils/log"

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
  const parentDir = path.dirname(resolvedCorpus)
  const baseName = workspaceName?.trim() || `${corpusName}-spinosa`

  let workspacePath = path.join(parentDir, baseName)
  let n = 2
  while (existsSync(workspacePath)) {
    workspacePath = path.join(parentDir, `${baseName}-${n}`)
    n++
  }

  const projectName = workspaceName?.trim() || corpusName

  progress("Creating workspace directory...")
  mkdirSync(workspacePath, { recursive: true })
  mkdirSync(path.join(workspacePath, ".spinosa"), { recursive: true })

  // ── Step 1: Copy workspace-template/ → workspace root ───────────────
  const srcTemplate = path.join(frameworkRoot, "workspace-template")
  if (!existsSync(srcTemplate)) {
    return { workspacePath, projectName, success: false }
  }
  progress("Copying workspace template...")
  copyDirContents(srcTemplate, workspacePath)

  cleanMacMetadata(workspacePath)

  // ── Step 2: Run sync-agents to generate .codex, .opencode, .claude, .hermes ──
  progress("Syncing vendor agent folders...")
  const syncAgents = path.join(workspacePath, ".bin", "sync-agents.sh")
  if (existsSync(syncAgents)) {
    spawnSync("bash", [syncAgents], { stdio: "ignore" })
  }

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

  return { workspacePath, projectName, success: true }
}
