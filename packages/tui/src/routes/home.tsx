import { Prompt, type PromptRef } from "../component/prompt"
import { createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast, useToast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useLegacyHomeRoute } from "../context/route"
import { useExit } from "../context/exit"
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
import { OPENCODE_BASE_MODE, useOpencodeKeymap, useOpencodeModeStack } from "../keymap"
import { readBundledFrameworkVersion, compareFrameworkVersions, isPrereleaseFrameworkVersion } from "../spinosa/service"
import { workspaceAsciiBannerText } from "../spinosa/workspace-name"
import { upgradeFramework } from "../spinosa-core/commands/upgrade"
import { resolveReleaseVersionForChannel, type ReleaseChannel } from "../spinosa-core/system/channels"
import { buttonText } from "../util/button"

const SHELL_PLACEHOLDER = ["ls -la", "git status", "pwd"]
const defaultPlaceholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: SHELL_PLACEHOLDER,
}
const spinosaPlaceholder = {
  normal: [
    "Find source-grounded evidence for…",
    "Compare cohorts using approved corpus sources",
    "Surface hidden connections across the corpus",
  ],
  shell: SHELL_PLACEHOLDER,
}

export function Home() {
  const pluginRuntime = usePluginRuntime()
  const exit = useExit()
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
  const [latestVersion] = createResource(
    bundledVersion,
    async (bv: string) => {
      try {
        // Infer channel from the bundled version: prerelease → beta, otherwise → stable.
        // This prevents offering stable upgrades when the user runs a beta build.
        const inferredChannel: ReleaseChannel = isPrereleaseFrameworkVersion(bv) ? "beta" : "stable"
        return await resolveReleaseVersionForChannel(inferredChannel)
      } catch { return undefined }
    },
  )
  const upgradeAvailable = createMemo(() => {
    const bv = bundledVersion()
    const lv = latestVersion()
    if (!bv || !lv) return false
    return compareFrameworkVersions(lv, bv) === 1
  })
  const [upgradeHover, setUpgradeHover] = createSignal(false)
  const [upgrading, setUpgrading] = createSignal(false)
  const modeStack = useOpencodeModeStack()
  const keymap = useOpencodeKeymap()
  const [keyboardFocus, setKeyboardFocus] = createSignal(-1)

  onMount(() => {
    const off = keymap.intercept("key", ({ event, consume }) => {
      if (modeStack.current() !== OPENCODE_BASE_MODE) return

      // Only intercept when the upgrade button is actually focused.
      // Otherwise let events fall through to child components (SpinosaPromptChips etc.)
      if (keyboardFocus() === 0) {
        if (event.name === "up" || event.name === "k") {
          setKeyboardFocus(-1)
          consume(); return
        }
        if (event.name === "down" || event.name === "j") {
          setKeyboardFocus(-1)
          consume(); return
        }
        if (event.name === "return") {
          void doUpgrade()
          consume(); return
        }
      } else if (event.name === "down" || event.name === "j") {
        // Not focused — try to focus the upgrade button if available
        if (upgradeAvailable()) {
          setKeyboardFocus(0)
          consume(); return
        }
        // No upgrade button — don't consume, event falls through
      }
    })
    onCleanup(off)
  })

  const toast = useToast()
  const doUpgrade = async () => {
    if (upgrading()) return
    setUpgrading(true)
    const bv = bundledVersion()
    const channel: ReleaseChannel = bv && isPrereleaseFrameworkVersion(bv) ? "beta" : "stable"
    try {
      const result = await upgradeFramework({
        channel,
        yes: true,
        onPhase: (_phase, msg) => {
          toast.show({ variant: "info", message: msg, duration: 0 })
        },
      })
      if (result.success) {
        const wsList = result.workspaceUpgradesNeeded
        if (wsList.length > 0) {
          const wsNames = wsList.map((p: string) => p.split("/").pop() || p).join(", ")
          toast.show({
            variant: "success",
            message: `Upgrade complete! ${wsList.length} workspace(s) need updating: ${wsNames}. Run 'spinosa update' to sync them.`,
            duration: 5000,
          })
        } else {
          toast.show({ variant: "success", message: "Upgrade complete!" })
        }
        // Give toast time to render, then restart the TUI
        await new Promise((r) => setTimeout(r, 3000))
        exit()
      } else {
        toast.show({ variant: "error", message: "Upgrade failed" })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.show({ variant: "error", message: msg })
    } finally {
      setUpgrading(false)
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
          message: "Startup prompt ready - press Enter to run it, or edit it first.",
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
    dialog.replace(() => <DialogSpinosaWorkspacePicker />)
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
              <Show when={upgradeAvailable()}>
                <box
                  paddingX={1}
                  backgroundColor={upgradeHover() || keyboardFocus() === 0 ? theme.text : undefined}
                  onMouseDown={doUpgrade}
                  onMouseOver={() => !upgrading() && setUpgradeHover(true)}
                  onMouseOut={() => setUpgradeHover(false)}
                >
                  <text fg={buttonText(theme, upgradeHover() || keyboardFocus() === 0, theme.primary)}>
                    {upgrading() ? "Upgrading…" : "Upgrade available"}
                  </text>
                </box>
                <box height={1} />
              </Show>
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
