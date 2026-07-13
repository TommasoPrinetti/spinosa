import { RGBA, TextAttributes } from "@opentui/core"
import { createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { DialogSpinosaSettings } from "./dialog-spinosa-settings"
import { DialogAgent } from "./dialog-agent"
import { DialogPlaceholder } from "./dialog-placeholder"
import { MAIN_CONTENT_MAX_WIDTH } from "../util/layout"

export function HomeFooter() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [hovered, setHovered] = createSignal<string | undefined>()

  const openSettings = () => dialog.replace(() => <DialogSpinosaSettings />)
  const openAgents = () => dialog.replace(() => <DialogAgent />)
  const openKeys = () => dialog.replace(() => <DialogPlaceholder title="Keyboard shortcuts" />)
  const openWorkspaces = () => dialog.replace(() => <DialogPlaceholder title="Workspaces" />)
  const openModels = () => dialog.replace(() => <DialogPlaceholder title="Models" />)

  type Shortcut = { key: string; label: string; action: () => void }
  const shortcuts: Shortcut[] = [
    { key: "S", label: "Settings", action: openSettings },
    { key: "A", label: "Agents", action: openAgents },
    { key: "K", label: "Keys", action: openKeys },
    { key: "W", label: "Workspaces", action: openWorkspaces },
    { key: "M", label: "Models", action: openModels },
  ]

  return (
    <box width="100%" maxWidth={MAIN_CONTENT_MAX_WIDTH} flexDirection="row" justifyContent="center" gap={0}>
      <For each={shortcuts}>
        {(item, i) => (
          <>
            <Show when={i() > 0}>
              <text fg={theme.textMuted}>{" | "}</text>
            </Show>
            <box
              paddingX={1}
              backgroundColor={hovered() === item.key ? theme.backgroundPanel : undefined}
              onMouseOver={() => setHovered(item.key)}
              onMouseOut={() => setHovered(undefined)}
              onMouseDown={item.action}
            >
              <text
                fg={hovered() === item.key ? RGBA.fromInts(0, 0, 0, 255) : theme.textMuted}
                attributes={hovered() === item.key ? TextAttributes.BOLD : TextAttributes.DIM}
              >
                [{item.key}] {item.label}
              </text>
            </box>
          </>
        )}
      </For>
    </box>
  )
}
