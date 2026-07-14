import { Show, createSignal, createMemo, For, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"
import { useBindings } from "../../keymap"

export function DialogToolDetail(props: { part: any }) {
  const dialog = useDialog()
  const { theme } = useTheme()

  onMount(() => {
    dialog.setSize("large")
  })
  const p = () => props.part
  const s = () => p().state

  const statusColor = createMemo(() => {
    switch (s()?.status) {
      case "completed": return theme.success
      case "error": return theme.error
      case "running": return theme.warning
      default: return theme.textMuted
    }
  })

  const duration = createMemo(() => {
    const t = s()?.time
    if (!t?.start) return undefined
    const end = t.end ?? Date.now()
    const ms = end - t.start
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  })

  const inputEntries = createMemo(() => {
    const inp = s()?.input ?? {}
    return Object.entries(inp).filter(([k]) => k !== "questions")
  })

  useBindings(() => ({
    bindings: [
      { key: "escape", desc: "Close", group: "Dialog", cmd: () => dialog.clear() },
      { key: "return", desc: "Close", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Tool detail
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>{p().tool}</text>
        <text fg={statusColor()} attributes={TextAttributes.BOLD}>
          {String(s()?.status ?? "").toUpperCase()}
        </text>
      </box>

      <box height={1} backgroundColor={theme.border} />

      <Show when={p().callID}>
        <text fg={theme.textMuted}>Call ID: <span style={{ fg: theme.text }}>{p().callID}</span></text>
      </Show>
      <Show when={duration()}>
        <text fg={theme.textMuted}>Duration: <span style={{ fg: theme.text }}>{duration()}</span></text>
      </Show>

      <Show when={s()?.status === "error" && s()?.error}>
        <text fg={theme.accent} attributes={TextAttributes.BOLD}>──── Error ────</text>
        <box paddingLeft={1} border={["left"]} borderColor={theme.error}>
          <text fg={theme.error}>{String(s()?.error ?? "")}</text>
        </box>
      </Show>

      <Show when={inputEntries().length > 0}>
        <text fg={theme.accent} attributes={TextAttributes.BOLD}>──── Input ────</text>
        <For each={inputEntries()}>
          {([key, value]) => (
            <text fg={theme.textMuted}>
              {key}: <span style={{ fg: theme.text }}>{JSON.stringify(value)}</span>
            </text>
          )}
        </For>
      </Show>

      <Show when={s()?.status === "completed" && s()?.output}>
        <text fg={theme.accent} attributes={TextAttributes.BOLD}>──── Output ────</text>
        <box paddingLeft={1} maxHeight={12} backgroundColor={theme.backgroundElement} overflow="hidden">
          <text fg={theme.text} wrapMode="none">{String(s()?.output ?? "").slice(0, 2000)}</text>
        </box>
      </Show>

      <box height={1} />
      <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
        esc close
      </text>
    </box>
  )
}
