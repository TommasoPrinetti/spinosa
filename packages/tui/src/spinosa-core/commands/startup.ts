import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { buildLaunchCommand } from "../handoff/builder"
import { copyToClipboard } from "../handoff/runner"
import { spinosaLogInfo } from "../utils/log"
import { resolveTemplateRootFromFrameworkRoot } from "../framework/discovery"

export const STARTUP_PROGRESS_THRESHOLD_MS = 2_000
export const STARTUP_PROGRESS_INTERVAL_MS = 500

export function formatStartupProgressMessage(elapsedMs: number): string {
  if (elapsedMs < STARTUP_PROGRESS_THRESHOLD_MS) return "Running workspace startup..."
  return `Running workspace startup... (${(elapsedMs / 1_000).toFixed(1)}s)`
}

export function buildStartupChatPrompt(prompt: string) {
  return {
    input: prompt,
    parts: [] as [],
    autoSubmit: false as const,
  }
}

export interface StartupOptions {
  workspacePath: string
  frameworkRoot: string
  preferredCli?: string
  projectName?: string
  sourceLocation?: string
}

export interface AddResult {
  total: number
  copied: number
  skipped: number
  failed: number
  mdConverted: number
  ocrConverted: number
  [key: string]: number
}

export async function generateStartupPrompt(
  projectTitle: string,
  root: string,
  _sourcePath: string | undefined,
  preferredCli: string,
  frameworkRoot: string,
): Promise<string> {
  let prompt = ""

  const templateRoot = resolveTemplateRootFromFrameworkRoot(frameworkRoot) ?? frameworkRoot
  const templateFile = Bun.file(path.join(templateRoot, "startup-prompt.md"))
  if (await templateFile.exists()) {
    prompt = await templateFile.text()
  }

  prompt += `\n## Workspace Metadata\n\n`
  prompt += `- **Project title:** ${projectTitle}\n`
  prompt += `- **Workspace root:** ${root}\n`
  prompt += `- **Preferred CLI:** ${preferredCli}\n`
  prompt += `- **Onboarding summary:** .spinosa/onboarding-summary.md\n\n`
  prompt += `## Corpus Boundary\n\n`
  prompt += `- Treat raw/ as the only source corpus.\n`
  prompt += `- Do not inspect, validate, mention, or rely on the original import folder.\n`
  prompt += `- Do not edit raw/ file bodies.\n`
  prompt += `- External sources are disabled unless the user explicitly asks for them.\n`

  return prompt
}

export async function generateAddPrompt(
  root: string,
  preferredCli: string,
): Promise<string> {
  const rawDir = path.join(root, "raw")
  let rawCount = 0
  if (existsSync(rawDir)) {
    const walkDir = async (dirPath: string): Promise<void> => {
      const entries = await readDirRecursive(dirPath)
      for (const entry of entries) {
        if (entry.endsWith(".md")) rawCount++
      }
    }
    await walkDir(rawDir)
  }

  return `Workspace: ${root}

New source files have been added to this Spinosa workspace.

The CLI has already imported and converted the new files into raw/.

The raw/ corpus now contains approximately ${rawCount} Markdown files.

Read these files first, in this order:
1. AGENTS.md
2. system/configuration.md
3. system/context.md
4. startup-prompt.md (for extraction format and map structure reference)
5. system/dictionary.md
6. system/workspace_index.md
7. .spinosa/add-summary.md

Tasks to perform:

1. Detect new files in raw/ that are not yet in maps/ or system/dictionary.md.
2. Group the new files into batches of 20-25.
3. Spawn a spinosa-mapper sub-agent per batch to:
    - Update each raw/ file's YAML frontmatter with semantic fields (type, summary, concepts, language, people, places, organizations, topics) — these are pre-structured as empty scaffold fields from the import pipeline, fill them with content-derived values
   - Extract dictionary terms (names, places, organizations, domain terms, concepts)
   - Extract content signatures (one-paragraph summary, key passages with line refs, concept signals, connections)
4. Merge all extraction results into agent_reports/extraction_checkpoint.md.
5. Update system/dictionary.md with new terms from the new files.
6. Update navigation maps in maps/ to include the new files:
   - Update maps/corpus_overview.md with new structural groups if needed.
   - Update or create group maps for any new natural groups.
   - Update theme maps with cross-cutting concepts from the new files.
7. Update system/workspace_index.md to reflect the expanded corpus.
8. Run spinosa-verifier on new content to truth-check claims and passages.
9. Run the built-in Spinosa verifier or TUI health checks to validate workspace integrity.

Corpus boundary:
- Treat raw/ as the only source corpus.
- Do not edit raw/ file bodies.
- External sources are disabled unless the user explicitly asks for them.

Preferred LLM CLI: ${preferredCli}

Finished means:
- Every new file has been accounted for in dictionary, maps, and index.
- system/workspace_index.md records updated coverage, maps, and gaps.
- agent_reports/ contains an add report with validation and retrieval-test results.

Do not re-index files that are already mapped. Only process additions.
`
}


async function readDirRecursive(dirPath: string): Promise<string[]> {
  const results: string[] = []
  const entries = await readDir(dirPath)
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory) {
      const nested = await readDirRecursive(full)
      results.push(...nested)
    } else {
      results.push(full)
    }
  }
  return results
}

async function readDir(dirPath: string): Promise<{ name: string; isDirectory: boolean }[]> {
  if (!existsSync(dirPath)) return []
  const entries: { name: string; isDirectory: boolean }[] = []
  const items = readdirSync(dirPath)
  for (const name of items) {
    const full = path.join(dirPath, name)
    try {
      const s = statSync(full)
      entries.push({ name, isDirectory: s.isDirectory() })
    } catch {
      // skip unreadable
    }
  }
  return entries
}
export async function runStartup(
  options: StartupOptions,
): Promise<{ prompt: string; launchCommand: string }> {
  const { workspacePath, frameworkRoot, preferredCli, projectName, sourceLocation } = options
  spinosaLogInfo("startup", `workspacePath=${workspacePath} projectName=${projectName}`)
  const cli = preferredCli ?? "opencode"
  const title = projectName ?? path.basename(workspacePath)

  const prompt = await generateStartupPrompt(
    title,
    workspacePath,
    sourceLocation,
    cli,
    frameworkRoot,
  )

  const launchCommand = buildLaunchCommand(workspacePath, cli, prompt)

  return { prompt, launchCommand }
}

export async function runStartupWithHandoff(
  options: StartupOptions & { launch?: "copy" | "run" },
): Promise<{ prompt: string; launchCommand: string; handoffResult: "prompt_copied" | "prompt_ready" | "launch_command_copied" | "launch_command_ready" | "run_requested" | "run_failed_command_copied" | "run_failed_command_ready" }> {
  const { prompt, launchCommand } = await runStartup(options)
  const cli = options.preferredCli ?? "opencode"

  let handoffResult: "prompt_copied" | "prompt_ready" | "launch_command_copied" | "launch_command_ready" | "run_requested" | "run_failed_command_copied" | "run_failed_command_ready" = "prompt_copied"

  const launch = options.launch ?? "copy"

  if (cli === "other" || launch === "copy") {
    handoffResult = copyToClipboard(prompt) ? "prompt_copied" : "prompt_ready"
  } else if (launch === "run") {
    const { runCliWithPrompt } = await import("../handoff/runner")
    if (runCliWithPrompt(options.workspacePath, cli, prompt)) {
      handoffResult = "run_requested"
    } else {
      handoffResult = copyToClipboard(launchCommand) ? "run_failed_command_copied" : "run_failed_command_ready"
    }
  }

  return { prompt, launchCommand, handoffResult }
}

export async function runAddSummary(
  workspacePath: string,
  sourcePath: string,
  addMode: string,
  preferredCli: string,
  result: AddResult,
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)

  const content = `---
type: add_summary
created: ${today}
updated: ${today}
---

# Add Summary

## Source
- Source path: ${sourcePath}
- Add mode: ${addMode}

## Import Result
- Total candidates: ${result.total}
- Copied directly: ${result.copied}
- Skipped (duplicate): ${result.skipped}
- Failed: ${result.failed}
- MarkItDown converted: ${result.mdConverted}
- OCR converted: ${result.ocrConverted}

## Total delivered to raw/
- Files: ${result.copied + result.mdConverted + result.ocrConverted}

## Handoff
- Preferred CLI: ${preferredCli}
`

  const summaryPath = path.join(workspacePath, ".spinosa", "add-summary.md")
  try {
    await Bun.write(summaryPath, content)
  } catch (error) {
    throw new Error(`Failed to write add summary at ${summaryPath}`, { cause: error })
  }

  return content
}
