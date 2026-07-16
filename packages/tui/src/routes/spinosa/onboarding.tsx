import path from "node:path"
import { existsSync, readdirSync, statSync } from "node:fs"
import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../../context/theme"
import { useRoute } from "../../context/route"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { Toast } from "../../ui/toast"
import { ProgressEmitter } from "../../spinosa-core/progress/progress"
import { createWorkspace, resolveWorkspacePath } from "../../spinosa-core/commands/create"
import { prepareOnboarding, completeOnboarding } from "../../spinosa-core/commands/onboard"
import type { OnboardingContext, PhaseAccumulator, OnboardingResult } from "../../spinosa-core/commands/onboard"
import { scanAndClassifySource, processDirectCopy, processMarkitdown, processOcr, type PhaseResult } from "../../spinosa-core/import/pipeline"
import { isSpinosaCancellationError } from "../../spinosa-core/import/cancellation"
import { addFiles } from "../../spinosa-core/commands/add"
import {
  buildStartupChatPrompt,
  formatStartupProgressMessage,
  STARTUP_PROGRESS_INTERVAL_MS,
  STARTUP_PROGRESS_THRESHOLD_MS,
  runStartup as tsRunStartup,
} from "../../spinosa-core/commands/startup"
import { resolveFrameworkRoot } from "../../spinosa-core/framework/discovery"
import { spawn } from "node:child_process"
import { tuiLog, logStep, logAction, logPhase, logTool, logResult, logError, logGate } from "../../spinosa/log"
import { useExit } from "../../context/exit"
import type { CliRunResult } from "../../spinosa/types"
import { readBundledFrameworkVersion, isPrereleaseFrameworkVersion, readStartupPrompt, writePreferredCli } from "../../spinosa/service"
import { writeWorkspaceStatus } from "../../spinosa-core/workspace/meta"
import { normalizePathInput, resolveExistingUserPaths, isCloudStoragePath } from "../../spinosa-core/utils/path"
import { CenteredColumn } from "../../component/centered-column"
import { OPENCODE_BASE_MODE, useOpencodeKeymap, useOpencodeModeStack } from "../../keymap"
import { buttonBackground, buttonBorder, buttonText } from "../../util/button"
import {
  buildNewWorkspacePreview,
  detectDocumentTools,
  detectLlmTools,
  resolveUserPath,
  suggestWorkspacePath,
  type NewWorkspacePreview,
} from "../../spinosa/onboarding-preview"
import {
  blurIfFocused,
  createWorkflowGuard,
  deferPress,
  delay,
  generateScanLines,
  ImportOptionsSelector,
  nextFocusedSourceIndexForAppend,
  shouldCancelSpinosaWorkOnCtrlC,
  type ImportOption,
  LogScrollbox,
  LogoSummary,
  ProgressBar,
  stripAnsi,
  WizardActionButton,
  WizardActionRow,
  WizardGateButton,
  WizardPanel,
  wizardScrollboxMaxHeight,
  yieldToEventLoop,
} from "./wizard-ui"

type WizardStep = "path" | "name" | "tools" | "scan" | "imports" | "setup" | "direct" | "markitdown" | "ocr" | "verification" | "provider" | "startup" | "done" | "error"

type ToolCheckResult = {
  label: string
  status: "checking" | "available" | "missing"
  detail?: string
}

type CliOption = {
  value: string
  label: string
  description: string
}

type SourcePathEntry = {
  id: number
}

const CANCELABLE_STEPS = ["setup", "direct", "markitdown", "ocr", "verification"] as const

let nextSourceId = 1

const CLI_OPTIONS: CliOption[] = [
  { value: "spinosa", label: "Spinosa", description: "Open the Spinosa TUI with the startup prompt ready." },
  { value: "opencode", label: "OpenCode", description: "Run the OpenCode CLI with the startup prompt." },
  { value: "opencode_desktop", label: "OpenCode Desktop", description: "Open OpenCode and paste the copied prompt." },
  { value: "gemini", label: "Gemini", description: "Run the Gemini CLI in this workspace." },
  { value: "qwen", label: "Qwen", description: "Run the Qwen CLI in this workspace." },
  { value: "claude_code", label: "Claude Code", description: "Run the terminal CLI in this workspace." },
  {
    value: "claude_code_desktop",
    label: "Claude Code Desktop",
    description: "Open the desktop app with the prompt ready.",
  },
  { value: "codex", label: "Codex", description: "Run the Codex terminal CLI in this workspace." },
  { value: "codex_app", label: "Codex App", description: "Open the Codex app and paste the copied prompt." },
  { value: "hermes", label: "Hermes Agent", description: "Run the Hermes CLI in this workspace." },
  { value: "kilo", label: "Kilo", description: "Run the Kilo terminal CLI in this workspace." },
  { value: "other", label: "Other", description: "Copy a generic launch command for another tool." },
]

function launchForCli(cliValue: string): string {
  if (cliValue === "other") return "copy"
  if (cliValue.endsWith("_desktop") || cliValue === "codex_app") return "desktop"
  return "run"
}


/**
 * Reinstall vendor tools via install.sh.
 * The only remaining bash-spawned operation used by the TUI.
 */
async function runReinstall(input?: {
  channel?: string
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}): Promise<CliRunResult> {
  tuiLog("runReinstall (bash)")

  const fwRoot = resolveFrameworkRoot()
  if (!fwRoot) {
    const msg = "Framework root not found — cannot reinstall vendor tools."
    input?.onStderr?.(msg + "\n")
    return { exitCode: 1, stdout: "", stderr: msg }
  }

  const localInstaller = path.join(fwRoot, "install.sh")
  if (!existsSync(localInstaller)) {
    const msg = "install.sh not found in framework root."
    input?.onStderr?.(msg + "\n")
    return { exitCode: 1, stdout: "", stderr: msg }
  }

  const version = await readBundledFrameworkVersion()
  if (!version) {
    const msg = "Could not read bundled framework version."
    input?.onStderr?.(msg + "\n")
    return { exitCode: 1, stdout: "", stderr: msg }
  }

  input?.onStdout?.(`Reinstalling vendor tools for v${version}...\n`)

  return new Promise<CliRunResult>((resolve) => {
    let timedOut = false
    let stdout = ""
    let stderr = ""

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      resolve({ exitCode: 124, stdout, stderr: "Reinstall timed out after 120s." })
    }, 120_000)

    const child = spawn("bash", [localInstaller, "--reinstall", "--version", version, "--yes", "--no-launch", "--no-bundled-tools"], {
      stdio: ["ignore", "pipe", "pipe"],
    })

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      stdout += text
      // Strip ANSI escape codes and spinner control chars for clean TUI display
      const clean = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "\n").replace(/\n{2,}/g, "\n").trim()
      if (clean) input?.onStdout?.(clean + "\n")
    })
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      stderr += text
      const clean = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "\n").replace(/\n{2,}/g, "\n").trim()
      if (clean) input?.onStderr?.(clean + "\n")
    })

    const done = (code: number | null) => {
      clearTimeout(timer)
      if (timedOut) return
      if (code === 0) {
        input?.onStdout?.("Reinstall complete.\n")
        resolve({ exitCode: 0, stdout, stderr })
      } else {
        resolve({ exitCode: code ?? 1, stdout, stderr })
      }
    }
    child.on("close", (code) => done(code))
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ exitCode: 1, stdout, stderr: err.message })
    })
  })
}

export function Onboarding() {
  const { theme } = useTheme()
  const { navigate } = useRoute()
  const spinosa = useSpinosaWorkspace()
  const dimensions = useTerminalDimensions()
  const keymap = useOpencodeKeymap()
  const modeStack = useOpencodeModeStack()
  const exit = useExit()

  const [step, setStep] = createSignal<WizardStep>("path")
  const [sourcePaths, setSourcePaths] = createSignal<SourcePathEntry[]>([{ id: 0 }])
  const [logLines, setLogLines] = createSignal<string[]>([])
  const [createdWorkspace, setCreatedWorkspace] = createSignal<string | undefined>()
  const [busy, setBusy] = createSignal(false)
  const [importOptions, setImportOptions] = createSignal<ImportOption[]>([])
  const [selectedImport, setSelectedImport] = createSignal(0)
  const [selectedCli, setSelectedCli] = createSignal(0)
  const [focusedSource, setFocusedSource] = createSignal(0)
  const [preview, setPreview] = createSignal<NewWorkspacePreview | undefined>()
  const [toolChecks, setToolChecks] = createSignal<ToolCheckResult[]>([])
  const toolActionLabel = createMemo(() => {
    const checks = toolChecks()
    if (checks.length === 0) return ""
    if (checks.some((t) => t.status === "checking")) return "Checking..."
    if (checks.some((t) => t.status === "missing")) return "Reinstall missing tools"
    return "Scan source folders"
  })
  const toolAllReady = createMemo(() => {
    const checks = toolChecks()
    return checks.length > 0 && checks.every((t) => t.status === "available")
  })
  const [hoveredButton, setHoveredButton] = createSignal<string | null>(null)
  const [scanProgress, setScanProgress] = createSignal(0)
  const [scanTotal, setScanTotal] = createSignal(0)
  const [processingDone, setProcessingDone] = createSignal(false)
  const [progCurrent, setProgCurrent] = createSignal(0)
  const [progTotal, setProgTotal] = createSignal(1)
  const [failedCount, setFailedCount] = createSignal(0)
  const [processingFile, setProcessingFile] = createSignal("")
  const [scanDone, setScanDone] = createSignal(false)
  const [scanningFile, setScanningFile] = createSignal("")
  const [scanCount, setScanCount] = createSignal(0)
  function formatBytes(b: number): string {
    if (b >= 1_000_000_000) return `${(b / 1_000_000_000).toFixed(1)} GB`
    if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(1)} MB`
    if (b >= 1_000) return `${(b / 1_000).toFixed(1)} KB`
    return `${b} B`
  }
  const [processingStatus, setProcessingStatus] = createSignal("")
  const [sourceIsCloud, setSourceIsCloud] = createSignal(false)
  const [importSummary, setImportSummary] = createSignal("")
  const [workspaceName, setWorkspaceName] = createSignal("")
  const [startupMessage, setStartupMessage] = createSignal("")
  const [startupElapsedMs, setStartupElapsedMs] = createSignal(0)
  const [startupError, setStartupError] = createSignal<string | undefined>()
  const [pathValidities, setPathValidities] = createStore<Record<number, "unchecked" | "valid" | "invalid">>({})
  const WAVE = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]
  const waveString = (f: number) => { let r = ""; for (let i = 0; i < 6; i++) { const p = (i + f) % 14, l = p <= 6 ? p : 13 - p; r += WAVE[l] }; return r }
  const wavePulse = (f: number) => { const p = f % 14; return WAVE[p <= 6 ? p : 13 - p] }
  const waveRow = (f: number, width: number) => { let r = ""; for (let i = 0; i < width; i++) { const angle = (i * Math.PI) / 7 + f * Math.PI / 7; const l = Math.max(0, Math.min(7, Math.round(3.5 + 3.5 * Math.sin(angle)))); r += WAVE[l] }; return r }
  const [spinIdx, setSpinIdx] = createSignal(0)
  let spinTimer: ReturnType<typeof setInterval> | undefined
  const spinOn = () => { if (!spinTimer) spinTimer = setInterval(() => setSpinIdx((i) => (i + 1) % 14), 200) }
  const spinOff = () => { if (spinTimer) { clearInterval(spinTimer); spinTimer = undefined; setSpinIdx(0) } }
  const [gateLabel, setGateLabel] = createSignal("")
  const [gateAction, setGateAction] = createSignal<() => void>(() => {})
  const [waitingForGate, setWaitingForGate] = createSignal(false)
  let abortProcessing = false
  let gateResolve: (() => void) | undefined
  let sourceInput: TextareaRenderable | undefined
  let pendingPaths: string[] | undefined
let nameInput: TextareaRenderable | undefined
  let startupTimer: ReturnType<typeof setInterval> | undefined

  const selectedExtensions = createMemo(() =>
    importOptions()
      .filter((item) => item.selected)
      .map((item) => item.ext),
  )

  const totalSteps = 11
  const stepIndex = createMemo(() => {
    if (step() === "path") return 1
    if (step() === "name") return 2
    if (step() === "tools") return 3
    if (step() === "scan") return 4
    if (step() === "imports") return 5
    if (step() === "setup") return 6
    if (step() === "direct") return 7
    if (step() === "markitdown") return 8
    if (step() === "ocr") return 9
    if (step() === "verification") return 10
    if (step() === "provider") return 11
    if (step() === "startup") return 11
    if (step() === "done") return totalSteps
    return totalSteps
  })

  const appendLogLine = (...lines: string[]) =>
    setLogLines((prev) => {
      const result = [...prev]
      for (const line of lines) {
        if (line.startsWith("\r")) {
          const clean = line.replace(/^\r+/, "").trimEnd()
          if (result.length > 0 && clean) result[result.length - 1] = clean
          else if (clean) result.push(clean)
        } else {
          result.push(line.trimEnd())
        }
      }
      return result.slice(-200)
    })

  const clearLog = () => setLogLines([])


  const focusSourceInput = () => {
    queueMicrotask(() => {
      if (!sourceInput || sourceInput.isDestroyed) return
      sourceInput.focus()
      sourceInput.gotoLineEnd()
    })
  }

  const focusSourceEntry = (id: number) => {
    queueMicrotask(() => {
      const input = sourceInputs.get(id)
      if (!input || input.isDestroyed) return
      input.focus()
      input.gotoLineEnd()
    })
  }

  const addSourcePath = (options?: { focusNewInput?: boolean }) => {
    const id = nextSourceId++
    const nextIndex = sourcePaths().length
    setSourcePaths((prev) => [...prev, { id }])
    setFocusedSource((current) => nextFocusedSourceIndexForAppend(current, nextIndex, options))
    if (options?.focusNewInput === false) return
    focusSourceEntry(id)
  }

  const removeSourcePath = (id: number) => {
    setSourcePaths((prev) => {
      if (prev.length <= 1) return prev
      pathSnapshot.delete(id)
      sourceInputs.delete(id)
      return prev.filter((e) => e.id !== id)
    })
  }

  const workflow = createWorkflowGuard()
  const pathSnapshot = new Map<number, string>()
  const sourceInputs = new Map<number, TextareaRenderable>()

  const readPathText = (id: number) => {
    const live = sourceInputs.get(id)?.plainText?.trim()
    if (live) return live
    return pathSnapshot.get(id)?.trim() ?? ""
  }

  const snapshotSourcePaths = () => {
    for (const entry of sourcePaths()) {
      const text = sourceInputs.get(entry.id)?.plainText ?? pathSnapshot.get(entry.id) ?? ""
      pathSnapshot.set(entry.id, text)
    }
  }

  const blurSourceInputs = () => {
    for (const input of sourceInputs.values()) blurIfFocused(input)
    blurIfFocused(sourceInput)
  }

  onCleanup(() => {
    clearInterval(startupTimer)
    clearInterval(spinTimer)
  })

  const sourceInputFocused = () => focusedSourceIndex() >= 0

  const focusedSourceIndex = () => {
    const paths = sourcePaths()
    for (let i = 0; i < paths.length; i++) {
      const input = sourceInputs.get(paths[i]!.id)
      if (input && !input.isDestroyed && input.focused) return i
    }
    return -1
  }

  const cycleFocusedSource = (offset: number) => {
    const paths = sourcePaths()
    const current = focusedSourceIndex()
    if (current < 0 || paths.length === 0) return
    const next = (current + offset + paths.length) % paths.length
    setFocusedSource(next)
    const entry = paths[next]
    if (entry) focusSourceEntry(entry.id)
  }

  const allPathsResolved = () =>
    resolveExistingUserPaths(sourcePaths().map((entry) => readPathText(entry.id)))

  const validateSinglePath = (p: string): "valid" | "invalid" => {
    try {
      if (!existsSync(p)) return "invalid"
      const st = statSync(p)
      if (st.isFile()) return "valid"
      if (st.isDirectory()) return readdirSync(p).length > 0 ? "valid" : "invalid"
      return "invalid"
    } catch {
      return "invalid"
    }
  }

  const defaultWorkspaceName = createMemo(() => {
    const resolved = allPathsResolved()
    if (resolved.length === 0) return "workspace"
    const first = resolved[0]!
    const base = path.basename(first)
    return base || "workspace"
  })

  const hasValidPaths = createMemo(() => {
    const entries = sourcePaths()
    return entries.some((e) => pathValidities[e.id] === "valid")
  })

  const goHome = () => navigate({ type: "global" })
  const leavePathStep = () => {
    goHome()
  }

  const handleBackPress = () => {
    if (step() === "path") leavePathStep()
    else moveBack()
  }

  const stopActiveWork = () => {
    if (gateResolve) { gateResolve(); gateResolve = undefined }
    workflow.bump()
    abortProcessing = true
    setBusy(false)
    setWaitingForGate(false)
  }

  const moveBack = () => {
    const from = step()
    stopActiveWork()
    if (step() === "name") { logAction("back", `from ${step()} to path`); setStep("path"); return }
    if (step() === "tools") { logAction("back", `from ${step()} to name`); setStep("name"); return }
    if (step() === "scan") { logAction("back", `from ${step()} to path`); setStep("path"); return }
    if (step() === "setup" || step() === "direct" || step() === "markitdown" || step() === "ocr" || step() === "verification") { logAction("back", `from ${step()} to scan`); setStep("scan"); return }
    if (step() === "provider") {
      setGateLabel("Choose provider")
      setGateAction(() => () => {
        setWaitingForGate(false)
        setStep("provider")
      })
      setWaitingForGate(true)
      setStep("verification")
      return
    }
    if (step() === "startup") { setStep("provider"); return }
    if (step() === "error") {
      setStep(importOptions().length > 0 ? "imports" : "path")
    }
  }

  const handleInterrupt = () => {
    if (!shouldCancelSpinosaWorkOnCtrlC({
      step: step(),
      busy: busy(),
      waitingForGate: waitingForGate(),
      cancellableSteps: CANCELABLE_STEPS,
    })) {
      exit()
      return
    }

    appendLogLine("Cancellation requested. Stopping current Spinosa operation...")
    moveBack()
  }

  const renderToolSummaryLine = (check: ToolCheckResult): string => {
    const icon = check.status === "available" ? "✓" : check.status === "missing" ? "✗" : "▁"
    const detail = check.detail ? ` | ${check.detail}` : ""
    return `${icon} ${check.label} — ${check.status}${detail}`
  }

  const generateToolCheckLines = (): ToolCheckResult[] => [
    { label: "PPU PaddleOCR", status: "checking", detail: "scanned PDFs and images" },
    { label: "MarkItDown", status: "checking", detail: "Office docs, EPUB, HTML, text PDFs" },
    { label: "PDF.js", status: "checking", detail: "PDF text extraction and page rendering" },
  ]

  const runToolCheck = async () => {
    logStep("tools", "Checking document processing tools")
    const checks: ToolCheckResult[] = [
      { label: "PPU PaddleOCR", status: "checking", detail: "scanned PDFs and images" },
      { label: "MarkItDown", status: "checking", detail: "Office docs, EPUB, HTML, text PDFs" },
      { label: "PDF.js", status: "checking", detail: "PDF text extraction and page rendering" },
    ]
    setToolChecks(checks)
    setStep("tools")
    spinOn()

    await delay(80)
    const toolStatus = await detectDocumentTools()
    const results: ToolCheckResult[] = [
      { label: "PPU PaddleOCR", status: toolStatus.ocr ? "available" : "missing", detail: "scanned PDFs and images" },
      { label: "MarkItDown", status: toolStatus.markitdown ? "available" : "missing", detail: "Office docs, EPUB, HTML, text PDFs" },
      { label: "PDF.js", status: toolStatus.pdfjs ? "available" : "missing", detail: "PDF text extraction and page rendering" },
    ]
    setToolChecks(results)
    for (const r of results) logTool(r.label, r.status, r.detail)
    spinOff()
  }

  const runToolRepair = async () => {
    logAction("repair", "Tools missing — repairing")
    // Set all missing tools back to checking
    setToolChecks((prev) => prev.map((t) => t.status === "missing" ? { ...t, status: "checking" as const } : t))
    await delay(80)
    const bv = await readBundledFrameworkVersion()
    const channel = bv && isPrereleaseFrameworkVersion(bv) ? "beta" : "stable"
    await runReinstall({
      channel,
      onStdout: (chunk) => {
        const clean = stripAnsi(chunk)
        if (clean) appendLogLine(clean)
      },
      onStderr: (chunk) => {
        const clean = stripAnsi(chunk)
        if (clean) appendLogLine(clean)
      },
    })
    // Re-check after repair
    await delay(200)
    const toolStatus = await detectDocumentTools()
    const results = [
      { label: "PPU PaddleOCR", status: toolStatus.ocr ? "available" : "missing", detail: "scanned PDFs and images" },
      { label: "MarkItDown", status: toolStatus.markitdown ? "available" : "missing", detail: "Office docs, EPUB, HTML, text PDFs" },
      { label: "PDF.js", status: toolStatus.pdfjs ? "available" : "missing", detail: "PDF text extraction and page rendering" },
    ] as ToolCheckResult[]
    setToolChecks(results)
    for (const r of results) logTool(r.label, r.status, r.detail)
    appendLogLine("Tool repair complete.")
  }

  const handleToolAction = () => {
    if (busy()) return
    const checks = toolChecks()
    const needsRepair = checks.some((t) => t.status === "missing")
    if (needsRepair) {
      logAction("repair-tools", `${checks.filter(t => t.status === "missing").length} tools missing`)
      void runToolRepair().catch((err) => {
        logError("runToolRepair", err)
        appendLogLine(`Tool repair failed: ${err instanceof Error ? err.message : String(err)}`)
      })
    } else if (checks.every((t) => t.status === "available")) {
      logAction("start-scan", "All tools ready")
      void startScan()
    }
  }

  const startScan = async () => {
    const resolved = pendingPaths
    if (!resolved || resolved.length === 0) { logError("startScan", "No pending paths"); setStep("error"); return }
    setSourceIsCloud(resolved.some((p) => isCloudStoragePath(p)))
    const shouldAbort = () => abortProcessing
    logStep("scan", "Scanning source folder")
    clearLog()
    setScanDone(false)
    setScanningFile("")
    setScanCount(0)
    setStep("scan")
    await delay(100)
    spinOn()

    try {
      console.error("[scan] startScan begin", resolved)
      let mergedOptions: ImportOption[] = []
      for (const src of resolved) {
        appendLogLine(`Scanning: ${src}`)
        let scanned = 0
        console.error("[scan] buildNewWorkspacePreview ->", src)
        const scanPreview = await buildNewWorkspacePreview(src, workspaceName() || defaultWorkspaceName(), (rel, isFile, discovered) => {
          setScanningFile(rel)
          setScanTotal((t) => t + discovered)
          if (isFile) { scanned++; setScanCount((c) => c + 1) }
        }, shouldAbort)
        console.error("[scan] buildNewWorkspacePreview done ->", src, "options:", scanPreview.importOptions.length)
        setPreview(scanPreview)
        for (const opt of scanPreview.importOptions) {
          const existing = mergedOptions.find((m) => m.ext === opt.ext)
          if (existing) { existing.count += opt.count; existing.bytes += opt.bytes }
          else { mergedOptions.push({ ...opt }) }
        }
      }
      console.error("[scan] merged options:", mergedOptions.length)
      setImportOptions(mergedOptions)
      clearLog()
      spinOff()
      setScanDone(true)
      console.error("[scan] scanDone=true")
      logAction("scan-done", `${mergedOptions.length} file types found`)
    } catch (err) {
      console.error("[scan] startScan threw", err)
      logError("startScan", err)
      appendLogLine(`Scan failed: ${err instanceof Error ? err.message : String(err)}`)
      setStep("error")
    }
  }


  const continueFromPath = async () => {
    if (busy()) return
    logAction("continue", "Path step → Name step")
    snapshotSourcePaths()
    const resolved = allPathsResolved()
    if (resolved.length === 0) {
      appendLogLine("At least one valid source path is required.")
      setStep("error")
      return
    }
    for (const p of resolved) {
      if (!existsSync(p)) {
        appendLogLine(`Source folder does not exist: ${p}`)
        setStep("error")
        return
      }
    }
    pendingPaths = resolved
    if (!workspaceName()) setWorkspaceName(defaultWorkspaceName())
    logStep("name", `Sources: ${resolved.join(", ")}`)
    setStep("name")
  }

  const continueFromName = () => {
    const primarySource = pendingPaths?.[0]
    const nextWorkspaceName = workspaceName().trim() || defaultWorkspaceName()
    if (primarySource) setCreatedWorkspace(resolveWorkspacePath(primarySource, nextWorkspaceName))
    logAction("continue", "Name step → Tools step")
    void runToolCheck()
  }

  const continueFromImports = () => {
    if (selectedExtensions().length === 0) {
      appendLogLine("Select at least one file type to continue.")
      logError("continueFromImports", "No file types selected")
      setStep("error")
      return
    }
    logAction("continue", `Imports → Processing (${selectedExtensions().length} types: ${selectedExtensions().join(",")})`)
    startProcessing()
  }


  const gate = (label = "Continue") => new Promise<void>((resolve) => {
    gateResolve = resolve
    logGate(label)
    setGateLabel(label)
    setGateAction(() => () => { logAction("gate-click", label); setWaitingForGate(false); gateResolve = undefined; resolve() })
    setWaitingForGate(true)
  })

  const startProcessing = async () => {
    if (busy()) return
    const resolved = pendingPaths
    if (!resolved || resolved.length === 0) {
      appendLogLine("At least one valid source path is required.")
      setStep("error")
      return
    }
    setBusy(true)
    clearLog()
    setFailedCount(0)
    setProcessingDone(false)
    setProgCurrent(0)
    setProgTotal(1)
    setProcessingFile("")
    setProcessingStatus("Starting...")
    abortProcessing = false
    const generation = workflow.bump()
    const shouldAbort = () => abortProcessing || !workflow.active(generation)
    gateResolve = undefined
    spinOn()
    await delay(200)
    const extensions = selectedExtensions().join(",")
    const primarySource = resolved[0]!
    const plannedWorkspace = preview()?.workspacePath ?? suggestWorkspacePath(primarySource)
    if (plannedWorkspace) setCreatedWorkspace(plannedWorkspace)
    let totalFailed = 0
    let totalRenamed = 0

    const sharedProg = new ProgressEmitter()
    sharedProg.on((e) => {
      // Use the emitter as the source of truth for both numerator and denominator
      // so the bar self-corrects even if the pre-set total was wrong/empty.
      if (e.total > 0) setProgTotal(e.total)
      if (e.current >= 0) setProgCurrent(e.current)
      if (e.relPath) setProcessingFile(e.relPath)
    })
    const onPhaseLog = (msg: string) => {
      if (msg.startsWith("  ")) {
        // Per-file progress lines (e.g. "file → OCR ...") are shown as the
        // status only; the emitter already drives processingFile, so setting it
        // here too would duplicate the same text as a second line.
        const label = msg.trim()
        setProcessingStatus(label)
        return
      }
      appendLogLine(msg)
    }

    try {
      setStep("setup")
      setProcessingStatus("Creating workspace...")
      // Drive the progress bar off the setup sub-steps emitted by createWorkspace
      // so the bar is truthful (0% → 100%) instead of a frozen placeholder.
      const setupSteps = [
        "Creating workspace directory",
        "Resuming interrupted workspace",
        "Copying workspace template",
        "Creating user-state directories",
        "Writing workspace metadata",
        "Registering in global registry",
        "Writing setup files",
      ]
      let setupDone = 0
      setProgTotal(setupSteps.length)
      setProgCurrent(0)
      const setupProgress = (msg: string) => {
        appendLogLine(msg)
        setProcessingStatus(msg)
        if (setupSteps.some((s) => msg.startsWith(s))) {
          setupDone = Math.min(setupSteps.length, setupDone + 1)
          setProgCurrent(setupDone)
        }
      }
      await yieldToEventLoop()
      const frameworkRoot = resolveFrameworkRoot()
      if (!frameworkRoot) {
        appendLogLine("Framework root not found — cannot create workspace.")
        spinOff()
        setBusy(false)
        setStep("error")
        return
      }
      const wsResult = await createWorkspace({
        corpusPath: primarySource,
        frameworkRoot,
        workspaceName: workspaceName() || defaultWorkspaceName(),
        onProgress: setupProgress,
        onRecover: (msg) => appendLogLine(`Note: ${msg}`),
        shouldAbort,
      })
      if (shouldAbort()) return
      if (!wsResult.success) { setStep("error"); return }
      // Registration / status writes are non-essential: a wedged registry lock
      // or missing marker must not abort an otherwise-good workspace.
      const statusOk = await writeWorkspaceStatus(wsResult.workspacePath, "importing")
      if (!statusOk) appendLogLine("Warning: could not write workspace status marker (non-fatal).")
      const ctx: OnboardingContext = await prepareOnboarding({
        workspacePath: wsResult.workspacePath,
        frameworkRoot,
        sourcePath: primarySource,
        projectTitle: workspaceName() || path.basename(primarySource),
        flagExtensions: extensions,
      }) as OnboardingContext
      if ("success" in ctx && !ctx.success) { setStep("error"); return }
      setCreatedWorkspace(ctx.workspacePath)

      setProcessingStatus("Preparing import plan...")
      const classified = await scanAndClassifySource(ctx.sourcePath, ctx.rawDir, ctx.batches, undefined, shouldAbort)
      if (!classified) { setStep("error"); return }
      let mr: PhaseResult = { converted: 0, skipped: 0, failed: 0, renamed: 0, recoverable: [] }
      let or: PhaseResult = { converted: 0, skipped: 0, failed: 0, renamed: 0, recoverable: [] }
      const totalMd = classified.markitdownFiles.length
      const totalOcr = classified.ocrFiles.length
      // Phase B1: Direct copy
      const totalDirect = classified.directFiles.length
      appendLogLine(`[diag] direct=${totalDirect} markitdown=${classified.markitdownFiles.length} ocr=${classified.ocrFiles.length}`)
      // Seed the denominator; the progress listener also drives it from emitter events.
      setProgTotal(totalDirect > 0 ? totalDirect : 1)
      setProgCurrent(0)
      setProcessingStatus("Preparing direct copy...")
      await delay(1000)
      const dr = await processDirectCopy(classified.directFiles, sharedProg, onPhaseLog, undefined, shouldAbort, (attempt, reason) => {
        setProcessingStatus(`Retrying file (attempt ${attempt}): ${reason}`)
      }, (original, renamed) => { totalRenamed++; appendLogLine(`  renamed (name too long): ${original} → ${renamed}`) })
      if (dr.failed > 0) totalFailed += dr.failed
      if (dr.renamed > 0) totalRenamed += dr.renamed
      if (shouldAbort()) { spinOff(); setBusy(false); return }
      setProcessingStatus(`Direct copy complete — ${totalDirect} files`)
      await delay(1000)
      if (classified.markitdownFiles.length > 0) {
        setBusy(false)
        await gate("Process text files")
        if (shouldAbort()) { spinOff(); setBusy(false); return }
        setBusy(true)
        setStep("markitdown")
        setProgTotal(totalMd)
        setProgCurrent(0)
        setProcessingStatus("Preparing MarkItDown conversion...")
        await delay(1000)
        mr = await processMarkitdown(classified.markitdownFiles, classified.logsDir, sharedProg, onPhaseLog, shouldAbort)
        if (mr.failed > 0) totalFailed += mr.failed
        if (mr.renamed > 0) totalRenamed += mr.renamed
        if (shouldAbort()) { spinOff(); setBusy(false); return }
        setProcessingStatus(`MarkItDown complete — ${totalMd} files`)
        await delay(1000)
      } else {
        appendLogLine("MarkItDown: 0 files to convert — skipping")
      }

      if (classified.ocrFiles.length > 0) {
        setBusy(false)
        await gate("Process images and PDFs")
        if (shouldAbort()) { spinOff(); setBusy(false); return }
        setBusy(true)
        setStep("ocr")
        setProgTotal(totalOcr)
        setProgCurrent(0)
        setProcessingStatus("Preparing OCR...")
        await delay(1000)
        or = await processOcr(classified.ocrFiles, classified.logsDir, sharedProg, onPhaseLog, shouldAbort)
        if (or.failed > 0) totalFailed += or.failed
        if (or.renamed > 0) totalRenamed += or.renamed
        if (shouldAbort()) { spinOff(); setBusy(false); return }
      } else {
        appendLogLine("OCR: 0 files to convert — skipping")
      }
      // Phase C: Finalize (verification)
      setStep("verification")
      setProcessingStatus("Verifying import...")
      const result = await completeOnboarding(ctx, { direct: dr, markitdown: mr, ocr: or }, {
        workspacePath: ctx.workspacePath,
        frameworkRoot,
        sourcePath: ctx.sourcePath,
        projectTitle: ctx.projectTitle,
        onPhase: (_phase, msg) => {
          setProcessingStatus(msg)
          appendLogLine(msg)
        },
        shouldAbort,
      })
      if (shouldAbort()) return

      if (result.success) {
        // Import additional source paths
        let extraCopied = 0, extraMd = 0, extraOcr = 0, extraDirect = 0, extraMdTotal = 0, extraOcrTotal = 0, extraFailed = 0
        for (let i = 1; i < resolved.length; i++) {
          const extra = resolved[i]!
          setProcessingStatus(`Importing: ${extra}`)
          const addFileResult = await addFiles({
            workspacePath: ctx.workspacePath,
            sourcePath: extra,
            sourceIsDir: true,
            extensions,
            onProgress: (msg) => appendLogLine(msg),
            shouldAbort,
          })
          // Fold the extra-source results into the summary totals so a
          // multi-source import is reported accurately.
          extraCopied += addFileResult.copied
          extraMd += addFileResult.mdConverted
          extraOcr += addFileResult.ocrConverted
          extraDirect += addFileResult.copied + addFileResult.skipped
          extraMdTotal += addFileResult.mdConverted + addFileResult.mdSkipped
          extraOcrTotal += addFileResult.ocrConverted + addFileResult.ocrSkipped
          extraFailed += addFileResult.failed + addFileResult.mdFailed + addFileResult.ocrFailed
          if (!addFileResult.success) {
            appendLogLine(`  ⚠ Partial import for ${extra}`)
          }
        }
        dr.converted += extraCopied
        mr.converted += extraMd
        or.converted += extraOcr
        totalFailed += extraFailed

        setFailedCount(totalFailed)
        setImportSummary(
          `${dr.converted}/${totalDirect + extraDirect} copied · ${mr.converted}/${totalMd + extraMdTotal} markitdown · ${or.converted}/${totalOcr + extraOcrTotal} ocr` +
          (totalRenamed > 0 ? ` · ${totalRenamed} renamed` : "") +
          (totalFailed > 0 ? ` · ${totalFailed} failed` : ""),
        )
        setProcessingDone(true)
        setProcessingStatus("All done")
        setGateLabel("Go to the workspace")
        setGateAction(() => () => { setWaitingForGate(false); void finishProvider("spinosa") })
        setWaitingForGate(true)
      } else {
        setStep("error")
      }
    } catch (err) {
      if (isSpinosaCancellationError(err) || shouldAbort()) {
        appendLogLine("Spinosa import cancelled.")
        setProcessingStatus("Cancelled.")
        return
      }
      appendLogLine(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setStep("error")
    } finally {
      spinOff()
      setBusy(false)
    }
  }


  const stopStartupProgress = () => {
    if (startupTimer) {
      clearInterval(startupTimer)
      startupTimer = undefined
    }
  }

  const startStartupProgress = () => {
    const startedAt = Date.now()
    setStartupElapsedMs(0)
    setStartupError(undefined)
    setStartupMessage(formatStartupProgressMessage(0))
    stopStartupProgress()
    startupTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt
      setStartupElapsedMs(elapsed)
      setStartupMessage(formatStartupProgressMessage(elapsed))
    }, STARTUP_PROGRESS_INTERVAL_MS)
  }

  const finishProvider = async (cliValue: string) => {
    logAction("finish-provider", `CLI: ${cliValue}`)
    try {
      setStep("startup")
      startStartupProgress()
      const workspacePath = createdWorkspace()
      if (workspacePath) {
        await writePreferredCli(workspacePath, cliValue)
      }
      setSelectedCli(CLI_OPTIONS.findIndex((o) => o.value === cliValue))

      if (cliValue === "spinosa") {
        if (workspacePath) {
          const prompt = await readStartupPrompt(workspacePath)
          spinosa.queuePrompt(
            buildStartupChatPrompt(
              prompt ?? "Error: startup-prompt.md not found. Run the startup indexing workflow manually.",
            ),
            workspacePath,
          )
          setStartupMessage("Startup complete")
          stopStartupProgress()
          await delay(300)
          await spinosa.openWorkspace(workspacePath, { route: { type: "global" } })
        }
      } else {
        if (workspacePath) {
          await tsRunStartup({ workspacePath, frameworkRoot: resolveFrameworkRoot() ?? "", preferredCli: cliValue })
        }
        setStartupMessage("Startup complete")
        stopStartupProgress()
        await delay(300)
        goHome()
      }
      logAction("finish-done", `Workspace: ${workspacePath}, CLI: ${cliValue}`)
    } catch (err) {
      stopStartupProgress()
      logError("finishProvider", err)
      const msg = err instanceof Error ? err.message : String(err)
      setStartupError(msg)
      setStartupMessage(formatStartupProgressMessage(Math.max(startupElapsedMs(), STARTUP_PROGRESS_THRESHOLD_MS)))
      appendLogLine(`Failed to launch ${cliValue}: ${msg}`)
      setStep("startup")
    }
  }
  const finish = async () => {
    const workspacePath = createdWorkspace()
    if (workspacePath) {
      await spinosa.openWorkspace(workspacePath)
      return
    }
    goHome()
  }

  const toggleImport = (index: number) =>
    setImportOptions((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, selected: !item.selected } : item)),
    )

  const toggleAllImports = () => {
    const shouldEnableAll = importOptions().some((item) => !item.selected)
    setImportOptions((items) => items.map((item) => ({ ...item, selected: shouldEnableAll })))
  }

  onMount(() => {
    focusSourceInput()

    // Auto-add new path input when last input has content
    const autoAddTimer = setInterval(() => {
      if (step() !== "path") return
      const entries = sourcePaths()
      if (entries.length === 0) return
      const last = entries[entries.length - 1]
      const input = sourceInputs.get(last.id)
      if (!input || input.isDestroyed) return
      if (input.plainText?.trim()?.length > 0) {
        addSourcePath({ focusNewInput: false })
      }
    }, 300)

    // Path validation: periodically re-validate all path inputs
    const validateTimer = setInterval(() => {
      if (step() !== "path") return
      for (const entry of sourcePaths()) {
        const text = normalizePathInput(readPathText(entry.id))
        if (!text) {
          setPathValidities(entry.id, "unchecked")
          continue
        }
        const resolved = resolveUserPath(text)
        if (!resolved) {
          setPathValidities(entry.id, "invalid")
          continue
        }
        setPathValidities(entry.id, validateSinglePath(resolved))
      }
    }, 400)

    // Ctrl+C closes the TUI (SIGINT) — handled in the keymap intercept above.
    // No back-navigation wrapping: SIGINT always terminates the session.

    // Sync workspace name from textarea
    const nameSyncTimer = setInterval(() => {
      if (step() !== "name") return
      if (!nameInput || nameInput.isDestroyed) return
      setWorkspaceName(nameInput.plainText?.trim() ?? defaultWorkspaceName())
    }, 300)
    const off = keymap.intercept("key", ({ event, consume }) => {
      if (modeStack.current() !== OPENCODE_BASE_MODE) return
      setHoveredButton(null)

      if (event.ctrl && event.name === "c") {
        handleInterrupt()
        consume(); return
      }
      if (event.name === "escape") {
        if (step() === "path") leavePathStep()
        else moveBack()
        consume(); return
      }

      if (busy()) return

      if (waitingForGate() && (step() === "tools" || step() === "scan" || step() === "setup" || step() === "direct" || step() === "markitdown" || step() === "ocr" || step() === "verification") && event.name === "return") {
        gateAction()()
        consume(); return
      }

      if (step() === "path") {
        const pathsLen = sourcePaths().length
        const editingIndex = focusedSourceIndex()

        if (editingIndex >= 0) {
          if (event.name === "up" || event.name === "k") {
            cycleFocusedSource(-1)
            consume(); return
          }
          if (event.name === "down" || event.name === "j") {
            cycleFocusedSource(1)
            consume(); return
          }
        }

        if (!sourceInputFocused()) {
          if (event.name === "up" || event.name === "k") {
            setFocusedSource((v) => Math.max(0, v - 1))
            consume(); return
          }
          if (event.name === "down" || event.name === "j") {
            setFocusedSource((v) => Math.min(pathsLen + 1, v + 1))
            consume(); return
          }
          if (event.name === "return") {
            const focus = focusedSource()
            if (focus < pathsLen) {
              const entry = sourcePaths()[focus]
              if (entry) focusSourceEntry(entry.id)
            } else if (focus === pathsLen) {
              leavePathStep()
            } else {
              void continueFromPath()
            }
            consume(); return
          }
        }
      }

      if (step() === "name") {
        if (event.name === "return") {
          continueFromName()
          consume(); return
        }
        if (event.name === "escape") {
          moveBack()
          consume(); return
        }
      }

      if (step() === "scan" && scanDone()) {
        const listLength = importOptions().length + 1
        if (event.name === "up" || event.name === "k") {
          setSelectedImport((value) => Math.max(0, value - 1))
          consume(); return
        }
        if (event.name === "down" || event.name === "j") {
          setSelectedImport((value) => Math.min(listLength - 1, value + 1))
          consume(); return
        }
        if (event.name === "space") {
          if (selectedImport() === 0) {
            toggleAllImports()
          } else {
            toggleImport(selectedImport() - 1)
          }
          consume(); return
        }
        if (event.name === "a") {
          toggleAllImports()
          consume(); return
        }
        if (event.name === "return") {
          continueFromImports()
          consume(); return
        }
      }

      if (step() === "provider") {
        if (event.name === "up" || event.name === "k") {
          setSelectedCli((value) => Math.max(0, value - 1))
          consume(); return
        }
        if (event.name === "down" || event.name === "j") {
          setSelectedCli((value) => Math.min(CLI_OPTIONS.length - 1, value + 1))
          consume(); return
        }
        if (event.name === "return") {
          void finishProvider(CLI_OPTIONS[selectedCli()]!.value).catch((err) => appendLogLine(`Provider error: ${err instanceof Error ? err.message : String(err)}`))
          consume(); return
        }
      }

      if (step() === "done" && event.name === "return") {
        void finish()
        consume(); return
      }

      if (step() === "error" && event.name === "return") {
        moveBack()
        consume(); return
      }
    })
    onCleanup(() => {
      clearInterval(autoAddTimer)
      clearInterval(validateTimer)
      clearInterval(nameSyncTimer)
      stopActiveWork()
      off()
    })
  })

  createEffect(
    on(
      step,
      (current, previous) => {
        if (current === "path" && current !== previous) focusSourceInput()
        if (current === "name" && current !== previous) {
          queueMicrotask(() => {
            if (!nameInput || nameInput.isDestroyed) return
            nameInput.focus()
            nameInput.gotoLineEnd()
          })
        }
      },
      { defer: true },
    ),
  )

  return (
    <CenteredColumn>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box width="100%" maxWidth={72} flexDirection="column" gap={1}>
          <box flexDirection="row" alignItems="center" gap={1}>
            <box
              paddingLeft={2}
              paddingRight={2}
              paddingTop={1}
              paddingBottom={1}
              backgroundColor={buttonBackground(theme, hoveredButton() === "back")}
              onMouseOver={() => {
                blurSourceInputs()
                setHoveredButton("back")
              }}
              onMouseOut={() => setHoveredButton(null)}
              onMouseDown={() => deferPress(handleBackPress)}
            >
              <text fg={buttonText(theme, hoveredButton() === "back", theme.text)}>←</text>
            </box>
            <text fg={theme.text}>
              <span style={{ bold: true }}>{busy() ? `${waveString(spinIdx())} ` : ""}Create Spinosa workspace</span>
            </text>
          </box>
          <text fg={theme.textMuted}>
            Step {stepIndex()} of {totalSteps}
            {step() === "name" ? " — naming your workspace" : ""}
            {step() === "tools" ? " — checking your document tools" : ""}
            {step() === "scan" ? " — scanning your source" : ""}
            {step() === "imports" ? " — selecting file types to import" : ""}
            {step() === "setup" ? " — creating your workspace" : step() === "direct" ? " — copying files into raw/" : step() === "markitdown" ? " — converting documents with MarkItDown" : step() === "ocr" ? " — running OCR on images and PDFs" : step() === "verification" ? " — verifying the import" : ""}
            {step() === "provider" ? " — choosing your LLM provider" : ""}
            {step() === "startup" ? " — preparing your startup" : ""}
            {step() === "done" ? " — your workspace is ready" : ""}
            {step() === "error" ? " — fixing the issue and retrying" : ""}
          </text>
          <Show when={sourceIsCloud() && (step() === "scan" || step() === "setup" || step() === "direct" || step() === "markitdown" || step() === "ocr" || step() === "verification")}>
            <text fg={theme.error}>  ⚠ cloud folder — scans & copies can be slow due to sync latency</text>
          </Show>

          <Show when={step() === "path"}>
            <WizardPanel theme={theme} accent>
              <text fg={theme.textMuted}>Source folders</text>
              <text fg={theme.textMuted}>
                Add one or more source folders. Spinosa scans them, lets you choose file types, then creates a workspace beside the first folder and imports the selected files.
              </text>
              <box flexDirection="column" gap={1} paddingTop={1}>
                <For each={sourcePaths()}>
                  {(entry, index) => (
                    <box
                      flexDirection="row"
                      gap={0}
                      alignItems="center"
                      backgroundColor={
                        focusedSource() === index()
                          ? theme.backgroundElement
                          : undefined
                      }
                      border={focusedSource() === index() ? ["left"] : []}
                      borderColor={theme.borderActive}
                    >
                      <box
                        flexGrow={1}
                        onMouseDown={() => {
                          setFocusedSource(index())
                          focusSourceEntry(entry.id)
                        }}
                      >
                        <textarea
                          ref={(value: TextareaRenderable) => {
                            sourceInputs.set(entry.id, value)
                            if (index() === 0) sourceInput = value
                            value.traits = { status: "PATH" }
                          }}
                          initialValue={pathSnapshot.get(entry.id) ?? ""}
                          placeholder="Paste the corpus folder path"
                          placeholderColor={theme.textMuted}
                          textColor={theme.text}
                          focusedTextColor={theme.text}
                          cursorColor={theme.primary}
                          minHeight={1}
                          maxHeight={1}
                          flexGrow={1}
                          onSubmit={() => {}}
                        />
                      </box>
                      <box
                        paddingLeft={1}
                        paddingRight={1}
                        paddingTop={0}
                        paddingBottom={0}
                      >
                        <text fg={
                          pathValidities[entry.id] === "valid"
                            ? theme.success
                            : pathValidities[entry.id] === "invalid"
                              ? theme.error
                              : theme.textMuted
                        }>
                          {pathValidities[entry.id] === "valid" ? "●" : pathValidities[entry.id] === "invalid" ? "●" : "○"}
                        </text>
                      </box>
                      <box
                        paddingLeft={1}
                        paddingRight={1}
                        paddingTop={0}
                        paddingBottom={0}
                        backgroundColor={theme.backgroundPanel}
                        onMouseOver={() => blurSourceInputs()}
                        onMouseDown={() => deferPress(() => removeSourcePath(entry.id))}
                      >
                        <text fg={theme.textMuted}>✕</text>
                      </box>
                    </box>
                  )}
                </For>
              </box>
            </WizardPanel>
            <WizardActionRow>
              <WizardActionButton
                theme={theme}
                label="Back"
                primary={focusedSource() === sourcePaths().length}
                onHover={() => {
                  blurSourceInputs()
                  setFocusedSource(sourcePaths().length)
                }}
                onPress={leavePathStep}
              />
              <box flexGrow={1} />
              <Show when={hasValidPaths()}>
                <WizardActionButton
                  theme={theme}
                  label="Continue"
                  primary={focusedSource() === sourcePaths().length + 1}
                  onHover={() => {
                    blurSourceInputs()
                    setFocusedSource(sourcePaths().length + 1)
                  }}
                  onPress={() => void continueFromPath()}
                />
              </Show>
            </WizardActionRow>
          </Show>

          <Show when={step() === "name"}>
            <WizardPanel theme={theme} accent>
              <text fg={theme.textMuted}>Workspace name</text>
              <text fg={theme.textMuted}>
                The workspace folder is created beside the first source folder using this name.
              </text>
              <box paddingTop={1} alignItems="stretch">
                <textarea
                  ref={(value: TextareaRenderable) => {
                    value.traits = { status: "NAME" }
                    nameInput = value
                  }}
                  initialValue={workspaceName() || defaultWorkspaceName()}
                  placeholder="Enter workspace name"
                  placeholderColor={theme.textMuted}
                  textColor={theme.text}
                  focusedTextColor={theme.text}
                  cursorColor={theme.primary}
                  minHeight={1}
                  maxHeight={1}
                  onSubmit={() => {}}
                />
              </box>
            </WizardPanel>
            <WizardActionRow>
              <WizardActionButton
                theme={theme}
                label="Back"
                onPress={moveBack}
              />
              <box flexGrow={1} />
              <WizardActionButton
                theme={theme}
                label="Continue"
                primary
                onPress={continueFromName}
              />
            </WizardActionRow>
          </Show>
          <Show when={step() === "tools" || step() === "scan" || step() === "setup" || step() === "direct" || step() === "markitdown" || step() === "ocr" || step() === "verification"}>
            <WizardPanel theme={theme}>
              <Show when={step() === "tools"}>
                <text fg={theme.textMuted}>Document processing tools</text>
                <box flexDirection="column" gap={1} paddingTop={1}>
                  <For each={toolChecks()}>
                    {(check) => {
                      const icon = check.status === "available" ? "●" : check.status === "missing" ? "●" : wavePulse(spinIdx())
                      const color = check.status === "available" ? theme.success : check.status === "missing" ? theme.error : theme.textMuted
                      return (
                        <box flexDirection="row" gap={1} alignItems="center" paddingLeft={1} paddingRight={1}>
                          <text fg={color} attributes={check.status === "checking" ? undefined : TextAttributes.BOLD}>{icon}</text>
                          <text fg={check.status === "checking" ? theme.textMuted : theme.text}> {check.label}</text>
                          <text fg={theme.textMuted} attributes={TextAttributes.DIM}>{check.detail ?? ""}</text>
                        </box>
                      )
                    }}
                  </For>
                </box>
                <Show when={logLines().length > 0}>
                  <box height={1} />
                  <LogScrollbox theme={theme} lines={logLines()} viewportHeight={dimensions().height} />
                </Show>
              </Show>
              <Show when={step() === "scan"}>
                <Show when={!scanDone()}>
                  <text fg={theme.text}>{waveString(spinIdx())}</text>
                  <text fg={theme.textMuted}>{scanningFile() || "…"}</text>
                  <text fg={theme.textMuted}>Scanning {scanCount()} / {scanTotal()}</text>
                  <Show when={logLines().length > 0}>
                    <box height={1} />
                    <LogScrollbox theme={theme} lines={logLines()} viewportHeight={dimensions().height} />
                  </Show>
                </Show>
                <Show when={scanDone()}>
                  <text fg={theme.textMuted}>Select file types to import</text>
                  <ImportOptionsSelector
                    theme={theme}
                    options={importOptions()}
                    selectedIndex={selectedImport()}
                    viewportHeight={dimensions().height}
                    formatDetail={(item) => formatBytes(item.bytes)}
                    onSelectIndex={setSelectedImport}
                    onToggleAll={toggleAllImports}
                    onToggleItem={toggleImport}
                  />
                  <text fg={theme.textMuted}>↑↓ move · space toggle · a toggle all · enter continue</text>
                </Show>
              </Show>
              <Show when={step() === "setup" || step() === "direct" || step() === "markitdown" || step() === "ocr" || step() === "verification"}>
                <Show when={!processingDone()}>
                  <ProgressBar
                    theme={theme}
                    current={progCurrent()}
                    total={progTotal()}
                    status={processingStatus()}
                    fileName={processingFile()}
                    barWidth={20}
                  />
                </Show>
                <Show when={processingDone()}>
                  <text fg={theme.success}>● Import complete</text>
                  <Show when={importSummary() !== ""}>
                    <box paddingTop={1} flexDirection="column" gap={0}>
                      <text fg={theme.textMuted}>{importSummary()}</text>
                    </box>
                  </Show>
                  <Show when={failedCount() > 0}>
                    <box paddingTop={1} flexDirection="column" gap={0}>
                      <text fg={theme.textMuted}>{failedCount()} file{failedCount() === 1 ? "" : "s"} failed — check logs for details</text>
                    </box>
                  </Show>
                </Show>
              </Show>
            </WizardPanel>
            <WizardActionRow>
              <WizardActionButton theme={theme} label="Back" onPress={moveBack} />
              <box flexGrow={1} />
              <Show when={step() === "tools" && toolActionLabel() !== "" && !toolChecks().some((t) => t.status === "checking")}>
                <WizardActionButton
                  theme={theme}
                  label={toolActionLabel()}
                  primary={toolAllReady()}
                  onPress={handleToolAction}
                />
              </Show>
              <Show when={step() === "scan" && scanDone()}>
                <WizardActionButton
                  theme={theme}
                  label="Continue"
                  primary
                  onPress={() => void continueFromImports()}
                />
              </Show>
              <Show when={step() !== "tools" && step() !== "scan" && waitingForGate()}>
                <WizardGateButton theme={theme} label={gateLabel()} action={() => gateAction()()} />
              </Show>
            </WizardActionRow>
          </Show>

          <Show when={step() === "provider"}>
            <WizardPanel theme={theme}>
              <text fg={theme.textMuted}>Choose how to launch startup</text>
              <text fg={theme.textMuted}>
                Choose the tool Spinosa will use after import. Spinosa opens Chat with the setup brief ready; other tools launch with the prompt.
              </text>
               <scrollbox maxHeight={wizardScrollboxMaxHeight(dimensions().height, { min: 4, ratio: 0.5, max: 12 })}>
                <For each={CLI_OPTIONS}>
                  {(item, index) => (
                    <box
                      paddingTop={1}
                      paddingBottom={1}
                      paddingLeft={1}
                      paddingRight={1}
                      backgroundColor={selectedCli() === index() ? buttonBackground(theme, true) : undefined}
                      onMouseOver={() => setSelectedCli(index())}
                      onMouseDown={() => deferPress(() => void finishProvider(item.value))}
                    >
                      <text fg={buttonText(theme, selectedCli() === index(), theme.primary)}>
                        <span style={{ bold: selectedCli() === index() }}>{item.label}</span>
                      </text>
                      <text fg={buttonText(theme, selectedCli() === index(), theme.textMuted)}> {item.description}</text>
                    </box>
                  )}
                </For>
              </scrollbox>
              <text fg={theme.textMuted}>↑↓ move · enter select</text>
            </WizardPanel>
          </Show>

          <Show when={step() === "startup"}>
            <WizardPanel theme={theme}>
              <text fg={theme.textMuted}>Launching startup</text>
              <text fg={startupError() ? theme.error : theme.text}>
                <span style={{ bold: true }}>{startupError() ? "Startup failed" : startupMessage()}</span>
              </text>
              <Show when={!startupError()}>
                <text fg={theme.textMuted}>
                  {startupElapsedMs() >= STARTUP_PROGRESS_THRESHOLD_MS
                    ? `Elapsed ${Math.round(startupElapsedMs() / 100) / 10}s`
                    : "Preparing the setup brief…"}
                </text>
              </Show>
              <Show when={startupError()}>
                <text fg={theme.textMuted}>{startupError()}</text>
              </Show>
            </WizardPanel>
            <WizardActionRow>
              <Show when={startupError()}>
                <WizardActionButton theme={theme} label="Back" onPress={moveBack} />
                <box flexGrow={1} />
                <WizardActionButton
                  theme={theme}
                  label="Retry"
                  primary
                  onPress={() => void finishProvider(CLI_OPTIONS[selectedCli()]?.value ?? "spinosa")}
                />
              </Show>
            </WizardActionRow>
          </Show>

          <Show when={step() === "done" || step() === "error"}>
            <WizardPanel theme={theme}>
              <Show when={step() === "done"}>
                <box gap={1}>
                  <LogoSummary theme={theme} label="Workspace created." />
                  <text fg={theme.textMuted}>
                    Your files are imported. Open the workspace to continue with the setup brief.
                  </text>
                </box>
              </Show>
              <Show when={step() === "error"}>
                <text fg={theme.error}>
                  <span style={{ bold: true }}>Spinosa could not complete this step.</span>
                </text>
                <Show when={logLines().length > 0}>
                  <LogScrollbox theme={theme} lines={logLines()} viewportHeight={dimensions().height} />
                </Show>
              </Show>
            </WizardPanel>
            <WizardActionRow>
              <Show when={step() === "done"}>
                <WizardActionButton
                  theme={theme}
                  label="Open workspace"
                  primary
                  onPress={() => void finish()}
                />
              </Show>
              <Show when={step() === "error"}>
                <WizardActionButton theme={theme} label="Back" onPress={moveBack} />
                <box flexGrow={1} />
                <WizardActionButton theme={theme} label="Retry" primary onPress={() => void continueFromPath()} />
              </Show>
            </WizardActionRow>
          </Show>

          <Toast />
        </box>
        <box flexGrow={1} minHeight={0} />
      </box>
    </CenteredColumn>
  )
}
