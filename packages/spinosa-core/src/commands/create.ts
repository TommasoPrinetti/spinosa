import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { safeCopy, safeCopyTree, copyDirContents, cleanMacMetadata } from "../utils/fs"
import { registerWorkspace, writeSetupFiles } from "../workspace/registry"
import { writeWorkspaceStatus } from "../workspace/meta"
import { spinosaLogInfo } from "../utils/log"

export interface CreateWorkspaceOptions {
  corpusPath: string
  frameworkRoot: string
  extensions?: string
  preferredCli?: string
  launch?: "copy" | "run"
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

function isFrameworkManifestEntry(role: string): boolean {
  return !!role && !role.startsWith("#")
}

function parseFrameworkFilesTsv(tsvPath: string): { path: string; role: string; policy: string }[] {
  const content = readFileSync(tsvPath, "utf-8")
  const entries: { path: string; role: string; policy: string }[] = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split("\t")
    const filePath = parts[0] ?? ""
    const role = parts[1] ?? ""
    const policy = parts[2] ?? ""
    if (isFrameworkManifestEntry(role)) {
      entries.push({ path: filePath, role, policy })
    }
  }
  return entries
}

function frameworkVersion(frameworkRoot: string): string {
  const versionPath = path.join(frameworkRoot, "metadata", "version")
  if (existsSync(versionPath)) {
    return readFileSync(versionPath, "utf-8").trim()
  }
  return "dev"
}

export async function createWorkspace(options: CreateWorkspaceOptions): Promise<CreateWorkspaceResult> {
  const { corpusPath, frameworkRoot, extensions, preferredCli, launch, onProgress } = options
  const progress = onProgress ?? (() => {})
  spinosaLogInfo("create", `corpusPath=${corpusPath} frameworkRoot=${frameworkRoot}`)

  const resolvedCorpus = path.resolve(corpusPath)
  const corpusName = path.basename(resolvedCorpus)
  const parentDir = path.dirname(resolvedCorpus)

  let workspacePath = path.join(parentDir, `${corpusName}-spinosa`)
  let n = 2
  while (existsSync(workspacePath)) {
    workspacePath = path.join(parentDir, `${corpusName}-spinosa-${n}`)
    n++
  }

  const projectName = corpusName

  progress("Creating workspace directory...")
  mkdirSync(path.join(workspacePath, ".spinosa"), { recursive: true })

  const sourceFrameworkVersion = frameworkVersion(frameworkRoot)

  const tsvPath = path.join(frameworkRoot, ".spinosa", "framework-files.tsv")
  if (!existsSync(tsvPath)) {
    return { workspacePath, projectName, success: false }
  }

  const manifestEntries = parseFrameworkFilesTsv(tsvPath)

  progress("Copying framework files...")
  for (const entry of manifestEntries) {
    const src = path.join(frameworkRoot, entry.path)
    const dst = path.join(workspacePath, entry.path)
    if (!existsSync(src)) continue
    const s = statSync(src)
    if (s.isDirectory()) {
      copyDirContents(src, dst)
    } else {
      const dir = path.dirname(dst)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      safeCopy(src, dst)
    }
  }

  cleanMacMetadata(workspacePath)

  progress("Syncing vendor agent folders...")
  const syncAgents = path.join(workspacePath, ".bin", "sync-agents.sh")
  if (existsSync(syncAgents)) {
    spawnSync("bash", [syncAgents], { stdio: "ignore" })
  }

  progress("Creating user-state directories...")
  for (const dir of ["raw", "maps", ".logs", "agent_reports", ".trash"]) {
    mkdirSync(path.join(workspacePath, dir), { recursive: true })
    writeFileSync(path.join(workspacePath, dir, ".gitkeep"), "", "utf-8")
  }

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

  progress("Writing manifest...")
  const manifestLines = ["path\tkind"]
  for (const entry of manifestEntries) {
    const fullPath = path.join(workspacePath, entry.path)
    if (existsSync(fullPath)) {
      const kind = statSync(fullPath).isDirectory() ? "dir" : "file"
      manifestLines.push(`${entry.path}\t${kind}`)
    }
  }
  writeFileSync(path.join(workspacePath, ".spinosa", "manifest.tsv"), manifestLines.join("\n") + "\n", "utf-8")

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
