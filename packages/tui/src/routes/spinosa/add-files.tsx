import type { ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../../context/theme"
import { useRoute } from "../../context/route"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { Toast, useToast } from "../../ui/toast"
import { scanAndClassifySource, processDirectCopy, processMarkitdown, processOcr } from "@spinosa/core/import/pipeline"
import { isSpinosaCancellationError } from "@spinosa/core/import/cancellation"
import { ProgressEmitter } from "@spinosa/core/progress/progress"
import { ImportBatchManager } from "@spinosa/core/import/batch"
import { tuiLog, logStep, logAction, logTool, logGate, logError, setToastError } from "../../spinosa/log"
import { CenteredColumn } from "../../component/centered-column"
import { SPINOSA_BASE_MODE, useOpencodeKeymap, useOpencodeModeStack } from "../../keymap"
import { useExit } from "../../context/exit"
import { useDialog } from "../../ui/dialog"
import { buttonBackground, buttonText } from "../../util/button"
import {
  buildImportScanPreview,
  detectDocumentTools,
  resolveUserPath,
} from "../../spinosa/onboarding-preview"
import type { CliRunResult } from "../../spinosa/types"
import { readBundledFrameworkVersion, isPrereleaseFrameworkVersion } from "../../spinosa/service"
import { resolveFrameworkRoot } from "@spinosa/core/framework/discovery"
import { normalizePathInput, resolveExistingUserPaths, isCloudStoragePath } from "@spinosa/core/utils/path"
import {
  blurIfFocused,
  confirmSpinosaBack,
  createActiveWorkTracker,
  createWorkflowGuard,
  deferPress,
  delay,
  generateScanLines,
  ImportOptionsSelector,
  nextFocusedSourceIndexForAppend,
  runGuardedBackNavigation,
  shouldCancelSpinosaWorkOnCtrlC,
  shouldConfirmSpinosaBack,
  type ImportOption,
  LogScrollbox,
  LogoSummary,
  ProgressBar,
  stripAnsi,
  WizardActionButton,
  WizardActionRow,
  WizardGateButton,
  WizardPanel,
  yieldToEventLoop,
} from "./wizard-ui"

type WizardStep = "path" | "tools" | "scan" | "direct" | "markitdown" | "ocr" | "done" | "error"

type ToolCheckResult = {
  label: string
  status: "checking" | "available" | "missing"
  detail?: string
}

type SourcePathEntry = {
  id: number
}

const CANCELABLE_STEPS = ["direct", "markitdown", "ocr"] as const

let nextSourceId = 1

/**
 * Reinstall vendor tools via install.sh.
 * Duplicated from onboarding.tsx; kept as a local helper to avoid cross-module coupling.
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

export function AddFiles() {
  const { theme } = useTheme()
  const toast = useToast()
  const { navigate } = useRoute()
  const spinosa = useSpinosaWorkspace()
  const dimensions = useTerminalDimensions()
  const keymap = useOpencodeKeymap()
  const modeStack = useOpencodeModeStack()
  const exit = useExit()
  const dialog = useDialog()
  // ── Core state ────────────────────────────────────────────────────────────
  const [step, setStep] = createSignal<WizardStep>("path")
  const [sourcePaths, setSourcePaths] = createSignal<SourcePathEntry[]>([{ id: 0 }])
  const [logLines, setLogLines] = createSignal<string[]>([])
  const [busy, setBusy] = createSignal(false)
  const [importOptions, setImportOptions] = createSignal<ImportOption[]>([])
  const [selectedImport, setSelectedImport] = createSignal(0)
  const [focusedSource, setFocusedSource] = createSignal(0)
  const [hoveredButton, setHoveredButton] = createSignal<string | null>(null)
  const [processingDone, setProcessingDone] = createSignal(false)
  const [gateLabel, setGateLabel] = createSignal("")
  const [gateAction, setGateAction] = createSignal<() => void>(() => {})
  const [waitingForGate, setWaitingForGate] = createSignal(false)
  const [toolChecks, setToolChecks] = createSignal<ToolCheckResult[]>([])
  const [scanDone, setScanDone] = createSignal(false)
  const [scanningFile, setScanningFile] = createSignal("")
  const [scanCount, setScanCount] = createSignal(0)
  const [scanTotal, setScanTotal] = createSignal(0)
  const [progCurrent, setProgCurrent] = createSignal(0)
  const [progTotal, setProgTotal] = createSignal(1)
  const [processingStatus, setProcessingStatus] = createSignal("")
  const [sourceIsCloud, setSourceIsCloud] = createSignal(false)
  const [processingFile, setProcessingFile] = createSignal("")
  const [failedCount, setFailedCount] = createSignal(0)
  const [importSummary, setImportSummary] = createSignal("")
  const [pathValidities, setPathValidities] = createStore<Record<number, "unchecked" | "valid" | "invalid">>({})

  const WAVE = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]
  const waveString = (f: number) => { let r = ""; for (let i = 0; i < 6; i++) { const p = (i + f) % 14, l = p <= 6 ? p : 13 - p; r += WAVE[l] }; return r }
  const wavePulse = (f: number) => { const p = f % 14; return WAVE[p <= 6 ? p : 13 - p] }
  const waveRow = (f: number, width: number) => { let r = ""; for (let i = 0; i < width; i++) { const angle = (i * Math.PI) / 7 + f * Math.PI / 7; const l = Math.max(0, Math.min(7, Math.round(3.5 + 3.5 * Math.sin(angle)))); r += WAVE[l] }; return r }
  const [spinIdx, setSpinIdx] = createSignal(0)
  let spinTimer: ReturnType<typeof setInterval> | undefined
  const spinOn = () => { if (!spinTimer) spinTimer = setInterval(() => setSpinIdx((i) => (i + 1) % 14), 200) }
  const spinOff = () => { if (spinTimer) { clearInterval(spinTimer); spinTimer = undefined; setSpinIdx(0) } }
  const [stopping, setStopping] = createSignal(false)

  const workflow = createWorkflowGuard()
  const activeWork = createActiveWorkTracker()
  let activeChild: ChildProcess | undefined
  let sourceInput: TextareaRenderable | undefined
  const sourceInputs = new Map<number, TextareaRenderable>()
  const pathSnapshot = new Map<number, string>()
  let gateResolve: (() => void) | undefined
  let abortProcessing = false

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedExtensions = createMemo(() =>
    importOptions()
      .filter((item) => item.selected)
      .map((item) => item.ext),
  )

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

  function formatBytes(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
    return `${bytes} B`
  }

  const totalSteps = 7
  const stepIndex = createMemo(() => {
    if (step() === "path") return 1
    if (step() === "tools") return 2
    if (step() === "scan") return 3
    if (step() === "direct") return 4
    if (step() === "markitdown") return 5
    if (step() === "ocr") return 6
    if (step() === "done") return 7
    return 7
  })

  const hasValidPaths = createMemo(() => {
    const entries = sourcePaths()
    return entries.some((e) => pathValidities[e.id] === "valid")
  })

  // ── Log helpers ───────────────────────────────────────────────────────────
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

  // ── Path input management ─────────────────────────────────────────────────
  const readPathText = (id: number) => {
    const input = sourceInputs.get(id)
    const live = input && !input.isDestroyed ? input.plainText?.trim() : undefined
    if (live) return live
    return pathSnapshot.get(id)?.trim() ?? ""
  }

  const snapshotSourcePaths = () => {
    for (const entry of sourcePaths()) {
      const input = sourceInputs.get(entry.id)
      const text = input && !input.isDestroyed ? input.plainText : pathSnapshot.get(entry.id) ?? ""
      pathSnapshot.set(entry.id, text)
    }
  }

  const blurSourceInputs = () => {
    for (const input of sourceInputs.values()) blurIfFocused(input)
    blurIfFocused(sourceInput)
  }

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

  // ── Navigation & lifecycle ────────────────────────────────────────────────
  const killActiveChild = () => {
    if (activeChild && !activeChild.killed) activeChild.kill("SIGTERM")
    activeChild = undefined
  }

  const stopActiveWork = () => {
    setStopping(true)
    if (gateResolve) { gateResolve(); gateResolve = undefined }
    abortProcessing = true
    workflow.bump()
    killActiveChild()
    setBusy(false)
    setWaitingForGate(false)
  }

  const goToWorkspace = () => navigate({ type: "global" })
  const navigateBackFrom = (from: WizardStep) => {
    if (from === "path") { goToWorkspace(); return }
    if (from === "done") { spinosa.refresh(); goToWorkspace(); return }
    if (from === "tools") { logAction("back", "tools to path"); setStep("path"); return }
    if (from === "scan") { logAction("back", "scan to tools"); setStep("tools"); return }
    if (from === "direct" || from === "markitdown" || from === "ocr") { logAction("back", `${from} to scan`); setStep("scan"); return }
    if (from === "error") {
      setStep(importOptions().length > 0 ? "scan" : "path")
    }
  }

  let backNavigationPending = false
  const requestBack = (confirmIfActive = true) => {
    if (backNavigationPending) return
    const from = step()
    backNavigationPending = true
    void runGuardedBackNavigation({
      shouldConfirm: confirmIfActive && shouldConfirmSpinosaBack({
        step: from,
        busy: busy(),
        waitingForGate: waitingForGate(),
        cancellableSteps: CANCELABLE_STEPS,
      }),
      confirm: () => confirmSpinosaBack(dialog, from),
      stop: stopActiveWork,
      waitForStop: () => activeWork.wait(),
      navigate: () => navigateBackFrom(from),
    }).finally(() => { backNavigationPending = false; setStopping(false) })
  }

  const handleBackPress = () => requestBack(true)
  const leavePathStep = handleBackPress

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
    requestBack(false)
  }

  // ── Gate helper ───────────────────────────────────────────────────────────
  const gate = (label = "Continue") => new Promise<void>((resolve) => {
    gateResolve = resolve
    logGate(label)
    setGateLabel(label)
    setGateAction(() => () => { logAction("gate-click", label); setWaitingForGate(false); gateResolve = undefined; resolve() })
    setWaitingForGate(true)
  })

  // ── Tools check ───────────────────────────────────────────────────────────
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
  const handleToolAction = () => {
    if (busy()) return
    try { blurSourceInputs() } catch (error) { logError("blurSourceInputs", error) }
    const checks = toolChecks()
    const needsRepair = checks.some((t) => t.status === "missing")
    if (needsRepair) {
      logAction("repair-tools", `${checks.filter(t => t.status === "missing").length} tools missing`)
      void runToolRepair()
    } else if (checks.every((t) => t.status === "available")) {
      logAction("start-scan", "All tools ready")
      startScan().catch((err) => {
        logError("startScan-top", err)
        appendLogLine(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
        setStep("error")
      })
    } else {
      logError("handleToolAction", `Unexpected tool states: ${checks.map((check) => check.status).join(",")}`)
    }
  }

  const runToolRepair = async () => {
    logAction("repair", "Tools missing — repairing")
    setToolChecks((prev) => prev.map((t) => t.status === "missing" ? { ...t, status: "checking" as const } : t))
    spinOn()
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
    await delay(200)
    const toolStatus = await detectDocumentTools()
    const results: ToolCheckResult[] = [
      { label: "PPU PaddleOCR", status: toolStatus.ocr ? "available" : "missing", detail: "scanned PDFs and images" },
      { label: "MarkItDown", status: toolStatus.markitdown ? "available" : "missing", detail: "Office docs, EPUB, HTML, text PDFs" },
      { label: "PDF.js", status: toolStatus.pdfjs ? "available" : "missing", detail: "PDF text extraction and page rendering" },
    ]
    setToolChecks(results)
    for (const r of results) logTool(r.label, r.status, r.detail)
    appendLogLine("Tool repair complete.")
    spinOff()
  }
  // ── Scan ──────────────────────────────────────────────────────────────────
  let pendingPaths: string[] | undefined
  const startScan = async () => {
    const resolved = pendingPaths
    if (!resolved || resolved.length === 0) { logError("startScan", "No pending paths"); setStep("error"); return }
    setSourceIsCloud(resolved.some((p) => isCloudStoragePath(p)))
    const shouldAbort = () => abortProcessing
    setScanDone(false)
    setScanningFile("")
    setScanCount(0)
    setStep("scan")
    await delay(100)
    spinOn()
    clearLog()
    try {
      let mergedOptions: ImportOption[] = []
      for (const src of resolved) {
        appendLogLine(`Scanning: ${src}`)
        const scanPreview = await buildImportScanPreview(src, {
          onFile: (rel, isFile, discovered) => { setScanningFile(rel); setScanTotal((t) => t + discovered); if (isFile) setScanCount((c) => c + 1) },
          shouldAbort,
        })
        for (const opt of scanPreview.importOptions) {
          const existing = mergedOptions.find((m) => m.ext === opt.ext)
          if (existing) existing.count += opt.count
          else mergedOptions.push({ ...opt })
        }
      }
      setImportOptions(mergedOptions)
      clearLog()
      spinOff()
      setScanDone(true)
      logAction("scan-done", `${mergedOptions.length} file types found`)
    } catch (err) {
      logError("startScan", err)
      appendLogLine(`Scan failed: ${err instanceof Error ? err.message : String(err)}`)
      setStep("error")
    }
  }

  // ── Processing ────────────────────────────────────────────────────────────
  const startProcessing = async () => {
    if (busy()) return
    const resolved = pendingPaths
    if (!resolved || resolved.length === 0) {
      appendLogLine("At least one valid source path is required.")
      setStep("error")
      return
    }

    const workspacePath = spinosa.activePath
    if (!workspacePath) {
      appendLogLine("No active workspace selected.")
      setStep("error")
      return
    }

    setBusy(true)
    clearLog()
    setFailedCount(0)
    setProcessingDone(false)
    setProgCurrent(0)
    setProgTotal(1)
    setProcessingStatus("Starting...")
    setProcessingFile("")
    abortProcessing = false
    const generation = workflow.bump()
    const shouldAbort = () => abortProcessing || !workflow.active(generation)
    gateResolve = undefined
    spinOn()
    await delay(200)

    const rawDir = path.join(workspacePath, "raw")
    mkdirSync(rawDir, { recursive: true })

    const batchManager = new ImportBatchManager()
    batchManager.parseExtensionsFromFlag(selectedExtensions().join(","))

    let totalFailed = 0
    let totalRenamed = 0
    let totalDirect = 0
    let totalMd = 0
    let totalOcr = 0
    let dirConverted = 0
    let mdConverted = 0
    let ocrConverted = 0

    try {
      for (const src of resolved) {
        if (shouldAbort()) break
        appendLogLine(`Processing: ${src}`)

        const classified = await scanAndClassifySource(src, rawDir, batchManager, undefined, shouldAbort)
        if (!classified) {
          appendLogLine(`No importable files in: ${src}`)
          continue
        }

        // ── Phase A: Direct copy ────────────────────────────────────────────
        setStep("direct")
        const sharedProg = new ProgressEmitter()
        sharedProg.on((e) => {
          if (e.total > 0) setProgTotal(e.total)
          if (e.current >= 0) setProgCurrent(e.current)
          if (e.relPath) setProcessingFile(e.relPath)
        })

        const onPhaseLog = (msg: string) => {
          if (msg.startsWith("  ")) {
            setProcessingStatus(msg.trim())
            return
          }
          appendLogLine(msg)
        }

        const directCount = classified.directFiles.length
        setProgTotal(directCount > 0 ? directCount : 1)
        setProgCurrent(0)
        setProcessingStatus(`Direct copy — ${directCount} files`)
        totalDirect += directCount
        await delay(500)
        const dr = await processDirectCopy(classified.directFiles, sharedProg, onPhaseLog, undefined, shouldAbort, undefined, (original, renamed) => { totalRenamed++; appendLogLine(`  renamed (name too long): ${original} → ${renamed}`) })
        if (dr.failed > 0) totalFailed += dr.failed
        if (dr.renamed > 0) totalRenamed += dr.renamed
        if (shouldAbort()) { spinOff(); setBusy(false); return }
        dirConverted += dr.converted

        // ── Phase B: MarkItDown ─────────────────────────────────────────────
        const mdCount = classified.markitdownFiles.length
        if (mdCount > 0) {
          setStep("markitdown")
          setBusy(false)
          await gate("Process text files")
          setBusy(true)
          if (shouldAbort()) { spinOff(); setBusy(false); return }

          setProgTotal(mdCount || 1)
          setProgCurrent(0)
          setProcessingStatus("MarkItDown conversion...")
          totalMd += mdCount
          await delay(500)
          const mr = await processMarkitdown(classified.markitdownFiles, classified.logsDir, sharedProg, onPhaseLog, shouldAbort)
          if (mr.failed > 0) totalFailed += mr.failed
          if (mr.renamed > 0) totalRenamed += mr.renamed
          if (shouldAbort()) { spinOff(); setBusy(false); return }
          mdConverted += mr.converted
        } else {
          appendLogLine("No files require MarkItDown conversion.")
        }

        // ── Phase C: OCR ────────────────────────────────────────────────────
        const ocrCount = classified.ocrFiles.length
        if (ocrCount > 0) {
          setStep("ocr")
          setBusy(false)
          await gate("Process images and PDFs")
          setBusy(true)
          if (shouldAbort()) { spinOff(); setBusy(false); return }

          setProgTotal(ocrCount || 1)
          setProgCurrent(0)
          setProcessingStatus("OCR...")
          totalOcr += ocrCount
          await delay(500)
          const or = await processOcr(classified.ocrFiles, classified.logsDir, sharedProg, onPhaseLog, shouldAbort)
          if (or.failed > 0) totalFailed += or.failed
          if (or.renamed > 0) totalRenamed += or.renamed
          if (shouldAbort()) { spinOff(); setBusy(false); return }
          ocrConverted += or.converted
        } else {
          appendLogLine("No files require OCR.")
        }
      }

      setFailedCount(totalFailed)
      setImportSummary(
        `${dirConverted}/${totalDirect} copied · ${mdConverted}/${totalMd} markitdown · ${ocrConverted}/${totalOcr} ocr` +
        (totalRenamed > 0 ? ` · ${totalRenamed} renamed` : "") +
        (totalFailed > 0 ? ` · ${totalFailed} failed` : ""),
      )
      setProcessingDone(true)
      setStep("done")
    } catch (err) {
      if (isSpinosaCancellationError(err) || shouldAbort()) {
        appendLogLine("Spinosa import cancelled.")
        setProcessingStatus("Cancelled.")
        return
      }
      logError("startProcessing", err)
      appendLogLine(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setStep("error")
    } finally {
      spinOff()
      setBusy(false)
    }
  }

  // ── Finish ────────────────────────────────────────────────────────────────
  const finish = () => {
    spinosa.refresh()
    goToWorkspace()
  }

  // ── Toggle helpers ────────────────────────────────────────────────────────
  const toggleImport = (index: number) =>
    setImportOptions((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, selected: !item.selected } : item)),
    )

  const toggleAllImports = () => {
    const shouldEnableAll = importOptions().some((item) => !item.selected)
    setImportOptions((items) => items.map((item) => ({ ...item, selected: shouldEnableAll })))
  }

  // ── Path step navigation ──────────────────────────────────────────────────
  const continueFromPath = async () => {
    if (busy()) return
    blurSourceInputs()
    logAction("continue", "Path step → Tools step")
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
    await runToolCheck()
  }

  const continueFromScan = () => {
    if (selectedExtensions().length === 0) {
      appendLogLine("Select at least one file type to continue.")
      logError("continueFromScan", "No file types selected")
      setStep("error")
      return
    }
    logAction("continue", `Scan → Processing (${selectedExtensions().length} types: ${selectedExtensions().join(",")})`)
    void activeWork.run(startProcessing)
  }

  // ── Mount (keymap + timers) ──────────────────────────────────────────────
  onMount(() => {
    const onUnhandled = (ev: PromiseRejectionEvent) => {
      logError("unhandledrejection", ev.reason)
    }
    window.addEventListener?.("unhandledrejection", onUnhandled)
    setToastError((err) => toast.error(err))
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

    const off = keymap.intercept("key", ({ event, consume }) => {
      if (modeStack.current() !== SPINOSA_BASE_MODE) return
      setHoveredButton(null)

      if (event.ctrl && event.name === "c") {
        handleInterrupt()
        consume(); return
      }
      if (event.name === "escape") {
        handleBackPress()
        consume(); return
      }

      if (busy()) return

      if (waitingForGate() && (step() === "direct" || step() === "markitdown" || step() === "ocr") && event.name === "return") {
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
          if (selectedImport() === 0) toggleAllImports()
          else toggleImport(selectedImport() - 1)
          consume(); return
        }
        if (event.name === "a") {
          toggleAllImports()
          consume(); return
        }
        if (event.name === "return") {
          continueFromScan()
          consume(); return
        }
      }

      if (step() === "tools" && event.name === "return") {
        handleToolAction()
        consume(); return
      }

      if (step() === "done" && event.name === "return") {
        finish()
        consume(); return
      }

      if (step() === "error" && event.name === "return") {
        handleBackPress()
        consume(); return
      }
    })

    onCleanup(() => {
      clearInterval(autoAddTimer)
      clearInterval(validateTimer)
      clearInterval(spinTimer)
      stopActiveWork()
      off()
    })
  })

  // ── Step-transition effects ───────────────────────────────────────────────
  createEffect(
    on(
      step,
      (current, previous) => {
        if (current === "path" && current !== previous) focusSourceInput()
        if (current !== "path") {
          sourceInputs.clear()
          sourceInput = undefined
        }
      },
      { defer: true },
    ),
  )
  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Show when={!stopping()} fallback={
      <box width="100%" height="100%" alignItems="center" justifyContent="center">
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg={theme.textMuted}>{waveString(spinIdx())}</text>
          <text fg={theme.textMuted}>Stopping process, exit cleanly, wait</text>
        </box>
      </box>
    }>
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
              <span style={{ bold: true }}>{busy() ? `${waveString(spinIdx())} ` : ""}Import files into workspace</span>
            </text>
          </box>
          <text fg={theme.textMuted}>
            Step {stepIndex()} of {totalSteps}
            {step() === "path" ? " — choosing source folders" : ""}
            {step() === "tools" ? " — checking your document tools" : ""}
            {step() === "scan" ? " — scanning your source" : ""}
            {step() === "direct" ? " — copying files into raw/" : step() === "markitdown" ? " — converting documents with MarkItDown" : step() === "ocr" ? " — running OCR on images and PDFs" : ""}
            {step() === "done" ? " — import complete" : ""}
            {step() === "error" ? " — fixing the issue and retrying" : ""}
          </text>
          <Show when={sourceIsCloud() && (step() === "scan" || step() === "direct" || step() === "markitdown" || step() === "ocr")}>
            <text fg={theme.error}>  ⚠ cloud folder — scans & copies can be slow due to sync latency</text>
          </Show>

          <Show when={step() === "path"}>
            <WizardPanel theme={theme} accent>
              <text fg={theme.textMuted}>Source folders</text>
              <text fg={theme.textMuted}>
                Add one or more source folders. Spinosa scans them, then imports the file types you choose into this workspace.
              </text>
              <text fg={theme.textMuted}>Click a path to edit · ↑↓ move between paths</text>
              <box flexDirection="column" gap={1} paddingTop={1}>
                <For each={sourcePaths()}>
                  {(entry, index) => (
                    <box
                      flexDirection="row"
                      gap={0}
                      alignItems="center"
                      backgroundColor={focusedSource() === index() ? theme.backgroundElement : undefined}
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
                          placeholder={`Folder path ${index() + 1}`}
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

          <Show when={step() === "tools" || step() === "scan" || step() === "direct" || step() === "markitdown" || step() === "ocr"}>
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
              <Show when={step() === "direct" || step() === "markitdown" || step() === "ocr"}>
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
              </Show>
            </WizardPanel>
            <WizardActionRow>
              <WizardActionButton theme={theme} label="Back" onPress={handleBackPress} />
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
                  onPress={() => void continueFromScan()}
                />
              </Show>
              <Show when={step() === "direct" || step() === "markitdown" || step() === "ocr"}>
                <Show when={waitingForGate()}>
                  <WizardGateButton theme={theme} label={gateLabel()} action={() => gateAction()()} />
                </Show>
              </Show>
            </WizardActionRow>
          </Show>

          <Show when={step() === "done" || step() === "error"}>
            <WizardPanel theme={theme}>
              <Show when={step() === "done"}>
                <box gap={1}>
                  <LogoSummary theme={theme} label="Files imported." />
                  <text fg={theme.textMuted}>Import finished. Review the summary below.</text>
                  <Show when={importSummary() !== ""}>
                    <box paddingTop={1} flexDirection="column" gap={0}>
                      <text fg={theme.textMuted}>{importSummary()}</text>
                    </box>
                  </Show>
                  <Show when={failedCount() > 0}>
                    <box paddingTop={1} flexDirection="column" gap={0}>
                      <text fg={theme.textMuted}>{failedCount()} file{failedCount() === 1 ? "" : "s"} failed — saved to raw/_failed_files/ for review</text>
                    </box>
                  </Show>
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
                  label="Back to workspace"
                  primary
                  onPress={finish}
                />
              </Show>
              <Show when={step() === "error"}>
                <WizardActionButton theme={theme} label="Back" onPress={handleBackPress} />
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
    </Show>
  )
}
