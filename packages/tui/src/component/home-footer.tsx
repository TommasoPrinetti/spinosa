import { TextAttributes } from "@opentui/core"
import { createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { DialogSpinosaSettings } from "./dialog-spinosa-settings"
import { DialogAgent } from "./dialog-agent"
import { DialogSessionList } from "./dialog-session-list"
import { DialogModel } from "./dialog-model"
import { MAIN_CONTENT_MAX_WIDTH } from "../util/layout"

export function HomeFooter() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [hovered, setHovered] = createSignal<string | undefined>()

  const openSettings = () => dialog.replace(() => <DialogSpinosaSettings />)
  const openAgents = () => dialog.replace(() => <DialogAgent />)
  const openSessions = () => dialog.replace(() => <DialogSessionList />)
  const openModels = () => dialog.replace(() => <DialogModel />)

  type Shortcut = { id: string; label: string; action: () => void }
  const buttons: Shortcut[] = [
    { id: "S", label: "Settings", action: openSettings },
    { id: "A", label: "Agents", action: openAgents },
    { id: "K", label: "Sessions", action: openSessions },
    { id: "W", label: "Models", action: openModels },
  ]

  return (
    <box width="100%" maxWidth={MAIN_CONTENT_MAX_WIDTH} flexDirection="row" justifyContent="center" gap={0}>
      <For each={buttons}>
        {(item, i) => (
          <>
            <Show when={i() > 0}>
              <text fg={theme.textMuted}>{" · "}</text>
            </Show>
            <box
              paddingX={1}
              onMouseOver={() => setHovered(item.id)}
              onMouseOut={() => setHovered(undefined)}
              onMouseUp={item.action}
            >
              <text
                fg={hovered() === item.id ? theme.text : theme.textMuted}
                attributes={hovered() === item.id ? TextAttributes.BOLD : undefined}
              >
                {item.label}
              </text>
            </box>
          </>
        )}
      </For>
    </box>
  )
}
