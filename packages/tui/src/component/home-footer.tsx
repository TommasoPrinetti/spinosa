import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useSpinosaWorkspace } from "../context/spinosa-workspace"
import { DialogSpinosaSettings } from "./dialog-spinosa-settings"
import { DialogAgent } from "./dialog-agent"
import { DialogSessionList } from "./dialog-session-list"
import { DialogModel } from "./dialog-model"
import { DialogProvider } from "./dialog-provider"
import { MAIN_CONTENT_MAX_WIDTH } from "../util/layout"

export function HomeFooter() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const spinosa = useSpinosaWorkspace()
  const [hovered, setHovered] = createSignal<string | undefined>()

  type Shortcut = { id: string; label: string; action: () => void }
  const buttons = createMemo<Shortcut[]>(() => {
    const items: Shortcut[] = [
      { id: "S", label: "Settings", action: () => dialog.replace(() => <DialogSpinosaSettings />) },
      { id: "A", label: "Agents", action: () => dialog.replace(() => <DialogAgent />) },
      { id: "P", label: "Provider", action: () => dialog.replace(() => <DialogProvider />) },
      { id: "M", label: "Models", action: () => dialog.replace(() => <DialogModel />) },
    ]
    if (!spinosa.genericMode) {
      items.splice(2, 0, { id: "K", label: "Sessions", action: () => dialog.replace(() => <DialogSessionList />) })
    }
    return items
  })

  return (
    <box width="100%" maxWidth={MAIN_CONTENT_MAX_WIDTH} flexDirection="row" justifyContent="center" gap={0}>
      <For each={buttons()}>
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
