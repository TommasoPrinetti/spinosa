import { Prompt, type PromptRef } from "../component/prompt"
import { createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
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
import { OPENCODE_BASE_MODE, useOpencodeKeymap, useOpencodeModeStack } from "../keymap"
import { readBundledFrameworkVersion, compareFrameworkVersions } from "../spinosa/service"
import { workspaceAsciiBannerText } from "../spinosa/workspace-name"
import { resolveReleaseVersionForChannel, spinosaReleaseChannel } from "@opencode-ai/spinosa-core/system/channels"
import { runUpgrade } from "../spinosa/cli-bridge"
import { buttonBackground, buttonText } from "../util/button"

let once = false
const defaultPlaceholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}
const spinosaPlaceholder = {
  normal: [
    "Find source-grounded evidence for…",
    "Compare cohorts using approved corpus sources",
    "Surface hidden connections across the corpus",
  ],
  shell: ["ls -la", "git status", "pwd"],
}

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
  const [bundledVersion, { refetch: refetchBundled }] = createResource(readBundledFrameworkVersion)
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
  const [latestVersion] = createResource(async () => {
    try {
      const channel = await spinosaReleaseChannel()
      return await resolveReleaseVersionForChannel(channel)
    } catch { return undefined }
  })
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

      if (event.name === "up" || event.name === "k") {
        setKeyboardFocus((v) => Math.max(-1, v - 1))
        consume(); return
      }
      if (event.name === "down" || event.name === "j") {
        if (keyboardFocus() === -1 && upgradeAvailable()) {
          setKeyboardFocus(0)
          consume(); return
        }
        setKeyboardFocus((v) => Math.min(0, v + 1))
        consume(); return
      }
      if (event.name === "return" && keyboardFocus() === 0) {
        void doUpgrade()
        consume(); return
      }
    })
    onCleanup(off)
  })

  const doUpgrade = async () => {
    if (upgrading()) return
    setUpgrading(true)
    try {
      await runUpgrade()
      refetchBundled()
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
  let lastRoutePromptKey: string | undefined

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
