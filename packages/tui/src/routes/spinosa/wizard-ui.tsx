import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { Theme } from "../../context/theme"
import { SplitBorder } from "../../ui/border"
import { buttonBackground, buttonBorder, buttonText } from "../../util/button"
import type { ImportScanPreview, NewWorkspacePreview } from "../../spinosa/onboarding-preview"

export type ImportOption = {
  ext: string
  count: number
  selected: boolean
}

/** Defer press handlers so route changes do not unmount the tree mid-mousedown. */
export function deferPress(action: () => void) {
  setTimeout(() => action(), 0)
}

/** Blur a focused input so mouse-driven controls can receive hover and click. */
export function blurIfFocused(renderable?: { focused?: boolean; blur?: () => void; isDestroyed?: boolean }) {
  if (renderable && !renderable.isDestroyed && renderable.focused && renderable.blur) renderable.blur()
}

/** Invalidate in-flight async wizard work when the user navigates back or starts a new run. */
export function createWorkflowGuard() {
  let generation = 0
  return {
    bump: () => ++generation,
    active: (gen: number) => gen === generation,
  }
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
}

export function generateScanLines(preview: NewWorkspacePreview | ImportScanPreview): string[] {
  const lines: string[] = []
  lines.push("Scanning source folder...")
  if ("preflightRows" in preview) {
    lines.push("")
    for (const row of preview.preflightRows) {
      const icon = row.tone === "error" ? "✗" : row.tone === "success" ? "✓" : "─"
      const detail = row.detail ? ` | ${row.detail}` : ""
      lines.push(`${icon} ${row.label} — ${row.status}${detail}`)
    }
  }
  lines.push("")
  for (const row of preview.scanRows) {
    const icon = row.tone === "error" ? "✗" : "─"
    const detail = row.detail ? ` | ${row.detail}` : ""
    lines.push(`${icon} ${row.label} — ${row.status}${detail}`)
  }
  if (preview.importOptions.length > 0) {
    lines.push("")
    lines.push(`Importable file types: ${preview.importOptions.length}`)
    for (const opt of preview.importOptions) {
      lines.push(
        `  .${opt.ext} — ${opt.count} file${opt.count === 1 ? "" : "s"}${opt.selected ? "" : " (audio/video, not selected by default)"}`,
      )
    }
  }
  return lines
}

export function WizardPanel(props: { theme: Theme; accent?: boolean; children: any }) {
  return (
    <box
      flexDirection="column"
      gap={1}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={props.theme.backgroundPanel}
      border={["left"]}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={props.accent ? props.theme.primary : props.theme.border}
    >
      {props.children}
    </box>
  )
}

export function WizardActionRow(props: { children: any }) {
  return (
    <box flexDirection="row" gap={1} flexWrap="wrap">
      {props.children}
    </box>
  )
}

export function WizardActionButton(props: {
  theme: Theme
  label: string
  primary?: boolean
  onPress: () => void
  onHover?: () => void
}) {
  const [hover, setHover] = createSignal(false)
  const active = () => hover() || Boolean(props.primary)
  return (
    <box
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={buttonBackground(props.theme, active())}
      border={["left"]}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={buttonBorder(props.theme, active(), props.primary ? props.theme.primary : props.theme.border)}
      onMouseOver={() => {
        props.onHover?.()
        setHover(true)
      }}
      onMouseOut={() => setHover(false)}
      onMouseDown={() => deferPress(props.onPress)}
    >
      <text fg={buttonText(props.theme, active(), props.primary ? props.theme.primary : props.theme.textMuted)}>
        <span style={{ bold: props.primary || active() }}>{props.label}</span>
      </text>
    </box>
  )
}

export function WizardGateButton(props: { theme: Theme; label: string; action: () => void }) {
  const [remaining, setRemaining] = createSignal(30)
  let timer: ReturnType<typeof setInterval> | undefined

  onMount(() => {
    timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer)
          deferPress(props.action)
          return 0
        }
        return r - 1
      })
    }, 1000)
  })

  onCleanup(() => {
    if (timer) clearInterval(timer)
  })

  return (
    <WizardActionButton
      theme={props.theme}
      label={`${props.label} (${remaining()}s)`}
      primary
      onPress={() => {
        if (timer) clearInterval(timer)
        props.action()
      }}
    />
  )
}

export function ToggleLine(props: {
  theme: Theme
  selected: boolean
  enabled: boolean
  label: string
  count: number
}) {
  return (
    <text fg={props.selected ? props.theme.text : props.theme.textMuted} wrapMode="none">
      <span style={{ fg: props.enabled ? props.theme.text : props.theme.textMuted }}>{props.enabled ? "●" : "○"}</span>
      <span style={{ fg: props.selected ? props.theme.text : props.theme.textMuted }}> {props.label}</span>
      <span style={{ fg: props.theme.textMuted }}> | </span>
      <span style={{ fg: props.theme.borderActive }}>
        {props.count} file{props.count === 1 ? "" : "s"}
      </span>
    </text>
  )
}

export function LogScrollbox(props: { theme: Theme; lines: string[] }) {
  return (
    <scrollbox maxHeight={14} stickyScroll={true} stickyStart="bottom">
      <For each={props.lines}>
        {(line) => <text fg={props.theme.textMuted}>{line || " "}</text>}
      </For>
    </scrollbox>
  )
}

export function LogoSummary(props: { theme: Theme; label: string }) {
  return (
    <text fg={props.theme.text}>
      <span style={{ bold: true }}>{props.label}</span>
    </text>
  )
}