import { existsSync } from "node:fs"
import { TextareaRenderable } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useRoute } from "../../context/route"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { Toast } from "../../ui/toast"
import { runNew, runReinstall, runStartup } from "../../spinosa/cli-bridge"
import { readStartupPrompt, writePreferredCli } from "../../spinosa/service"
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
  deferPress,
  delay,
  generateScanLines,
  type ImportOption,
  LogScrollbox,
  LogoSummary,
  stripAnsi,
  ToggleLine,
  WizardActionButton,
  WizardActionRow,
  WizardGateButton,
  WizardPanel,
  yieldToEventLoop,
} from "./wizard-ui"

type WizardStep = "path" | "tools" | "scan" | "imports" | "processing" | "provider" | "done" | "error"

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

export function Onboarding() {
  const { theme } = useTheme()
  const { navigate } = useRoute()
  const spinosa = useSpinosaWorkspace()
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
  const [hoveredButton, setHoveredButton] = createSignal<string | null>(null)
  const [scanProgress, setScanProgress] = createSignal(0)
  const [scanTotal, setScanTotal] = createSignal(0)
  const [processingDone, setProcessingDone] = createSignal(false)
  const [gateLabel, setGateLabel] = createSignal("")
  const [gateAction, setGateAction] = createSignal<() => void>(() => {})
  const [waitingForGate, setWaitingForGate] = createSignal(false)
  let abortProcessing = false
  let sourceInput: TextareaRenderable | undefined
  const sourceInputs = new Map<number, TextareaRenderable>()

  const selectedExtensions = createMemo(() =>
    importOptions()
      .filter((item) => item.selected)
      .map((item) => item.ext),
  )

  const totalSteps = 6
  const stepIndex = createMemo(() => {
    if (step() === "path") return 1
    if (step() === "tools") return 2
    if (step() === "scan") return 3
    if (step() === "imports") return 4
    if (step() === "processing") return 5
    if (step() === "provider") return 6
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

  const addSourcePath = () => {
    const id = nextSourceId++
    const nextIndex = sourcePaths().length
    setSourcePaths((prev) => [...prev, { id, path: "" }])
    setFocusedSource(nextIndex)
    focusSourceEntry(id)
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

  const goHome = () => navigate({ type: "workspace" })
  const leavePathStep = () => navigate({ type: "workspace-picker" })

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
        const scanPreview = await (async () => {
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
      setGateLabel("Choose provider")
      setGateAction(() => () => { setWaitingForGate(false); setStep("provider") })
      setWaitingForGate(true)
    } else if (result.exitCode === 0) {
      setProcessingDone(true)
      setGateLabel("Choose provider")
      setGateAction(() => () => { setWaitingForGate(false); setStep("provider") })
      setWaitingForGate(true)
      appendLogLine("Workspace created. You may need to open it from the workspace picker.")
    } else {
      setStep("error")
    }
    setBusy(false)
  }

  const finishProvider = async (cliValue: string) => {
    const workspacePath = createdWorkspace()
    if (workspacePath) {
      await writePreferredCli(workspacePath, cliValue)
    }
    setSelectedCli(CLI_OPTIONS.findIndex((o) => o.value === cliValue))

    if (cliValue === "spinosa") {
      if (workspacePath) {
        const prompt = await readStartupPrompt(workspacePath)
        spinosa.queuePrompt({
          input:
            prompt ?? "Run Spinosa startup indexing for this workspace. Follow startup-prompt.md: survey corpus, batch mapper extraction, write maps, validate, and set setup_status to workspace_started.",
          parts: [],
          autoSubmit: true,
        })
        await spinosa.openWorkspace(workspacePath)
        navigate({ type: "workspace" })
      }
    } else {
      if (workspacePath) {
        await runStartup(workspacePath, { cli: cliValue, launch: launchForCli(cliValue) })
      }
      goHome()
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
    const off = keymap.intercept("key", ({ event }) => {
      if (modeStack.current() !== OPENCODE_BASE_MODE) return
      if (busy()) return
      setHoveredButton(null)

      if (event.ctrl && event.name === "c") {
        if (step() === "path") {
          leavePathStep()
        } else {
          moveBack()
        }
        return true
      }

      if (event.name === "escape") {
        if (step() === "path") {
          leavePathStep()
        } else {
          moveBack()
        }
        return true
      }

      if (
        waitingForGate() &&
        (step() === "tools" || step() === "scan" || step() === "processing") &&
        event.name === "return"
      ) {
        gateAction()()
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
              backgroundColor={buttonBackground(theme, hoveredButton() === "back")}
              onMouseOver={() => setHoveredButton("back")}
              onMouseOut={() => setHoveredButton(null)}
              onMouseDown={() =>
                deferPress(() => {
                  if (step() === "path") leavePathStep()
                  else moveBack()
                })
              }
            >
              <text fg={buttonText(theme, hoveredButton() === "back", theme.text)}>←</text>
            </box>
            <text fg={theme.text}>
              <span style={{ bold: true }}>Create Spinosa workspace</span>
            </text>
          </box>
          <text fg={theme.textMuted}>
            Step {stepIndex()} of {totalSteps}
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
            <WizardPanel theme={theme} accent>
              <text fg={theme.textMuted}>Corpus folder</text>
              <text fg={theme.textMuted}>
                Paste the folder path. Spinosa will inspect the corpus, let you choose file types, then create a sibling `-spinosa` workspace.
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
                        placeholder="Paste the corpus folder path"
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
                        onMouseDown={() => deferPress(() => removeSourcePath(entry.id))}
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
                backgroundColor={buttonBackground(theme, focusedSource() === sourcePaths().length)}
                border={focusedSource() === sourcePaths().length ? ["left"] : []}
                borderColor={buttonBorder(theme, focusedSource() === sourcePaths().length, theme.borderActive)}
                onMouseOver={() => setFocusedSource(sourcePaths().length)}
                onMouseDown={() => deferPress(addSourcePath)}
              >
                <text fg={buttonText(theme, focusedSource() === sourcePaths().length, theme.primary)}>
                  + Add another path
                </text>
              </box>
            </WizardPanel>
            <WizardActionRow>
              <WizardActionButton
                theme={theme}
                label="Back"
                primary={focusedSource() === sourcePaths().length + 1}
                onPress={leavePathStep}
              />
              <box flexGrow={1} />
              <WizardActionButton
                theme={theme}
                label="Continue"
                primary={focusedSource() === sourcePaths().length + 2}
                onPress={() => void continueFromPath()}
              />
            </WizardActionRow>
          </Show>

          <Show when={step() === "tools" || step() === "scan" || step() === "processing"}>
            <WizardPanel theme={theme}>
              <Show when={step() === "tools"}>
                <text fg={theme.textMuted}>Checking document processing tools...</text>
              </Show>
              <Show when={step() === "scan"}>
                <text fg={theme.textMuted}>
                  {scanProgress() > 0 ? `Scanning... (${scanProgress()}/${scanTotal()})` : "Reading source folder..."}
                </text>
              </Show>
              <Show when={step() === "processing" && !processingDone()}>
                <text fg={theme.textMuted}>Creating workspace and importing files...</text>
              </Show>
              <LogScrollbox theme={theme} lines={logLines()} />
            </WizardPanel>
            <WizardActionRow>
              <WizardActionButton theme={theme} label="Back" onPress={moveBack} />
              <box flexGrow={1} />
              <Show when={waitingForGate()}>
                <WizardGateButton theme={theme} label={gateLabel()} action={() => gateAction()()} />
              </Show>
            </WizardActionRow>
          </Show>

          <Show when={step() === "imports"}>
            <WizardPanel theme={theme}>
              <text fg={theme.textMuted}>Selectable file-type batches</text>
              <text fg={theme.textMuted}>Select at least one file type. Audio and video start off unchecked.</text>
              <box flexDirection="column" gap={1}>
                <box
                  paddingTop={1}
                  paddingBottom={1}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={buttonBackground(theme, selectedImport() === 0)}
                  onMouseOver={() => setSelectedImport(0)}
                  onMouseDown={() => deferPress(toggleAllImports)}
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
                  backgroundColor={buttonBackground(theme, selectedImport() === index() + 1)}
                  onMouseOver={() => setSelectedImport(index() + 1)}
                  onMouseDown={() => deferPress(() => toggleImport(index()))}
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
            </WizardPanel>
            <WizardActionRow>
              <WizardActionButton theme={theme} label="Back" onPress={moveBack} />
              <box flexGrow={1} />
              <WizardActionButton theme={theme} label="Continue" primary onPress={() => void continueFromImports()} />
            </WizardActionRow>
          </Show>

          <Show when={step() === "provider"}>
            <WizardPanel theme={theme}>
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

          <Show when={step() === "done" || step() === "error"}>
            <WizardPanel theme={theme}>
              <Show when={step() === "done"}>
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

          <Show when={step() === "processing" && processingDone()}>
            <WizardActionRow>
              <Show when={waitingForGate()}>
                <WizardGateButton theme={theme} label={gateLabel()} action={() => gateAction()()} />
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
