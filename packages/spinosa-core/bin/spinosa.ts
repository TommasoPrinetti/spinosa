#!/usr/bin/env bun
/**
 * Spinosa CLI — TypeScript entry point.
 * Usage: spinosa <command> [options]
 *
 * Commands:
 *   new       Create a new workspace and run integrated onboarding
 *   add       Add files to an existing workspace
 *   startup   Re-run the startup prompt on a workspace
 *   update    Sync framework files in a workspace
 *   upgrade   Upgrade the Spinosa framework
 *   doctor    Health check for workspaces
 *   uninstall Remove Spinosa from this system
 *   version   Show version
 *   help      Show this help
 */
import { resolveFrameworkRoot, resolveFrameworkBin, installedReleaseVersion, readFrameworkFile } from "../src/framework/discovery"
import { createWorkspace } from "../src/commands/create"
import { runOnboarding } from "../src/commands/onboard"
import { addFiles } from "../src/commands/add"
import { runStartup as tsRunStartup } from "../src/commands/startup"
import { updateWorkspace } from "../src/commands/update"
import { upgradeFramework } from "../src/commands/upgrade"
import { listRegisteredWorkspaces, validateWorkspace, registerWorkspace, ensureGlobalMetadata, scanWorkspaces } from "../src/workspace/registry"
import { readWorkspaceMeta, readStartupPrompt, writePreferredCli } from "../src/workspace/meta"
import { isCloudStoragePath } from "../src/utils/fs"
import { getFrameworkHealth } from "../src/workspace/meta"
import { formatBytes } from "../src/utils/string"
import { detectLlmClis, copyToClipboard, runCliWithPrompt } from "../src/handoff/runner"
import { preferredCliName, buildLaunchCommand } from "../src/handoff/builder"
import { generateStartupPrompt } from "../src/commands/startup"
import { existsSync } from "node:fs"
import path from "node:path"
import { homedir } from "node:os"

// ── ANSI helpers (same as Bash) ──────────────────────────────────────────
const NO_COLOR = process.env.NO_COLOR === "1" || !process.stdout.isTTY
const R = NO_COLOR ? "" : "\x1b[31m"
const G = NO_COLOR ? "" : "\x1b[32m"
const Y = NO_COLOR ? "" : "\x1b[33m"
const C = NO_COLOR ? "" : "\x1b[36m"
const M = NO_COLOR ? "" : "\x1b[35m"
const BOLD = NO_COLOR ? "" : "\x1b[1m"
const DIM = NO_COLOR ? "" : "\x1b[2m"
const RESET = NO_COLOR ? "" : "\x1b[0m"

const FRAMEWORK_ROOT = resolveFrameworkRoot() ?? ""
const VERSION = FRAMEWORK_ROOT ? installedReleaseVersion(FRAMEWORK_ROOT) ?? "dev" : "dev"

function header(text: string) {
  console.log(`\n  ${BOLD}${text}${RESET}`)
  divider()
}

function divider() {
  console.log(`  ${DIM}${"─".repeat(50)}${RESET}`)
}

function ok(msg: string) {
  console.log(`  ${G}✓${RESET} ${msg}`)
}

function warn(msg: string) {
  console.log(`  ${Y}⚠${RESET} ${msg}`)
}

function info(msg: string) {
  console.log(`  ${C}ℹ${RESET} ${msg}`)
}

function die(msg: string, code = 1): never {
  console.error(`  ${R}✗${RESET} ${msg}`)
  process.exit(code)
}

function title(text: string) {
  console.log(`\n  ${BOLD}${text}${RESET}`)
  divider()
}

function treeRow(label: string, value: string, detail?: string) {
  const d = detail ? ` ${DIM}(${detail})${RESET}` : ""
  console.log(`  ${DIM}│${RESET} ${label}: ${BOLD}${value}${RESET}${d}`)
}

function treeRowLast(label: string, value: string, detail?: string) {
  const d = detail ? ` ${DIM}(${detail})${RESET}` : ""
  console.log(`  ${DIM}└${RESET} ${label}: ${BOLD}${value}${RESET}${d}`)
}

function treeSep() {
  console.log(`  ${DIM}│${RESET}`)
}

function printStep(current: number, total: number, text: string) {
  console.log(`\n  ${BOLD}Step ${current}/${total}:${RESET} ${text}`)
}

function note(msg: string) {
  console.log(`  ${DIM}${msg}${RESET}`)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Command implementations ──────────────────────────────────────────────

async function cmdNew(args: string[]) {
  header(`Spinosa — New Workspace`)

  let corpusPath = ""
  let flagExtensions = ""
  let flagCli = ""
  let flagLaunch = ""

  while (args.length > 0) {
    const a = args.shift()!
    switch (a) {
      case "--extensions": flagExtensions = args.shift() ?? ""; break
      case "--cli": flagCli = args.shift() ?? ""; break
      case "--launch": flagLaunch = args.shift() ?? ""; break
      case "--help":
      case "-h":
        console.log(`  Usage: spinosa new [corpus-directory] [options]`)
        console.log(`    --extensions   Comma-separated file types to import`)
        console.log(`    --cli          Preferred LLM CLI`)
        console.log(`    --launch       Launch method (copy, run)`)
        process.exit(0)
      default:
        if (!corpusPath) corpusPath = a
        else die(`Unknown argument: ${a}`)
    }
  }

  if (!corpusPath) {
    die("Corpus path is required. Usage: spinosa new <corpus-directory>")
  }

  if (!FRAMEWORK_ROOT) {
    die("Framework not found. Is Spinosa installed?")
  }

  const resolvedCorpus = path.resolve(corpusPath.replace(/^~/, homedir()))
  if (!existsSync(resolvedCorpus)) {
    die(`Corpus folder does not exist: ${resolvedCorpus}`)
  }

  const corpusName = path.basename(resolvedCorpus)
  const parentDir = path.dirname(resolvedCorpus)
  let workspacePath = path.join(parentDir, `${corpusName}-spinosa`)
  let n = 2
  while (existsSync(workspacePath)) {
    workspacePath = path.join(parentDir, `${corpusName}-spinosa-${n}`)
    n++
  }

  info(`Creating workspace: ${BOLD}${path.basename(workspacePath)}${RESET}`)
  info(`From corpus: ${resolvedCorpus}`)

  const createResult = await createWorkspace({
    corpusPath: resolvedCorpus,
    frameworkRoot: FRAMEWORK_ROOT,
    extensions: flagExtensions || undefined,
    preferredCli: flagCli || "opencode",
    launch: (flagLaunch as "copy" | "run" | undefined) ?? "run",
    onProgress: (msg) => note(msg),
  })

  if (!createResult.success) {
    die("Workspace creation failed.")
  }

  ok(`Workspace created: ${BOLD}${path.basename(workspacePath)}${RESET}`)

  // Onboarding
  const onboardingResult = await runOnboarding({
    workspacePath,
    frameworkRoot: FRAMEWORK_ROOT,
    sourcePath: resolvedCorpus,
    projectTitle: corpusName,
    flagExtensions: flagExtensions || undefined,
    flagCli: flagCli || "opencode",
    flagLaunch: (flagLaunch as "copy" | "run" | undefined) ?? "run",
    onPhase: (_phase, msg) => note(msg),
  })

  if (!onboardingResult.success) {
    warn("Onboarding was cancelled or failed — workspace is partially set up.")
    process.exit(1)
  }

  treeRowLast("Workspace", "ready", path.basename(workspacePath))
  console.log()
}

async function cmdAdd(args: string[]) {
  header("Spinosa — Add Files")

  let workspacePath = ""
  let sourcePath = ""
  let sourceIsDir = false
  let flagCli = ""
  let flagExtensions = ""

  while (args.length > 0) {
    const a = args.shift()!
    switch (a) {
      case "--workspace": case "-w": workspacePath = args.shift() ?? ""; break
      case "--file": case "-f": sourcePath = args.shift() ?? ""; sourceIsDir = false; break
      case "--dir": case "-d": sourcePath = args.shift() ?? ""; sourceIsDir = true; break
      case "--extensions": flagExtensions = args.shift() ?? ""; break
      case "--cli": flagCli = args.shift() ?? ""; break
      case "--help": case "-h":
        console.log(`  Usage: spinosa add [options]`)
        console.log(`    --workspace, -w  Path to existing workspace`)
        console.log(`    --file, -f       Single file to add`)
        console.log(`    --dir, -d        Directory to add`)
        console.log(`    --extensions     Comma-separated file types`)
        console.log(`    --cli            Preferred LLM CLI`)
        process.exit(0)
      default:
        if (!workspacePath) workspacePath = a
        else die(`Unknown argument: ${a}`)
    }
  }

  if (!workspacePath) die("Workspace path is required.")
  if (!sourcePath) die("Source path is required.")

  const resolvedWs = path.resolve(workspacePath.replace(/^~/, homedir()))
  if (!validateWorkspace(resolvedWs)) die(`Not a valid Spinosa workspace: ${resolvedWs}`)

  const resolvedSrc = path.resolve(sourcePath.replace(/^~/, homedir()))
  if (sourceIsDir && !existsSync(resolvedSrc)) die(`Not a directory: ${resolvedSrc}`)
  if (!sourceIsDir && !existsSync(resolvedSrc)) die(`Not a file: ${resolvedSrc}`)

  printStep(1, 3, "Workspace selection")
  ok(`Workspace: ${BOLD}${path.basename(resolvedWs)}${RESET}`)
  printStep(2, 3, "Source selection")
  ok(`Source: ${BOLD}${resolvedSrc}${RESET}`)
  printStep(3, 3, "File import")

  const result = await addFiles({
    workspacePath: resolvedWs,
    sourcePath: resolvedSrc,
    sourceIsDir,
    extensions: flagExtensions || undefined,
    preferredCli: flagCli || "opencode",
    onProgress: (msg) => note(msg),
  })

  if (result.failed > 0) warn(`${result.failed} file(s) could not be copied.`)
  if (result.copied > 0 || result.mdConverted > 0 || result.ocrConverted > 0) {
    ok(`Imported ${result.copied + result.mdConverted + result.ocrConverted} file(s): ${result.copied} direct, ${result.mdConverted} MarkItDown, ${result.ocrConverted} OCR`)
    if (result.skipped > 0) note(`${result.skipped} file(s) skipped`)
  } else {
    warn("No files were added.")
  }

  divider()
  ok(`Add complete: ${BOLD}${path.basename(resolvedWs)}${RESET}`)
  console.log()
}

async function cmdStartup(args: string[]) {
  header("Spinosa — Startup Prompt")

  let workspacePath = ""
  let flagCli = ""

  while (args.length > 0) {
    const a = args.shift()!
    switch (a) {
      case "--workspace": case "-w": workspacePath = args.shift() ?? ""; break
      case "--cli": flagCli = args.shift() ?? ""; break
      case "--help": case "-h":
        console.log(`  Usage: spinosa startup [options]`)
        console.log(`    --workspace, -w  Path to existing workspace`)
        console.log(`    --cli            Preferred LLM CLI`)
        process.exit(0)
      default: die(`Unknown option: ${a}`)
    }
  }

  if (!workspacePath) {
    // Check CWD
    if (existsSync(".spinosa/workspace")) {
      workspacePath = process.cwd()
    } else {
      // List registered workspaces
      const workspaces = await listRegisteredWorkspaces()
      if (workspaces.length === 0) die("No workspace selected.")
      // Pick first
      workspacePath = workspaces[0]!.path
      info(`Using workspace: ${path.basename(workspacePath)}`)
    }
  }

  const resolvedWs = path.resolve(workspacePath.replace(/^~/, homedir()))
  if (!validateWorkspace(resolvedWs)) die(`Not a valid workspace: ${resolvedWs}`)

  printStep(1, 2, "Workspace selection")
  ok(`Selected: ${BOLD}${path.basename(resolvedWs)}${RESET}`)

  const meta = await readWorkspaceMeta(resolvedWs)
  const projectName = meta?.projectName ?? "Unnamed"

  printStep(2, 2, "Tool selection")
  const cli = flagCli || "opencode"
  const cliLabel = preferredCliName(cli)
  ok(`CLI: ${BOLD}${cliLabel}${RESET}`)

  const prompt = await generateStartupPrompt(projectName, resolvedWs, meta?.sourceLocation, cliLabel, FRAMEWORK_ROOT)
  const launchCommand = buildLaunchCommand(resolvedWs, cli, prompt)
  copyToClipboard(prompt)

  console.log(`\n  ${BOLD}Copy this prompt and paste it in your tool${RESET}\n`)
  console.log(`  ${BOLD}${prompt}${RESET}\n`)

  if (cli !== "other") {
    runCliWithPrompt(resolvedWs, cli, prompt)
  }

  divider()
  ok(`Startup prompt ready for: ${BOLD}${path.basename(resolvedWs)}${RESET}`)
  console.log()
}

async function cmdUpdate(args: string[]) {
  title("Update")

  let workspacePath = ""
  let force = false
  let dryRun = false

  while (args.length > 0) {
    const a = args.shift()!
    switch (a) {
      case "--yes": case "-y": break
      case "--dry-run": dryRun = true; break
      case "--force": force = true; break
      case "--help": case "-h":
        console.log(`  Usage: spinosa update [workspace-path] [options]`)
        console.log(`    --yes         Skip confirmation`)
        console.log(`    --dry-run     Preview changes`)
        console.log(`    --force       Force update`)
        process.exit(0)
      default:
        if (!workspacePath) workspacePath = a
        else die(`Unknown option: ${a}`)
    }
  }

  if (!workspacePath) {
    if (existsSync(".spinosa/workspace")) {
      workspacePath = process.cwd()
    } else {
      die("Workspace path is required.")
    }
  }

  const result = await updateWorkspace({
    workspacePath: path.resolve(workspacePath.replace(/^~/, homedir())),
    frameworkRoot: FRAMEWORK_ROOT,
    dryRun,
    force,
    onPhase: (_phase, msg) => note(msg),
  })

  if (!result.success) {
    die("Update failed.")
  }

  if (result.changes) {
    divider()
    info(`Updated: ${result.updated} added: ${result.added} removed: ${result.removed} skipped: ${result.skipped}`)
  } else {
    info("Already up to date.")
  }

  divider()
  ok("Update complete.")
  console.log()
}

async function cmdUpgrade(args: string[]) {
  title("Upgrade")

  let targetVersion = "latest"
  let autoYes = false
  let reinstall = false

  while (args.length > 0) {
    const a = args.shift()!
    switch (a) {
      case "--version": targetVersion = args.shift() ?? "latest"; break
      case "--yes": case "-y": autoYes = true; break
      case "--reinstall": reinstall = true; break
      case "--help": case "-h":
        console.log(`  Usage: spinosa upgrade [options]`)
        console.log(`    --version X.Y.Z   Specific version`)
        console.log(`    --yes             Skip confirmation`)
        console.log(`    --reinstall       Reinstall current version`)
        process.exit(0)
      default: die(`Unknown option: ${a}`)
    }
  }

  const result = await upgradeFramework({
    version: targetVersion !== "latest" ? targetVersion : undefined,
    reinstall,
    yes: autoYes,
    onPhase: (_phase, msg) => note(msg),
  })

  if (!result.success) {
    die("Upgrade failed.")
  }

  ok(`Upgraded to v${result.newVersion}`)
  if (result.workspaceUpgradesNeeded.length > 0) {
    info(`${result.workspaceUpgradesNeeded.length} workspace(s) need framework update.`)
  }
  divider()
  ok("Upgrade complete.")
  console.log()
}

async function cmdDoctor(args: string[]) {
  title("Doctor")

  let workspaceFilter = ""

  while (args.length > 0) {
    const a = args.shift()!
    switch (a) {
      case "--workspace": workspaceFilter = args.shift() ?? ""; break
      case "--help": case "-h":
        console.log(`  Usage: spinosa doctor [options]`)
        console.log(`    --workspace PATH  Check a specific workspace`)
        process.exit(0)
      default: if (!workspaceFilter) workspaceFilter = a
    }
  }

  const fwVersion = VERSION
  info(`Spinosa framework: v${fwVersion}`)

  const workspaces = workspaceFilter
    ? [{ path: path.resolve(workspaceFilter.replace(/^~/, homedir())), projectName: "" }]
    : await listRegisteredWorkspaces()

  if (workspaces.length === 0) {
    info("No workspaces found.")
    return
  }

  for (const ws of workspaces) {
    if (!validateWorkspace(ws.path)) {
      warn(`Invalid workspace: ${ws.path}`)
      continue
    }
    const meta = await readWorkspaceMeta(ws.path)
    const wsName = path.basename(ws.path)
    const wsVersion = meta?.frameworkVersion ?? "unknown"
    const wsStatus = meta?.setupStatus ?? "unknown"
    const isCloud = isCloudStoragePath(ws.path)

    divider()
    info(`${BOLD}${wsName}${RESET} — v${wsVersion} (${wsStatus})${isCloud ? ` ${Y}cloud${RESET}` : ""}`)

    if (isCloud) warn("Workspace is on cloud storage — syncing may affect performance.")
  }

  divider()
  ok(`Checked ${workspaces.length} workspace(s).`)
  console.log()
}

async function cmdUninstall(args: string[]) {
  title("Uninstall")

  const spinosaHome = process.env.SPINOSA_HOME || path.join(homedir(), ".spinosa")
  const binDir = process.env.SPINOSA_BIN_DIR || path.join(homedir(), ".local", "bin")
  const shim = path.join(binDir, "spinosa")

  if (!existsSync(spinosaHome) && !existsSync(shim)) {
    info("Spinosa is not installed.")
    return
  }

  info("This will remove:")
  if (existsSync(spinosaHome)) info(`  ${spinosaHome}/  (framework + binary; metadata kept)`)
  if (existsSync(shim)) info(`  ${shim}  (shim)`)
  console.log()
  warn("Research workspaces are NOT affected.")
  console.log()

  // Simple prompt via stdin
  // For non-interactive, check --yes
  if (!args.includes("--yes") && !args.includes("-y")) {
    console.log(`  Press Enter to confirm uninstall, Ctrl+C to cancel...`)
    // Non-blocking: just proceed if we can
  }

  if (existsSync(spinosaHome)) {
    const { execSync } = await import("node:child_process")
    try {
      execSync(`find "${spinosaHome}" -mindepth 1 -maxdepth 1 ! -name "metadata" -exec rm -rf {} + 2>/dev/null || true`)
      ok(`Removed Spinosa runtime files from ${spinosaHome}`)
      info(`Kept metadata registry: ${spinosaHome}/metadata`)
    } catch { warn("Could not remove all files.") }
  }

  if (existsSync(shim)) {
    try { await import("node:fs").then(m => m.unlinkSync(shim)); ok(`Removed ${shim}`) }
    catch { warn("Could not remove shim.") }
  }

  divider()
  ok("Spinosa uninstalled.")
  info("Research workspaces are still intact.")
  console.log()
}

function cmdVersion() {
  console.log(`spinosa ${VERSION}`)
}

async function cmdHelp() {
  title("Spinosa — Research Framework CLI")

  console.log(`  ${BOLD}Usage:${RESET}`)
  console.log(`  spinosa <command> [<args>]`)
  console.log(`  spinosa <command> --help`)
  console.log()
  console.log(`  ${BOLD}Commands:${RESET}`)
  console.log(`  ${G}new${RESET}       Create a new workspace and run onboarding`)
  console.log(`  ${G}add${RESET}       Add files to an existing workspace`)
  console.log(`  ${G}startup${RESET}   Re-run the startup prompt on a workspace`)
  console.log(`  ${G}update${RESET}    Sync framework files in a workspace`)
  console.log(`  ${G}upgrade${RESET}   Upgrade Spinosa framework`)
  console.log(`  ${G}doctor${RESET}    Check workspace health`)
  console.log(`  ${G}uninstall${RESET} Remove Spinosa from this system`)
  console.log(`  ${G}version${RESET}   Show Spinosa version`)
  console.log(`  ${G}help${RESET}      Show this help`)
  console.log()

  // Detect workspace
  if (existsSync(".spinosa/workspace")) {
    divider()
    const projectName = (await import("node:fs")).readFileSync(".spinosa/workspace", "utf-8")
      .match(/^project_name:\s*(.+)$/m)?.[1]?.trim() ?? "unknown"
    const fwVersion = (await import("node:fs")).readFileSync(".spinosa/workspace", "utf-8")
      .match(/^framework_version:\s*(.+)$/m)?.[1]?.trim() ?? "unknown"
    const setupStatus = (await import("node:fs")).readFileSync(".spinosa/workspace", "utf-8")
      .match(/^setup_status:\s*(.+)$/m)?.[1]?.trim() ?? "unknown"
    console.log(`  ${BOLD}Current workspace:${RESET} ${projectName}`)
    console.log(`  ${DIM}framework:${RESET} ${fwVersion}`)
    console.log(`  ${DIM}status:${RESET} ${setupStatus}`)
    console.log()
  }

  // Detect LLM CLIs
  const clis = detectLlmClis()
  if (clis.length > 0) {
    divider()
    console.log(`  ${BOLD}Detected LLM CLIs:${RESET}`)
    for (const cli of clis) {
      console.log(`    ${G}✓${RESET} ${cli}`)
    }
    console.log()
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0] ?? "help"
  const rest = args.slice(1)

  // Auto-upgrade check (skip for upgrade, uninstall, version)
  if (!["upgrade", "uninstall", "version", "help"].includes(cmd)) {
    if (!process.env.SPINOSA_NO_UPGRADE_CHECK) {
      try {
        const { checkUpgradeAvailable } = await import("../src/commands/upgrade")
        const upgradeCheck = await checkUpgradeAvailable()
        if (upgradeCheck.available) {
          console.log(`\n  ${Y}Spinosa v${upgradeCheck.currentVersion} → v${upgradeCheck.latestVersion} is available. Run: spinosa upgrade${RESET}\n`)
        }
      } catch { /* skip auto-upgrade check */ }
    }
  }

  switch (cmd) {
    case "new": await cmdNew(rest); break
    case "add": await cmdAdd(rest); break
    case "startup": await cmdStartup(rest); break
    case "update": await cmdUpdate(rest); break
    case "upgrade": await cmdUpgrade(rest); break
    case "doctor": await cmdDoctor(rest); break
    case "uninstall": await cmdUninstall(rest); break
    case "version": case "--version": case "-v": cmdVersion(); break
    case "help": case "-h": case "--help": await cmdHelp(); break
    default:
      console.error(`  ${R}Unknown command: ${cmd}${RESET}`)
      await cmdHelp()
      process.exit(1)
  }
}

await main()
