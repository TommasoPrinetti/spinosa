import type { ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { TextareaRenderable } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useRoute } from "../../context/route"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { Toast } from "../../ui/toast"
import { runAdd } from "../../spinosa/cli-bridge"
import { tuiLog } from "../../spinosa/log"
import { CenteredColumn } from "../../component/centered-column"
import { OPENCODE_BASE_MODE, useOpencodeKeymap, useOpencodeModeStack } from "../../keymap"
import { buttonBackground, buttonBorder, buttonText } from "../../util/button"
import { buildImportScanPreview, resolveUserPath } from "../../spinosa/onboarding-preview"
import {
  blurIfFocused,
  createWorkflowGuard,
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

type WizardStep = "path" | "scan" | "imports" | "processing" | "done" | "error"

type SourcePathEntry = {
  id: number
}

let nextSourceId = 1

export function AddFiles() {
  const { theme } = useTheme()
  const { navigate } = useRoute()
  const spinosa = useSpinosaWorkspace()
  const keymap = useOpencodeKeymap()
  const modeStack = useOpencodeModeStack()

  const [step, setStep] = createSignal<WizardStep>("path")
  const [sourcePaths, setSourcePaths] = createSignal<SourcePathEntry[]>([{ id: 0 }])
  const [logLines, setLogLines] = createSignal<string[]>([])
  const [busy, setBusy] = createSignal(false)
  const [importOptions, setImportOptions] = createSignal<ImportOption[]>([])
  const [selectedImport, setSelectedImport] = createSignal(0)
  const [focusedSource, setFocusedSource] = createSignal(0)
  const [hoveredBack, setHoveredBack] = createSignal(false)
  const [scanProgress, setScanProgress] = createSignal(0)
  const [scanTotal, setScanTotal] = createSignal(0)
  const [processingDone, setProcessingDone] = createSignal(false)
  const [gateLabel, setGateLabel] = createSignal("")
  const [gateAction, setGateAction] = createSignal<() => void>(() => {})
  const [waitingForGate, setWaitingForGate] = createSignal(false)
  const workflow = createWorkflowGuard()
  let activeChild: ChildProcess | undefined
  let sourceInput: TextareaRenderable | undefined
  const sourceInputs = new Map<number, TextareaRenderable>()
  const pathSnapshot = new Map<number, string>()

  const selectedExtensions = createMemo(() =>
    importOptions()
      .filter((item) => item.selected)
      .map((item) => item.ext),
  )

  const totalSteps = 5
  const stepIndex = createMemo(() => {
    if (step() === "path") return 1
    if (step() === "scan") return 2
    if (step() === "imports") return 3
    if (step() === "processing") return 4
    if (step() === "done") return 5
    return 5
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

  const addSourcePath = () => {
    const id = nextSourceId++
    const nextIndex = sourcePaths().length
    setSourcePaths((prev) => [...prev, { id }])
    setFocusedSource(nextIndex)
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
    sourcePaths()
      .map((e) => readPathText(e.id))
      .filter(Boolean)
      .map((p) => resolveUserPath(p))
      .filter((p): p is string => Boolean(p))

  const killActiveChild = () => {
    if (activeChild && !activeChild.killed) activeChild.kill("SIGTERM")
    activeChild = undefined
  }

  const stopActiveWork = () => {
    workflow.bump()
    killActiveChild()
    setBusy(false)
    setWaitingForGate(false)
  }

  const goHome = () => navigate({ type: "workspace" })
  const leavePathStep = () => {
    stopActiveWork()
    goHome()
  }

  const moveBack = () => {
    stopActiveWork()
    if (step() === "scan") {
      setStep("path")
      return
    }
    if (step() === "imports") {
      setStep("scan")
      return
    }
    if (step() === "processing") {
      setStep("imports")
      return
    }
    if (step() === "error") {
      setStep(importOptions().length > 0 ? "imports" : "path")
    }
  }

  const startScan = async () => {
    const gen = workflow.bump()
    killActiveChild()
    setBusy(true)
    snapshotSourcePaths()
    const resolved = allPathsResolved()
    if (resolved.length === 0) {
      if (workflow.active(gen)) {
        setBusy(false)
        setStep("error")
      }
      return
    }
    clearLog()
    if (!workflow.active(gen)) return
    setStep("scan")
    await yieldToEventLoop()
    if (!workflow.active(gen)) return

    try {
      let mergedOptions: ImportOption[] = []
      let allLines: string[] = []

      for (const src of resolved) {
        if (!workflow.active(gen)) return
        appendLogLine(`Scanning: ${src}`)
        const scanPreview = await buildImportScanPreview(src)
        if (!workflow.active(gen)) return

        for (const opt of scanPreview.importOptions) {
          const existing = mergedOptions.find((m) => m.ext === opt.ext)
          if (existing) existing.count += opt.count
          else mergedOptions.push({ ...opt })
        }

        allLines.push(...generateScanLines(scanPreview))
      }

      if (!workflow.active(gen)) return
      setImportOptions(mergedOptions)
      setScanTotal(allLines.length)
      setScanProgress(0)

      for (let i = 0; i < allLines.length; i++) {
        if (!workflow.active(gen)) return
        appendLogLine(allLines[i]!)
        setScanProgress(i + 1)
        await delay(30)
      }

      if (!workflow.active(gen)) return
      await delay(400)
      if (!workflow.active(gen)) return
      setGateLabel("Continue")
      setGateAction(() => () => {
        setWaitingForGate(false)
        setStep("imports")
      })
      setWaitingForGate(true)
    } catch (err) {
      if (!workflow.active(gen)) return
      appendLogLine(`Scan failed: ${err instanceof Error ? err.message : String(err)}`)
      setStep("error")
    } finally {
      if (workflow.active(gen)) setBusy(false)
    }
  }

  const continueFromPath = async () => {
    if (busy()) return
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
    await startScan()
  }

  const continueFromImports = () => {
    if (selectedExtensions().length === 0) {
      appendLogLine("Select at least one file type to continue.")
      setStep("error")
      return
    }
    void startProcessing()
  }

  const startProcessing = async () => {
    if (busy()) return
    const gen = workflow.bump()
    killActiveChild()
    setBusy(true)
    clearLog()
    setStep("processing")
    setProcessingDone(false)
    await yieldToEventLoop()
    if (!workflow.active(gen)) return

    const resolved = allPathsResolved()
    if (resolved.length === 0) {
      if (workflow.active(gen)) {
        appendLogLine("At least one valid source path is required.")
        setBusy(false)
        setStep("error")
      }
      return
    }

    const workspacePath = spinosa.activePath
    if (!workspacePath) {
      if (workflow.active(gen)) {
        appendLogLine("No active workspace selected.")
        setBusy(false)
        setStep("error")
      }
      return
    }

    const extensions = selectedExtensions().join(",")
    tuiLog(`startProcessing extensions=${extensions} sources=${JSON.stringify(resolved)}`)
    let allOk = true
    try {
      for (let i = 0; i < resolved.length; i++) {
        if (!workflow.active(gen)) return
        appendLogLine(`[${i + 1}/${resolved.length}] Importing: ${resolved[i]}`)
        tuiLog(`runAdd[${i}] source=${resolved[i]}`)
        const result = await runAdd(workspacePath, resolved[i], {
          dir: true,
          extensions,
          cli: "opencode",
          onSpawn: (child) => {
            activeChild = child
          },
          onStdout: (chunk) => {
            if (!workflow.active(gen)) return
            const clean = stripAnsi(chunk)
            if (clean) appendLogLine(clean)
          },
          onStderr: (chunk) => {
            if (!workflow.active(gen)) return
            const clean = stripAnsi(chunk)
            if (clean) appendLogLine(clean)
          },
        })
        activeChild = undefined
        tuiLog(`runAdd[${i}] done exitCode=${result.exitCode} stdout=${result.stdout.length}B stderr=${result.stderr.length}B`)
        if (!workflow.active(gen)) return
        if (result.exitCode !== 0) {
          allOk = false
          if (result.stderr && logLines().length === 0) appendLogLine(result.stderr)
          else if (!result.stderr && logLines().length === 0) appendLogLine(`Exit code ${result.exitCode}`)
          setStep("error")
          break
        }
      }

      if (allOk && workflow.active(gen)) {
        setProcessingDone(true)
        setStep("done")
      }
    } finally {
      killActiveChild()
      if (workflow.active(gen)) setBusy(false)
    }
  }

  const finish = () => {
    spinosa.refresh()
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

  const handleBackPress = () => {
    if (step() === "path") leavePathStep()
    else moveBack()
  }

  onMount(() => {
    focusSourceInput()
    const off = keymap.intercept("key", ({ event }) => {
      if (modeStack.current() !== OPENCODE_BASE_MODE) return
      setHoveredBack(false)

      if ((event.ctrl && event.name === "c") || event.name === "escape") {
        if (step() === "path") leavePathStep()
        else moveBack()
        return true
      }

      if (busy()) return

      if (waitingForGate() && (step() === "scan" || step() === "processing") && event.name === "return") {
        gateAction()()
        return true
      }

      if (step() === "path") {
        const pathsLen = sourcePaths().length
        const editingIndex = focusedSourceIndex()

        if (editingIndex >= 0) {
          if (event.name === "up" || event.name === "k") {
            cycleFocusedSource(-1)
            return true
          }
          if (event.name === "down" || event.name === "j") {
            cycleFocusedSource(1)
            return true
          }
        }

        if (!sourceInputFocused()) {
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
              if (entry) focusSourceEntry(entry.id)
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
          if (selectedImport() === 0) toggleAllImports()
          else toggleImport(selectedImport() - 1)
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

      if (step() === "done" && event.name === "return") {
        finish()
        return true
      }

      if (step() === "error" && event.name === "return") {
        moveBack()
        return true
      }
    })
    onCleanup(() => {
      stopActiveWork()
      off()
    })
  })

  createEffect(
    on(
      step,
      (current, previous) => {
        if (current === "path" && current !== previous) focusSourceInput()
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
              paddingLeft={1}
              paddingRight={1}
              paddingTop={0}
              paddingBottom={0}
              backgroundColor={buttonBackground(theme, hoveredBack())}
              onMouseOver={() => {
                blurSourceInputs()
                setHoveredBack(true)
              }}
              onMouseOut={() => setHoveredBack(false)}
              onMouseDown={() => deferPress(handleBackPress)}
            >
              <text fg={buttonText(theme, hoveredBack(), theme.text)}>←</text>
            </box>
            <text fg={theme.text}>
              <span style={{ bold: true }}>Add files to workspace</span>
            </text>
          </box>
          <text fg={theme.textMuted}>
            Step {stepIndex()} of {totalSteps}
            {step() === "path" ? " — choose source folders" : ""}
            {step() === "scan" ? " — scanning source" : ""}
            {step() === "imports" ? " — choose file types to import" : ""}
            {step() === "processing" ? " — importing files" : ""}
            {step() === "done" ? " — import complete" : ""}
            {step() === "error" ? " — fix the issue and retry" : ""}
          </text>

          <Show when={step() === "path"}>
            <WizardPanel theme={theme} accent>
              <text fg={theme.textMuted}>Source folders</text>
              <text fg={theme.textMuted}>
                Add one or more folder paths below. Each is queued for import into the current workspace.
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
              <box
                paddingTop={1}
                paddingBottom={1}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={buttonBackground(theme, focusedSource() === sourcePaths().length)}
                border={focusedSource() === sourcePaths().length ? ["left"] : []}
                borderColor={buttonBorder(theme, focusedSource() === sourcePaths().length, theme.borderActive)}
                onMouseOver={() => {
                  blurSourceInputs()
                  setFocusedSource(sourcePaths().length)
                }}
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
                onHover={() => {
                  blurSourceInputs()
                  setFocusedSource(sourcePaths().length + 1)
                }}
                onPress={leavePathStep}
              />
              <box flexGrow={1} />
              <WizardActionButton
                theme={theme}
                label="Continue"
                primary={focusedSource() === sourcePaths().length + 2}
                onHover={() => {
                  blurSourceInputs()
                  setFocusedSource(sourcePaths().length + 2)
                }}
                onPress={() => void continueFromPath()}
              />
            </WizardActionRow>
          </Show>

          <Show when={step() === "scan" || step() === "processing"}>
            <WizardPanel theme={theme}>
              <Show when={step() === "scan"}>
                <text fg={theme.textMuted}>
                  {scanProgress() > 0 ? `Scanning... (${scanProgress()}/${scanTotal()})` : "Reading source folder..."}
                </text>
              </Show>
              <Show when={step() === "processing" && !processingDone()}>
                <text fg={theme.textMuted}>Importing files...</text>
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

          <Show when={step() === "done" || step() === "error"}>
            <WizardPanel theme={theme}>
              <Show when={step() === "done"}>
                <box gap={1}>
                  <LogoSummary theme={theme} label="Files imported." />
                  <text fg={theme.textMuted}>Selected file types have been added to the workspace.</text>
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
                <WizardActionButton theme={theme} label="Back to homepage" primary onPress={finish} />
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