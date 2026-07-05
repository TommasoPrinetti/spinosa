import { existsSync } from "node:fs"
import { TextareaRenderable } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useRoute, useRouteData } from "../../context/route"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { useTuiPaths } from "../../context/runtime"
import { SplitBorder } from "../../ui/border"
import { Toast } from "../../ui/toast"
import { runAdd, runNew, runReinstall, runStartup } from "../../spinosa/cli-bridge"
import { readStartupPrompt, writePreferredCli } from "../../spinosa/service"
import { CenteredColumn } from "../../component/centered-column"
import { OPENCODE_BASE_MODE, useOpencodeKeymap, useOpencodeModeStack } from "../../keymap"
import {
  buildImportScanPreview,
  buildNewWorkspacePreview,
  detectDocumentTools,
  detectLlmTools,
  resolveUserPath,
  suggestWorkspacePath,
  type ImportScanPreview,
  type NewWorkspacePreview,
} from "../../spinosa/onboarding-preview"

type WizardStep = "path" | "tools" | "scan" | "imports" | "processing" | "provider" | "done" | "error"

type ToolCheckResult = {
  label: string
  status: "checking" | "available" | "missing"
  detail?: string
}

type ImportOption = {
  ext: string
  count: number
  selected: boolean
}

type CliOption = {
  value: string
  label: string
  description: string
}

type SourcePathEntry = {
  id: number
  path: string
}

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
}

export function Onboarding() {
  const { theme } = useTheme()
  const route = useRouteData("onboarding")
  const { navigate } = useRoute()
  const spinosa = useSpinosaWorkspace()
  const paths = useTuiPaths()
  const keymap = useOpencodeKeymap()
  const modeStack = useOpencodeModeStack()

  const [step, setStep] = createSignal<WizardStep>("path")
  const [sourcePaths, setSourcePaths] = createSignal<SourcePathEntry[]>([{ id: 0, path: "" }])
  const [logLines, setLogLines] = createSignal<string[]>([])
  const [createdWorkspace, setCreatedWorkspace] = createSignal<string | undefined>()
  const [busy, setBusy] = createSignal(false)
  const [importOptions, setImportOptions] = createSignal<ImportOption[]>([])
  const [selectedImport, setSelectedImport] = createSignal(0)
  const [selectedCli, setSelectedCli] = createSignal(0)
  const [focusedSource, setFocusedSource] = createSignal(0)
  const [preview, setPreview] = createSignal<NewWorkspacePreview | undefined>()
  const [toolChecks, setToolChecks] = createSignal<ToolCheckResult[]>([])
  const [scanProgress, setScanProgress] = createSignal(0)
  const [scanTotal, setScanTotal] = createSignal(0)
  const [processingDone, setProcessingDone] = createSignal(false)
  const [gateLabel, setGateLabel] = createSignal("")
  const [gateAction, setGateAction] = createSignal<() => void>(() => {})
  const [waitingForGate, setWaitingForGate] = createSignal(false)
  let abortProcessing = false
  let sourceInput: TextareaRenderable | undefined
  const sourceInputs = new Map<number, TextareaRenderable>()

  const isNewMode = createMemo(() => route.mode === "new")
  const selectedExtensions = createMemo(() =>
    importOptions()
      .filter((item) => item.selected)
      .map((item) => item.ext),
  )

  const totalSteps = createMemo(() => (isNewMode() ? 6 : 5))
  const stepIndex = createMemo(() => {
    if (step() === "path") return 1
    if (step() === "tools") return 2
    if (step() === "scan") return 3
    if (step() === "imports") return 4
    if (step() === "processing") return 5
    if (step() === "provider") return 6
    if (step() === "done") return totalSteps()
    return totalSteps()
  })
  const primaryTitle = createMemo(() => (isNewMode() ? "Create Spinosa workspace" : "Add files to workspace"))

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

  const addSourcePath = () => {
    setSourcePaths((prev) => [...prev, { id: nextSourceId++, path: "" }])
    queueMicrotask(() => focusSourceInput())
  }

  const removeSourcePath = (id: number) => {
    setSourcePaths((prev) => (prev.length > 1 ? prev.filter((e) => e.id !== id) : prev))
  }

  const setSourcePathAt = (id: number, value: string) => {
    setSourcePaths((prev) => prev.map((e) => (e.id === id ? { ...e, path: value } : e)))
  }

  const allPathsResolved: () => string[] = () => {
    return sourcePaths()
      .map((e) => e.path.trim())
      .filter(Boolean)
      .map((p) => resolveUserPath(p))
      .filter((p): p is string => Boolean(p))
  }

  const goHome = () => navigate({ type: "workspace", pane: "chat" })
  const leavePathStep = () => {
    if (isNewMode()) {
      navigate({ type: "workspace-picker" })
      return
    }
    goHome()
  }

  const moveBack = () => {
    setWaitingForGate(false)
    if (step() === "tools") { setStep("path"); return }
    if (step() === "scan") { setStep("path"); return }
    if (step() === "imports") { setStep("scan"); return }
    if (step() === "processing") { setStep("imports"); return }
    if (step() === "provider") {
      setGateLabel("Choose provider")
      setGateAction(() => () => {
        setWaitingForGate(false)
        setStep("provider")
      })
      setWaitingForGate(true)
      setStep("processing")
      return
    }
    if (step() === "error") {
      setStep(importOptions().length > 0 ? "imports" : "path")
    }
  }

  const renderToolSummaryLine = (check: ToolCheckResult): string => {
    const icon = check.status === "available" ? "✓" : check.status === "missing" ? "✗" : "▁"
    const detail = check.detail ? ` | ${check.detail}` : ""
    return `${icon} ${check.label} — ${check.status}${detail}`
  }

  const generateToolCheckLines = (): ToolCheckResult[] => [
    { label: "RapidOCR", status: "checking", detail: "scanned PDFs and images" },
    { label: "MarkItDown", status: "checking", detail: "Office docs, EPUB, HTML, text PDFs" },
    { label: "pypdfium2", status: "checking", detail: "scanned PDF rendering" },
    { label: "pypdf", status: "checking", detail: "text PDF splitting" },
  ]

  const runToolCheck = async () => {
    clearLog()
    const checks = generateToolCheckLines()
    setToolChecks(checks)
    setStep("tools")

    appendLogLine("Checking document processing tools...")

    for (let i = 0; i < checks.length; i++) {
      await delay(80)
      appendLogLine(renderToolSummaryLine({ ...checks[i]!, status: "checking" }))
    }

    await delay(200)
    const toolStatus = await detectDocumentTools()
    const llmTools = detectLlmTools()

    const results: ToolCheckResult[] = [
      { label: "RapidOCR", status: toolStatus.rapidocr ? "available" : "missing", detail: "scanned PDFs and images" },
      { label: "MarkItDown", status: toolStatus.markitdown ? "available" : "missing", detail: "Office docs, EPUB, HTML, text PDFs" },
      { label: "pypdfium2", status: toolStatus.pypdfium2 ? "available" : "missing", detail: "scanned PDF rendering" },
      { label: "pypdf", status: toolStatus.pypdf ? "available" : "missing", detail: "text PDF splitting" },
    ]
    setToolChecks(results)

    setLogLines([])
    for (const result of results) {
      await delay(60)
      appendLogLine(renderToolSummaryLine(result))
    }

    if (llmTools.length > 0) {
      await delay(40)
      appendLogLine(`Tools detected: ${llmTools.join(", ")}`)
    }

    const needsRepair = results.some((r) => r.status === "missing")
    if (needsRepair) {
      await delay(100)
      appendLogLine("")
      appendLogLine("Some tools missing — repairing...")
      await runReinstall({
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
      appendLogLine("")
      appendLogLine("Tool repair complete.")
    }

    await delay(300)
    setGateLabel("Start scanning")
    setGateAction(() => () => {
      setWaitingForGate(false)
      startScan()
    })
    setWaitingForGate(true)
  }

  const generateScanLines = (preview: NewWorkspacePreview | ImportScanPreview): string[] => {
    const lines: string[] = []
    lines.push("Scanning source folder...")
    if ("preflightRows" in preview) {
      lines.push("")
      for (const row of preview.preflightRows) {
        const icon = row.tone === "error" ? "✗" : row.tone === "success" ? "✓" : "─"
        const detail = row.detail ? ` | ${row.detail}` : ""
        lines.push(`${icon} ${row.label} — ${row.status}${detail}`)
      }
    }
    lines.push("")
    for (const row of preview.scanRows) {
      const icon = row.tone === "error" ? "✗" : "─"
      const detail = row.detail ? ` | ${row.detail}` : ""
      lines.push(`${icon} ${row.label} — ${row.status}${detail}`)
    }
    if (preview.importOptions.length > 0) {
      lines.push("")
      lines.push(`Importable file types: ${preview.importOptions.length}`)
      for (const opt of preview.importOptions) {
        lines.push(`  .${opt.ext} — ${opt.count} file${opt.count === 1 ? "" : "s"}${opt.selected ? "" : " (audio/video, not selected by default)"}`)
      }
    }
    return lines
  }

  const startScan = async () => {
    const resolved = allPathsResolved()
    if (resolved.length === 0) { setStep("error"); return }
    clearLog()
    setStep("scan")
    await yieldToEventLoop()

    try {
      let mergedOptions: ImportOption[] = []
      let allLines: string[] = []

      for (const src of resolved) {
        appendLogLine(`Scanning: ${src}`)
        const scanPreview =
          route.mode === "add"
            ? await buildImportScanPreview(src)
            : await (async () => {
                const nextPreview = await buildNewWorkspacePreview(src)
                setPreview(nextPreview)
                return nextPreview
              })()

        for (const opt of scanPreview.importOptions) {
          const existing = mergedOptions.find((m) => m.ext === opt.ext)
          if (existing) {
            existing.count += opt.count
          } else {
            mergedOptions.push({ ...opt })
          }
        }

        const lines = generateScanLines(scanPreview)
        allLines.push(...lines)
      }

      setImportOptions(mergedOptions)
      setScanTotal(allLines.length)
      setScanProgress(0)

      for (let i = 0; i < allLines.length; i++) {
        appendLogLine(allLines[i]!)
        setScanProgress(i + 1)
        await delay(30)
      }

      await delay(400)
      setGateLabel("Continue")
      setGateAction(() => () => {
        setWaitingForGate(false)
        setStep("imports")
      })
      setWaitingForGate(true)
    } catch (err) {
      appendLogLine(`Scan failed: ${err instanceof Error ? err.message : String(err)}`)
      setStep("error")
    }
  }

  const continueFromPath = async () => {
    if (busy()) return
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
    if (route.mode === "add") {
      await startScan()
      return
    }
    await runToolCheck()
  }

  const continueFromImports = () => {
    if (selectedExtensions().length === 0) {
      appendLogLine("Select at least one file type to continue.")
      setStep("error")
      return
    }
    startProcessing()
  }

  const startProcessing = async () => {
    if (busy()) return
    setBusy(true)
    clearLog()
    setStep("processing")
    setProcessingDone(false)
    abortProcessing = false
    await yieldToEventLoop()

    const resolved = allPathsResolved()
    if (resolved.length === 0) {
      appendLogLine("At least one valid source path is required.")
      setBusy(false)
      setStep("error")
      return
    }

    const extensions = selectedExtensions().join(",")

    if (route.mode === "add") {
      const workspacePath = spinosa.activePath
      if (!workspacePath) {
        appendLogLine("No active workspace selected for add mode.")
        setBusy(false)
        setStep("error")
        return
      }
      let allOk = true
      for (let i = 0; i < resolved.length; i++) {
        if (abortProcessing) { allOk = false; break }
        appendLogLine(`[${i + 1}/${resolved.length}] Importing: ${resolved[i]}`)
        const result = await runAdd(workspacePath, resolved[i], {
          dir: true,
          extensions,
          cli: "opencode",
          onStdout: (chunk) => {
            const clean = stripAnsi(chunk)
            if (clean) appendLogLine(clean)
          },
          onStderr: (chunk) => {
            const clean = stripAnsi(chunk)
            if (clean) appendLogLine(clean)
          },
        })
        if (result.exitCode !== 0) { allOk = false; setStep("error"); break }
      }
      if (allOk) {
        setCreatedWorkspace(workspacePath)
        setProcessingDone(true)
      }
      setBusy(false)
      return
    }

    const primarySource = resolved[0]!
    const plannedWorkspace = preview()?.workspacePath ?? suggestWorkspacePath(primarySource)
    if (plannedWorkspace) setCreatedWorkspace(plannedWorkspace)

    appendLogLine("Starting workspace creation and import...")
    appendLogLine("")

    let sawStartupPrompt = false
    const result = await runNew(primarySource, {
      extensions,
      cli: "opencode",
      launch: "copy",
      onStdout: (chunk) => {
        const raw = stripAnsi(chunk)
        if (!raw) return
        if (sawStartupPrompt) return
        if (raw.includes("[3/3] Startup prompt")) { sawStartupPrompt = true; return }
        appendLogLine(raw)
      },
      onStderr: (chunk) => {
        const raw = stripAnsi(chunk)
        if (raw) appendLogLine(raw)
      },
    })

    const workspacePath = plannedWorkspace
    if (result.exitCode === 0 && workspacePath) {
      setProcessingDone(true)
      if (isNewMode()) {
        setGateLabel("Choose provider")
        setGateAction(() => () => { setWaitingForGate(false); setStep("provider") })
        setWaitingForGate(true)
      }
    } else if (result.exitCode === 0) {
      setProcessingDone(true)
      if (isNewMode()) {
        setGateLabel("Choose provider")
        setGateAction(() => () => { setWaitingForGate(false); setStep("provider") })
        setWaitingForGate(true)
      }
      appendLogLine("Workspace created. You may need to open it from the workspace picker.")
    } else {
      setStep("error")
    }
    setBusy(false)
  }

  const finishProvider = async (cliValue: string) => {
    const workspacePath = createdWorkspace()
    if (workspacePath && isNewMode()) {
      await writePreferredCli(workspacePath, cliValue)
    }
    setSelectedCli(CLI_OPTIONS.findIndex((o) => o.value === cliValue))

    if (cliValue === "spinosa") {
      if (workspacePath) {
        const prompt = await readStartupPrompt(workspacePath)
        await spinosa.openWorkspace(workspacePath)
        navigate({
          type: "workspace",
          pane: "chat",
          prompt: {
            input: prompt ?? "Run Spinosa startup indexing for this workspace. Follow startup-prompt.md: survey corpus, batch mapper extraction, write maps, validate, and set setup_status to workspace_started.",
            parts: [],
          },
        })
      }
    } else {
      if (workspacePath) {
        await runStartup(workspacePath, { cli: cliValue, launch: launchForCli(cliValue) })
      }
      goHome()
    }
  }

  const finish = async () => {
    if (route.mode === "add") {
      spinosa.refresh()
      goHome()
      return
    }
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
    const off = keymap.intercept("key", ({ event }) => {
      if (modeStack.current() !== OPENCODE_BASE_MODE) return
      if (busy()) return

      if (event.name === "escape") {
        if (step() === "path") {
          leavePathStep()
        } else {
          moveBack()
        }
        return true
      }

      if (step() === "path") {
        const pathsLen = sourcePaths().length
        if (event.name === "up" || event.name === "k") {
          setFocusedSource((v) => Math.max(0, v - 1))
          return true
        }
        if (event.name === "down" || event.name === "j") {
          setFocusedSource((v) => Math.min(pathsLen + 2, v + 1))
          return true
        }
        if (event.name === "return") {
          const focus = focusedSource()
          if (focus < pathsLen) {
            const entry = sourcePaths()[focus]
            if (entry) {
              const el = sourceInputs.get(entry.id)
              if (el && !el.isDestroyed) el.focus()
            }
          } else if (focus === pathsLen) {
            addSourcePath()
          } else if (focus === pathsLen + 1) {
            leavePathStep()
          } else {
            void continueFromPath()
          }
          return true
        }
      }

      if (step() === "imports") {
        const listLength = importOptions().length + 1
        if (event.name === "up" || event.name === "k") {
          setSelectedImport((value) => Math.max(0, value - 1))
          return true
        }
        if (event.name === "down" || event.name === "j") {
          setSelectedImport((value) => Math.min(listLength - 1, value + 1))
          return true
        }
        if (event.name === "space") {
          if (selectedImport() === 0) {
            toggleAllImports()
          } else {
            toggleImport(selectedImport() - 1)
          }
          return true
        }
        if (event.name === "a") {
          toggleAllImports()
          return true
        }
        if (event.name === "return") {
          continueFromImports()
          return true
        }
      }

      if (step() === "provider") {
        if (event.name === "up" || event.name === "k") {
          setSelectedCli((value) => Math.max(0, value - 1))
          return true
        }
        if (event.name === "down" || event.name === "j") {
          setSelectedCli((value) => Math.min(CLI_OPTIONS.length - 1, value + 1))
          return true
        }
        if (event.name === "return") {
          void finishProvider(CLI_OPTIONS[selectedCli()]!.value)
          return true
        }
      }

      if (step() === "done" && event.name === "return") {
        void finish()
        return true
      }

      if (step() === "error" && event.name === "return") {
        moveBack()
        return true
      }
    })
    onCleanup(off)
  })

  createEffect(() => {
    if (step() === "path") focusSourceInput()
  })

  return (
    <CenteredColumn>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box width="100%" maxWidth={72} flexDirection="column" gap={1}>
          <box flexDirection="row" alignItems="center" gap={1}>
            <box
              paddingLeft={1}
              paddingRight={1}
              paddingTop={0}
              paddingBottom={0}
              backgroundColor={theme.backgroundPanel}
              onMouseUp={() => {
                if (step() === "path") {
                  leavePathStep()
                } else {
                  moveBack()
                }
              }}
            >
              <text fg={theme.text}>←</text>
            </box>
            <text fg={theme.text}>
              <span style={{ bold: true }}>{primaryTitle()}</span>
            </text>
          </box>
          <text fg={theme.textMuted}>
            Step {stepIndex()} of {totalSteps()}
            {step() === "path" ? " — choose the source folder" : ""}
            {step() === "tools" ? " — checking document tools" : ""}
            {step() === "scan" ? " — scanning source" : ""}
            {step() === "imports" ? " — choose file types to import" : ""}
            {step() === "processing" ? " — importing files" : ""}
            {step() === "provider" ? " — choose LLM provider" : ""}
            {step() === "done" ? " — workspace ready" : ""}
            {step() === "error" ? " — fix the issue and retry" : ""}
          </text>

          <Show when={step() === "path"}>
            <Panel theme={theme} accent>
              <text fg={theme.textMuted}>{isNewMode() ? "Corpus folder" : "Source folders"}</text>
              <text fg={theme.textMuted}>
                {isNewMode()
                  ? "Paste the folder path. Spinosa will inspect the corpus, let you choose file types, then create a sibling `-spinosa` workspace."
                  : "Add one or more folder paths below. Each is queued for import into the current workspace."}
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
                      <textarea
                        ref={(value: TextareaRenderable) => {
                          sourceInputs.set(entry.id, value)
                          if (index() === 0) sourceInput = value
                          value.traits = { status: "PATH" }
                        }}
                        initialValue={entry.path}
                        placeholder={
                          isNewMode()
                            ? "Paste the corpus folder path"
                            : `Folder path ${index() + 1}`
                        }
                        placeholderColor={theme.textMuted}
                        textColor={theme.text}
                        focusedTextColor={theme.text}
                        cursorColor={theme.primary}
                        minHeight={1}
                        maxHeight={1}
                        flexGrow={1}
                        onContentChange={() => {
                          const el = sourceInputs.get(entry.id)
                          setSourcePathAt(entry.id, el?.plainText ?? "")
                        }}
                        onSubmit={() => {}}
                      />
                      <box
                        paddingLeft={1}
                        paddingRight={1}
                        paddingTop={0}
                        paddingBottom={0}
                        backgroundColor={theme.backgroundPanel}
                        onMouseUp={() => removeSourcePath(entry.id)}
                      >
                        <text fg={theme.textMuted}>✕</text>
                      </box>
                    </box>
                  )}
                </For>
              </box>
              <box
                paddingTop={1}
                paddingBottom={1}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={
                  focusedSource() === sourcePaths().length
                    ? theme.backgroundElement
                    : theme.backgroundPanel
                }
                border={focusedSource() === sourcePaths().length ? ["left"] : []}
                borderColor={theme.borderActive}
                onMouseOver={() => setFocusedSource(sourcePaths().length)}
                onMouseUp={addSourcePath}
              >
                <text fg={theme.primary}>+ Add another path</text>
              </box>
            </Panel>
            <ActionRow>
              <ActionButton
                theme={theme}
                label="Back"
                primary={focusedSource() === sourcePaths().length + 1}
                onMouseUp={leavePathStep}
              />
              <box flexGrow={1} />
              <ActionButton
                theme={theme}
                label="Continue"
                primary={focusedSource() === sourcePaths().length + 2}
                onMouseUp={() => void continueFromPath()}
              />
            </ActionRow>
          </Show>

          <Show when={step() === "tools" || step() === "scan" || step() === "processing"}>
            <Panel theme={theme}>
              <Show when={step() === "tools"}>
                <text fg={theme.textMuted}>Checking document processing tools...</text>
              </Show>
              <Show when={step() === "scan"}>
                <text fg={theme.textMuted}>
                  {scanProgress() > 0 ? `Scanning... (${scanProgress()}/${scanTotal()})` : "Reading source folder..."}
                </text>
              </Show>
              <Show when={step() === "processing" && !processingDone()}>
                <text fg={theme.textMuted}>
                  {isNewMode() ? "Creating workspace and importing files..." : "Importing files..."}
                </text>
              </Show>
              <LogScrollbox theme={theme} lines={logLines()} />
            </Panel>
            <ActionRow>
              <ActionButton theme={theme} label="Back" onMouseUp={moveBack} />
              <box flexGrow={1} />
              <Show when={waitingForGate()}>
                <GateButton theme={theme} label={gateLabel()} action={() => gateAction()()} />
              </Show>
            </ActionRow>
          </Show>

          <Show when={step() === "imports"}>
            <Panel theme={theme}>
              <text fg={theme.textMuted}>Selectable file-type batches</text>
              <text fg={theme.textMuted}>Select at least one file type. Audio and video start off unchecked.</text>
              <box flexDirection="column" gap={1}>
                <box
                  paddingTop={1}
                  paddingBottom={1}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={selectedImport() === 0 ? theme.backgroundElement : theme.backgroundPanel}
                  onMouseOver={() => setSelectedImport(0)}
                  onMouseUp={() => toggleAllImports()}
                >
                  <ToggleLine
                    theme={theme}
                    selected={selectedImport() === 0}
                    enabled={importOptions().every((item) => item.selected)}
                    label="All supported files"
                    count={importOptions().reduce((sum, item) => sum + item.count, 0)}
                  />
                </box>
                <box flexDirection="row" flexWrap="wrap" gap={1}>
                  <For each={importOptions()}>
                    {(item, index) => (
                <box
                  width={22}
                  paddingTop={1}
                  paddingBottom={1}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={selectedImport() === index() + 1 ? theme.backgroundElement : theme.backgroundPanel}
                  onMouseOver={() => setSelectedImport(index() + 1)}
                  onMouseUp={() => toggleImport(index())}
                >
                        <ToggleLine
                          theme={theme}
                          selected={selectedImport() === index() + 1}
                          enabled={item.selected}
                          label={`.${item.ext}`}
                          count={item.count}
                        />
                      </box>
                    )}
                  </For>
                </box>
              </box>
              <text fg={theme.textMuted}>↑↓ move · space toggle · a toggle all · enter continue</text>
            </Panel>
            <ActionRow>
              <ActionButton theme={theme} label="Back" onMouseUp={moveBack} />
              <box flexGrow={1} />
              <ActionButton theme={theme} label="Continue" primary onMouseUp={() => void continueFromImports()} />
            </ActionRow>
          </Show>

          <Show when={step() === "provider"}>
            <Panel theme={theme}>
              <text fg={theme.textMuted}>Preferred LLM CLI</text>
              <text fg={theme.textMuted}>
                Choose which tool to use for running the startup indexing prompt in this workspace.
              </text>
               <scrollbox maxHeight={12}>
                <For each={CLI_OPTIONS}>
                  {(item, index) => (
                    <box
                      paddingTop={1}
                      paddingBottom={1}
                      paddingLeft={1}
                      paddingRight={1}
                      backgroundColor={selectedCli() === index() ? theme.backgroundElement : undefined}
                      onMouseOver={() => setSelectedCli(index())}
                      onMouseUp={() => void finishProvider(item.value)}
                    >
                      <text fg={selectedCli() === index() ? theme.primary : theme.text}>
                        <span style={{ bold: selectedCli() === index() }}>{item.label}</span>
                      </text>
                      <text fg={theme.textMuted}> {item.description}</text>
                    </box>
                  )}
                </For>
              </scrollbox>
              <text fg={theme.textMuted}>↑↓ move · enter select</text>
            </Panel>
          </Show>

          <Show when={step() === "done" || step() === "error"}>
            <Panel theme={theme}>
              <Show when={step() === "done" && !isNewMode()}>
                <box gap={1}>
                  <LogoSummary theme={theme} label="Files imported." />
                  <text fg={theme.textMuted}>Selected file types have been added to the workspace.</text>
                </box>
              </Show>
              <Show when={step() === "done" && isNewMode()}>
                <box gap={1}>
                  <LogoSummary theme={theme} label="Workspace created." />
                  <text fg={theme.textMuted}>
                    Spinosa workspace is ready. Open it to begin working with your corpus.
                  </text>
                </box>
              </Show>
              <Show when={step() === "error"}>
                <text fg={theme.error}>
                  <span style={{ bold: true }}>Spinosa could not complete this step.</span>
                </text>
                <Show when={logLines().length > 0}>
                  <LogScrollbox theme={theme} lines={logLines()} />
                </Show>
              </Show>
            </Panel>
            <ActionRow>
              <Show when={step() === "done"}>
                <ActionButton
                  theme={theme}
                  label={isNewMode() ? "Open workspace" : "Back to homepage"}
                  primary
                  onMouseUp={() => void finish()}
                />
              </Show>
              <Show when={step() === "error"}>
                <ActionButton theme={theme} label="Back" onMouseUp={moveBack} />
                <box flexGrow={1} />
                <ActionButton theme={theme} label="Retry" primary onMouseUp={() => void continueFromPath()} />
              </Show>
            </ActionRow>
          </Show>

          <Show when={step() === "processing" && processingDone()}>
            <ActionRow>
              <Show when={isNewMode() && waitingForGate()}>
                <GateButton theme={theme} label={gateLabel()} action={() => gateAction()()} />
              </Show>
              <Show when={!isNewMode()}>
                <ActionButton theme={theme} label="Done" primary onMouseUp={finish} />
              </Show>
            </ActionRow>
          </Show>

          <Toast />
        </box>
        <box flexGrow={1} minHeight={0} />
      </box>
    </CenteredColumn>
  )
}

function Panel(props: { theme: ReturnType<typeof useTheme>["theme"]; accent?: boolean; children: any }) {
  return (
    <box
      flexDirection="column"
      gap={1}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={props.theme.backgroundPanel}
      border={["left"]}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={props.accent ? props.theme.primary : props.theme.border}
    >
      {props.children}
    </box>
  )
}

function ActionRow(props: { children: any }) {
  return (
    <box flexDirection="row" gap={1} flexWrap="wrap">
      {props.children}
    </box>
  )
}

function ActionButton(props: {
  theme: ReturnType<typeof useTheme>["theme"]
  label: string
  primary?: boolean
  onMouseUp: () => void
}) {
  return (
    <box
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={props.primary ? props.theme.backgroundElement : props.theme.backgroundPanel}
      border={["left"]}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={props.primary ? props.theme.primary : props.theme.border}
      onMouseUp={props.onMouseUp}
    >
      <text fg={props.primary ? props.theme.primary : props.theme.textMuted}>
        <span style={{ bold: props.primary }}>{props.label}</span>
      </text>
    </box>
  )
}

function GateButton(props: {
  theme: ReturnType<typeof useTheme>["theme"]
  label: string
  action: () => void
}) {
  const [remaining, setRemaining] = createSignal(30)
  let timer: ReturnType<typeof setInterval> | undefined

  onMount(() => {
    timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer)
          props.action()
          return 0
        }
        return r - 1
      })
    }, 1000)
  })

  onCleanup(() => {
    if (timer) clearInterval(timer)
  })

  return (
    <ActionButton
      theme={props.theme}
      label={`${props.label} (${remaining()}s)`}
      primary
      onMouseUp={() => {
        if (timer) clearInterval(timer)
        props.action()
      }}
    />
  )
}

function SummaryRow(props: {
  theme: ReturnType<typeof useTheme>["theme"]
  branch: "mid" | "last"
  label: string
  status: string
  detail?: string
  tone?: "normal" | "muted" | "success" | "error"
}) {
  const toneColor =
    props.tone === "success"
      ? props.theme.success
      : props.tone === "error"
        ? props.theme.error
        : props.theme.textMuted

  return (
    <text fg={props.theme.text}>
      <span style={{ fg: props.theme.textMuted }}>{props.branch === "last" ? "└─ " : "├─ "}</span>
      {props.label}
      <span style={{ fg: props.theme.textMuted }}> | </span>
      <span style={{ fg: toneColor }}>{props.status}</span>
      <Show when={props.detail}>
        <span style={{ fg: props.theme.textMuted }}> | {props.detail}</span>
      </Show>
    </text>
  )
}

function ToggleLine(props: {
  theme: ReturnType<typeof useTheme>["theme"]
  selected: boolean
  enabled: boolean
  label: string
  count: number
}) {
  return (
    <text fg={props.selected ? props.theme.text : props.theme.textMuted} wrapMode="none">
      <span style={{ fg: props.enabled ? props.theme.text : props.theme.textMuted }}>{props.enabled ? "●" : "○"}</span>
      <span style={{ fg: props.selected ? props.theme.text : props.theme.textMuted }}> {props.label}</span>
      <span style={{ fg: props.theme.textMuted }}> | </span>
      <span style={{ fg: props.theme.borderActive }}>
        {props.count} file{props.count === 1 ? "" : "s"}
      </span>
    </text>
  )
}

function LogScrollbox(props: {
  theme: ReturnType<typeof useTheme>["theme"]
  lines: string[]
}) {
  return (
    <scrollbox maxHeight={14} stickyScroll={true} stickyStart="bottom">
      <For each={props.lines}>
        {(line) => <text fg={props.theme.textMuted}>{line || " "}</text>}
      </For>
    </scrollbox>
  )
}

function LogoSummary(props: {
  theme: ReturnType<typeof useTheme>["theme"]
  label: string
}) {
  return (
    <text fg={props.theme.text}>
      <span style={{ bold: true }}>{props.label}</span>
    </text>
  )
}

function isNewModeFromRoute(mode: "new" | "add") {
  return mode === "new"
}
