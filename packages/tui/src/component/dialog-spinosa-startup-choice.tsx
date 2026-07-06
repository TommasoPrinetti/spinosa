import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, For } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useSpinosaWorkspace } from "../context/spinosa-workspace"
import { useDialog } from "../ui/dialog"
import { useBindings } from "../keymap"
import { buttonBackground, buttonBorder, buttonText } from "../util/button"

export function DialogSpinosaStartupChoice(props: {
  workspacePath: string
  workspaceName: string
  prompt: string
  onBack?: () => void
}) {
  const { theme } = useTheme()
  const route = useRoute()
  const spinosa = useSpinosaWorkspace()
  const dialog = useDialog()
  const [selected, setSelected] = createSignal(0)

  const launchStartupInChat = async () => {
    dialog.clear()
    spinosa.queuePrompt({ input: props.prompt, parts: [], autoSubmit: true })
    await spinosa.openWorkspace(props.workspacePath)
    route.navigate({ type: "workspace" })
  }

  const openChatDirectly = async () => {
    dialog.clear()
    await spinosa.openWorkspace(props.workspacePath)
    route.navigate({ type: "workspace" })
  }

  const options = createMemo(() => [
    {
      title: "Run startup-prompt in chat",
      description: "Load `startup-prompt.md` and submit it automatically.",
      primary: true,
      run: () => void launchStartupInChat(),
    },
    {
      title: "Open normal chat",
      description: "Skip startup for now and enter the workspace chat.",
      primary: false,
      run: () => void openChatDirectly(),
    },
    {
      title: "Back",
      description: "Return to the workspace list.",
      primary: false,
      run: () => props.onBack?.(),
    },
  ] as const)

  const move = (offset: number) => {
    const count = options().length
    setSelected((value) => (value + offset + count) % count)
  }

  const confirm = () => {
    const option = options()[selected()]
    if (!option) return
    option.run()
  }

  useBindings(() => ({
    bindings: [
      { key: "up", desc: "Previous startup option", group: "Dialog", cmd: () => move(-1) },
      { key: "down", desc: "Next startup option", group: "Dialog", cmd: () => move(1) },
      { key: "left", desc: "Previous startup option", group: "Dialog", cmd: () => move(-1) },
      { key: "right", desc: "Next startup option", group: "Dialog", cmd: () => move(1) },
      { key: "tab", desc: "Next startup option", group: "Dialog", cmd: () => move(1) },
      { key: "shift+tab", desc: "Previous startup option", group: "Dialog", cmd: () => move(-1) },
      { key: "return", desc: "Confirm startup option", group: "Dialog", cmd: () => confirm() },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {props.workspaceName}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted}>
        This workspace is at the `cli_started` stage. Choose whether to resume startup indexing or enter chat
        normally.
      </text>
      <box height={1} />
      <For each={options()}>
        {(option, index) => {
          const active = () => selected() === index()
          return (
            <box
              paddingLeft={2}
              paddingRight={2}
              paddingTop={1}
              paddingBottom={1}
              backgroundColor={buttonBackground(theme, active())}
              border={["left"]}
              borderColor={buttonBorder(theme, active(), option.primary ? theme.primary : theme.borderActive)}
              onMouseOver={() => setSelected(index())}
              onMouseDown={() => {
                setSelected(index())
                option.run()
              }}
            >
              <text fg={buttonText(theme, active(), option.primary ? theme.primary : theme.text)}>
                <span style={{ bold: active() }}>{option.title}</span>
              </text>
              <text fg={buttonText(theme, active(), theme.textMuted)}>{option.description}</text>
            </box>
          )
        }}
      </For>
      <box height={1} />
      <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
        ↑↓ move · enter select · esc close
      </text>
    </box>
  )
}
