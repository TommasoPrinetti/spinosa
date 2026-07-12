import { Prompt, type PromptRef } from "../component/prompt"
import { createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast, useToast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useLegacyHomeRoute } from "../context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { usePluginRuntime } from "../plugin/runtime"
import { useEditorContext } from "../context/editor"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiConfig } from "../config"
import { HomeSessionDestinationProvider } from "./home/session-destination"
import { SpinosaPromptChips } from "./workspace/spinosa-prompt-chips"
import { MAIN_CONTENT_MAX_WIDTH } from "../util/layout"
import { CenteredColumn } from "../component/centered-column"
import { useSpinosaWorkspace } from "../context/spinosa-workspace"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { DialogSpinosaWorkspacePicker } from "../component/dialog-spinosa-workspace-picker"
import { readBundledFrameworkVersion, isPrereleaseFrameworkVersion } from "../spinosa/service"
import { workspaceAsciiBannerText } from "../spinosa/workspace-name"
import { upgradeFramework } from "../spinosa-core/commands/upgrade"
import { type ReleaseChannel } from "../spinosa-core/system/channels"
import { cleanupStaleInstallDirectories, inspectSpinosaMaintenance } from "../spinosa-core/system/maintenance"
import { DialogConfirm } from "../ui/dialog-confirm"

const SHELL_PLACEHOLDER = ["ls -la", "git status", "pwd"]
const defaultPlaceholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: SHELL_PLACEHOLDER,
}
const spinosaPlaceholder = {
  normal: [
    "Find evidence in my sources for…",
    "Compare groups using my imported sources",
    "Find unexpected links across my sources",
  ],
  shell: SHELL_PLACEHOLDER,
}
const MAINTENANCE_CHECK_DELAY_MS = 500

export function Home() {
  const pluginRuntime = usePluginRuntime()
  const sync = useSync()
  const route = useLegacyHomeRoute()
  const dialog = useDialog()
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const spinosa = useSpinosaWorkspace()
  const { theme } = useTheme()
  const workspaceReady = createMemo(() => Boolean(spinosa.activePath && !spinosa.genericMode))
  const startupPrompt = createMemo(() => route.prompt ?? spinosa.pendingPrompt)
  const startupPromptIsQueued = createMemo(() => !route.prompt && Boolean(spinosa.pendingPrompt))
  const [bundledVersion] = createResource(readBundledFrameworkVersion)
  const wsVersion = createMemo(() => spinosa.meta?.frameworkVersion)
  const workspaceBannerText = createMemo(() => {
    const workspacePath = spinosa.activePath
    if (!workspacePath || spinosa.genericMode) return undefined
    return workspaceAsciiBannerText(workspacePath)
  })
  const versionLabel = createMemo(() => {
    const parts: string[] = []
    if (bundledVersion()) parts.push(`Spinosa v${bundledVersion()}`)
    if (wsVersion()) parts.push(`workspace v${wsVersion()}`)
    return parts.join(" · ")
  })
  const [maintenanceChecksStarted, setMaintenanceChecksStarted] = createSignal(false)
  const [maintenance, { refetch: refetchMaintenance }] = createResource(
    maintenanceChecksStarted,
    async (started) => (started ? inspectSpinosaMaintenance() : undefined),
  )
  const [maintenanceAction, setMaintenanceAction] = createSignal<"idle" | "cleaning" | "repairing">("idle")
  const maintenanceCleanupAvailable = createMemo(() => (maintenance()?.staleInstallDirectories.length ?? 0) > 0)
  const maintenanceRepairRequired = createMemo(() => maintenance()?.dependencyRepairRequired === true)

  onMount(() => {
    const timer = setTimeout(() => setMaintenanceChecksStarted(true), MAINTENANCE_CHECK_DELAY_MS)
    onCleanup(() => clearTimeout(timer))
  })

  const toast = useToast()
  const cleanStaleInstallerData = async () => {
    if (maintenanceAction() !== "idle") return
    const confirmed = await DialogConfirm.show(
      dialog,
      "Clean up leftover install files",
      "Remove temporary files left by an interrupted install? Your installed Spinosa versions will stay.",
    )
    if (!confirmed) return

    setMaintenanceAction("cleaning")
    try {
      const result = await cleanupStaleInstallDirectories()
      if (result.installInProgress) {
        toast.show({ variant: "info", message: "Cleanup skipped because a Spinosa install is in progress." })
      } else if (result.removedDirectories.length > 0) {
        toast.show({ variant: "success", message: "Removed stale Spinosa installer files." })
      }
      await refetchMaintenance()
    } catch (error) {
      toast.show({ variant: "error", message: error instanceof Error ? error.message : String(error) })
    } finally {
      setMaintenanceAction("idle")
    }
  }
  const repairDependencies = async () => {
    if (maintenanceAction() !== "idle") return
    const confirmed = await DialogConfirm.show(
      dialog,
      "Reinstall Spinosa runtime",
      "Reinstall the files Spinosa needs to run? This can take a few minutes. Restart Spinosa when it finishes.",
    )
    if (!confirmed) return

    const bundled = bundledVersion()
    if (!bundled) return
    setMaintenanceAction("repairing")
    const channel: ReleaseChannel = isPrereleaseFrameworkVersion(bundled) ? "beta" : "stable"
    try {
      const result = await upgradeFramework({ channel, version: bundled, reinstall: true, yes: true, suppressInstallOutput: true })
      if (!result.success) {
        toast.show({ variant: "error", message: "Dependency repair failed." })
        return
      }
      toast.show({ variant: "success", message: "Dependencies repaired. Restart Spinosa to use the repaired runtime." })
      await refetchMaintenance()
    } catch (error) {
      toast.show({ variant: "error", message: error instanceof Error ? error.message : String(error) })
    } finally {
      setMaintenanceAction("idle")
    }
  }
  const placeholders = createMemo(() => {
    if (spinosa.meta && !spinosa.genericMode && spinosa.meta.setupStatus === "workspace_started") {
      return spinosaPlaceholder
    }
    return defaultPlaceholder
  })

  const promptMaxWidth = createMemo(() => {
    const configured = tuiConfig.prompt?.max_width
    if (configured === "auto") return MAIN_CONTENT_MAX_WIDTH
    return configured ?? MAIN_CONTENT_MAX_WIDTH
  })

  let sent = false
  let once = false
  let lastRoutePromptKey: string | undefined
  let lastStartupHintKey: string | undefined

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (startupPrompt()) return
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Set route prompt and auto-submit if flagged
  createEffect(() => {
    const r = ref()
    const prompt = startupPrompt()
    if (!r || !prompt) return
    r.set(prompt)

    if (!prompt.autoSubmit && startupPromptIsQueued()) {
      const hintKey = JSON.stringify({ input: prompt.input, parts: prompt.parts })
      if (lastStartupHintKey !== hintKey) {
        lastStartupHintKey = hintKey
        toast.show({
          variant: "info",
          message: "Your setup brief is ready. Press Enter to run it, or edit it first.",
          duration: 4000,
        })
      }
    }
  })

  // Auto-submit route prompt once the prompt, sync, and model state are ready.
  createEffect(() => {
    const r = ref()
    const prompt = startupPrompt()
    if (!r || !prompt?.autoSubmit) return
    if (!sync.ready || !local.model.ready) return
    if (r.current.input !== prompt.input) return

    const promptKey = JSON.stringify({
      input: prompt.input,
      parts: prompt.parts,
      autoSubmit: prompt.autoSubmit,
    })
    if (lastRoutePromptKey === promptKey) return
    lastRoutePromptKey = promptKey
    if (startupPromptIsQueued()) spinosa.consumePendingPrompt()

    setTimeout(() => r.submit(), 0)
  })

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  createEffect(() => {
    if (!spinosa.pickerRequested) return
    spinosa.clearPickerRequest()
    dialog.replace(() => <DialogSpinosaWorkspacePicker onClose={() => spinosa.restorePickerRoute()} />)
  })

  return (
    <HomeSessionDestinationProvider>
      <CenteredColumn>
        <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
          <box flexGrow={1} minHeight={0} />
          <box height={4} minHeight={0} flexShrink={1} />
          <box flexShrink={0} alignItems="center" flexDirection="column">
            <Show when={versionLabel()}>
              <text fg={theme.textMuted}>{versionLabel()}</text>
              <box height={1} />
            </Show>
            <Show when={maintenance()?.installInProgress}>
              <text fg={theme.textMuted}>Maintenance checks will resume when this installation finishes.</text>
              <box height={1} />
            </Show>
            <Show when={maintenanceCleanupAvailable()}>
              <box flexDirection="row" alignItems="center" gap={1}>
                <text fg={theme.warning}>
                  Spinosa found {maintenance()?.staleInstallDirectories.length} leftover install file{maintenance()?.staleInstallDirectories.length === 1 ? "" : "s"}.
                </text>
                <box
                  paddingX={1}
                  backgroundColor={theme.backgroundElement}
                  onMouseDown={() => void cleanStaleInstallerData()}
                >
                  <text fg={theme.primary}>{maintenanceAction() === "cleaning" ? "Cleaning…" : "Clean up"}</text>
                </box>
              </box>
              <box height={1} />
            </Show>
            <Show when={maintenanceRepairRequired()}>
              <box flexDirection="row" alignItems="center" gap={1}>
                <text fg={theme.warning}>Spinosa’s runtime is incomplete or damaged.</text>
                <box
                  paddingX={1}
                  backgroundColor={theme.backgroundElement}
                  onMouseDown={() => void repairDependencies()}
                >
                  <text fg={theme.primary}>{maintenanceAction() === "repairing" ? "Reinstalling…" : "Reinstall runtime"}</text>
                </box>
              </box>
              <box height={1} />
            </Show>
            <Show when={maintenance.error}>
              <text fg={theme.textMuted}>Couldn’t check Spinosa’s health. Try again later.</text>
              <box height={1} />
            </Show>
            <pluginRuntime.Slot name="home_logo" mode="replace">
              <Show when={workspaceBannerText()} fallback={<Logo />}>
                {(banner) => (
                  <ascii_font
                    text={banner()}
                    font="block"
                    color={theme.text}
                    selectable={false}
                  />
                )}
              </Show>
            </pluginRuntime.Slot>
          </box>
          <box height={1} minHeight={0} flexShrink={1} />
          <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} paddingTop={1} flexShrink={0}>
            <SpinosaPromptChips />
            <Show when={workspaceReady()}>
              <box>
                <pluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
                  <Prompt
                    ref={bind}
                    disabled={false}
                    right={<pluginRuntime.Slot name="home_prompt_right" />}
                    placeholders={placeholders()}
                  />
                </pluginRuntime.Slot>
              </box>
            </Show>
          </box>
          <pluginRuntime.Slot name="home_bottom" />
          <box flexGrow={1} minHeight={0} />
          <Toast />
        </box>
      </CenteredColumn>
    </HomeSessionDestinationProvider>
  )
}
