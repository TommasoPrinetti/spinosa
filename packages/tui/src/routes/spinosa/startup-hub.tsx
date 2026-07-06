// DEAD CODE — superseded by workspace-picker inline cli_started prompt (July 2026).
// Kept for reference. Not used in any current route.
import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { useRoute } from "../../context/route"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { CenteredColumn } from "../../component/centered-column"
import { readStartupPrompt } from "../../spinosa/service"
import { OPENCODE_BASE_MODE, useOpencodeKeymap, useOpencodeModeStack } from "../../keymap"
import { Toast } from "../../ui/toast"
import { MAIN_CONTENT_MAX_WIDTH } from "../../util/layout"

type HubOption = {
  id: string
  title: string
  description: string
  primary: boolean
  run: () => void
}

export function StartupHub() {
  const { theme } = useTheme()
  const { navigate } = useRoute()
  const keymap = useOpencodeKeymap()
  const modeStack = useOpencodeModeStack()
  const spinosa = useSpinosaWorkspace()
  const [startupPrompt] = createResource(
    () => spinosa.activePath,
    (path) => (path ? readStartupPrompt(path) : undefined),
  )
  const [selected, setSelected] = createSignal(0)

  const promptText = () =>
    startupPrompt() ??
    "Run Spinosa startup indexing for this workspace. Follow startup-prompt.md: survey corpus, batch mapper extraction, write maps, validate, and set setup_status to workspace_started."

  const options = (): HubOption[] => [
    {
      id: "startup",
      title: "Launch startup indexing",
      description: "Load startup-prompt.md into Chat and begin indexing automatically",
      primary: true,
      run: () =>
        navigate({
          type: "workspace",
          prompt: { input: promptText(), parts: [], autoSubmit: true },
        }),
    },
    {
      id: "chat",
      title: "Open chat directly",
      description: "Skip startup indexing and open the Chat workspace",
      primary: false,
      run: () => navigate({ type: "workspace" }),
    },
    {
      id: "switch",
      title: "Switch workspace",
      description: "Go back and pick a different workspace",
      primary: false,
      run: () => spinosa.showPicker(),
    },
  ]

  const runSelected = () => {
    const item = options()[selected()]
    if (!item) return
    item.run()
  }

  onMount(() => {
    const off = keymap.intercept("key", ({ event }) => {
      if (modeStack.current() !== OPENCODE_BASE_MODE) return
      const list = options()
      if (event.name === "up" || event.name === "k") {
        setSelected((value) => Math.max(0, value - 1))
        return true
      }
      if (event.name === "down" || event.name === "j") {
        setSelected((value) => Math.min(list.length - 1, value + 1))
        return true
      }
      if (event.name === "return") {
        runSelected()
        return true
      }
    })
    onCleanup(off)
  })

  return (
    <CenteredColumn>
      <box flexGrow={1} flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={2} gap={1}>
        <text fg={theme.text}>
          <span style={{ bold: true }}>Startup indexing required</span>
        </text>
        <Show when={spinosa.meta}>
          {(meta) => (
            <box gap={1}>
              <text fg={theme.textMuted}>Workspace: {meta().projectName}</text>
              <text fg={theme.textMuted}>Status: Ready to index</text>
              <text fg={theme.textMuted}>Path: {meta().path}</text>
            </box>
          )}
        </Show>
        <box height={1} />
        <text fg={theme.textMuted}>
          This workspace was created by the CLI but startup indexing has not completed yet.
          The corpus needs to be read, mapped, and validated before agents can search it.
        </text>
        <box height={1} />
        <box width="100%" maxWidth={MAIN_CONTENT_MAX_WIDTH} flexDirection="column" gap={1} flexShrink={0}>
          <For each={options()}>
            {(item, index) => (
              <box
                paddingLeft={2}
                paddingRight={2}
                paddingTop={1}
                paddingBottom={1}
                backgroundColor={
                  selected() === index() ? theme.backgroundElement : theme.backgroundPanel
                }
                border={["left"]}
                borderColor={
                  selected() === index()
                    ? item.primary
                      ? theme.primary
                      : theme.borderActive
                    : theme.border
                }
                onMouseOver={() => setSelected(index())}
                onMouseUp={() => item.run()}
              >
                <text>
                  <span
                    style={{
                      fg: item.primary ? theme.primary : theme.text,
                      bold: selected() === index(),
                    }}
                  >
                    {item.title}
                  </span>
                </text>
                <text fg={theme.textMuted}>{item.description}</text>
              </box>
            )}
          </For>
        </box>
        <box height={1} />
        <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
          ↑↓ move · enter select
        </text>
        <box flexGrow={1} />
        <Toast />
      </box>
    </CenteredColumn>
  )
}
