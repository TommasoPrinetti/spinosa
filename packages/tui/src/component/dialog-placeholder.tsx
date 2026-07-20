import { TextAttributes } from "@opentui/core"
import { onMount } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"

export function DialogPlaceholder(props: { title: string }) {
  const dialog = useDialog()
  const { theme } = useTheme()

  onMount(() => {
    dialog.setSize("medium")
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box height={1} />
      <text fg={theme.textMuted}>Coming soon.</text>
      <box height={1} />
      <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
        esc close
      </text>
    </box>
  )
}
