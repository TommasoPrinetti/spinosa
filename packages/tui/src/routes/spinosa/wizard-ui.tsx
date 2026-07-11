import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import type { Theme } from "../../context/theme"
import { SplitBorder } from "../../ui/border"
import { buttonBackground, buttonBorder, buttonText } from "../../util/button"
import { Locale } from "../../util/locale"
import type { ImportScanPreview, NewWorkspacePreview } from "../../spinosa/onboarding-preview"

export type ImportOption = {
  ext: string
  count: number
  bytes: number
  selected: boolean
}

/** Defer press handlers so route changes do not unmount the tree mid-mousedown. */
export function deferPress(action: () => void) {
  setTimeout(() => action(), 0)
}

export function nextFocusedSourceIndexForAppend(
  currentFocusedIndex: number,
  nextIndex: number,
  options?: { focusNewInput?: boolean },
) {
  return options?.focusNewInput === false ? currentFocusedIndex : nextIndex
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

export function shouldCancelSpinosaWorkOnCtrlC(props: {
  step: string
  busy: boolean
  waitingForGate: boolean
  cancellableSteps: readonly string[]
}) {
  return props.busy || props.cancellableSteps.includes(props.step) || (props.waitingForGate && props.cancellableSteps.includes(props.step))
}

export function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
}

export function generateScanLines(preview: NewWorkspacePreview | ImportScanPreview): string[] {
  const lines: string[] = []
  lines.push("Scanning source files...")
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
      borderColor={buttonBorder(props.theme, active(), props.primary ? props.theme.success : props.theme.border)}
      onMouseOver={() => {
        props.onHover?.()
        setHover(true)
      }}
      onMouseOut={() => setHover(false)}
      onMouseDown={() => deferPress(props.onPress)}
    >
      <text fg={buttonText(props.theme, active(), props.primary ? props.theme.success : props.theme.textMuted)}>
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

export function wizardScrollboxMaxHeight(
  viewportHeight: number,
  options?: { min?: number; ratio?: number; max?: number },
): number {
  const min = options?.min ?? 4
  const ratio = options?.ratio ?? 0.6
  const max = options?.max
  const resolved = Math.max(min, Math.floor(viewportHeight * ratio))
  return max === undefined ? resolved : Math.min(resolved, max)
}

export function scanOptionListMaxHeight(viewportHeight: number): number {
  return wizardScrollboxMaxHeight(viewportHeight)
}

function scrollSelectedImportOptionIntoView(scroll: ScrollBoxRenderable | undefined, selectedIndex: number) {
  if (!scroll || selectedIndex <= 0) return
  const target = scroll.getChildren()[selectedIndex - 1]
  if (!target) return

  const y = target.y - scroll.y
  if (y >= scroll.height) {
    scroll.scrollBy(y - scroll.height + 1)
  } else if (y < 0) {
    scroll.scrollBy(y)
    if (selectedIndex === 1) scroll.scrollTo(0)
  }
}

export function ImportOptionsSelector(props: {
  theme: Theme
  options: ImportOption[]
  selectedIndex: number
  viewportHeight: number
  formatCount?: (item: ImportOption) => string
  formatDetail?: (item: ImportOption) => string
  onSelectIndex: (index: number) => void
  onToggleAll: () => void
  onToggleItem: (index: number) => void
}) {
  let scroll: ScrollBoxRenderable | undefined
  const totalFiles = createMemo(() => props.options.reduce((sum, item) => sum + item.count, 0))

  createEffect(() => {
    const selectedIndex = props.selectedIndex
    queueMicrotask(() => scrollSelectedImportOptionIntoView(scroll, selectedIndex))
  })

  return (
    <box flexDirection="column" gap={1} paddingTop={1}>
      <box
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        backgroundColor={buttonBackground(props.theme, props.selectedIndex === 0)}
        onMouseOver={() => props.onSelectIndex(0)}
        onMouseDown={() => deferPress(props.onToggleAll)}
      >
        <ToggleLine
          theme={props.theme}
          selected={props.selectedIndex === 0}
          enabled={props.options.every((item) => item.selected)}
          label="All supported files"
          count={totalFiles()}
        />
      </box>
      <scrollbox
        ref={(element: ScrollBoxRenderable) => (scroll = element)}
        maxHeight={scanOptionListMaxHeight(props.viewportHeight)}
        scrollbarOptions={{ visible: false }}
      >
        <For each={props.options}>
          {(item, index) => {
            const active = createMemo(() => props.selectedIndex === index() + 1)
            return (
              <box
                paddingLeft={1}
                paddingRight={1}
                paddingTop={1}
                paddingBottom={1}
                backgroundColor={buttonBackground(props.theme, active())}
                onMouseOver={() => props.onSelectIndex(index() + 1)}
                onMouseDown={() => deferPress(() => props.onToggleItem(index()))}
              >
                <box flexDirection="row" gap={1} alignItems="center">
                  <text fg={buttonText(props.theme, active(), props.theme.primary)} width={2}>
                    {item.selected ? "●" : "○"}
                  </text>
                  <text fg={buttonText(props.theme, active(), props.theme.text)} width={10}>
                    .{item.ext}
                  </text>
                  <text fg={buttonText(props.theme, active(), props.theme.textMuted)} width={10}>
                    {props.formatCount?.(item) ?? `${item.count} file${item.count === 1 ? "" : "s"}`}
                  </text>
                  <text fg={buttonText(props.theme, active(), props.theme.textMuted)}>
                    {props.formatDetail?.(item) ?? `${item.bytes} B`}
                  </text>
                </box>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </box>
  )
}

export function LogScrollbox(props: { theme: Theme; lines: string[]; viewportHeight: number }) {
  return (
    <scrollbox
      maxHeight={wizardScrollboxMaxHeight(props.viewportHeight, { min: 4, ratio: 0.45, max: 14 })}
      stickyScroll={true}
      stickyStart="bottom"
    >
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

export function ProgressBar(props: {
  theme: Theme
  current: number
  total: number
  status: string
  fileName: string
  barWidth?: number
}) {
  const total = createMemo(() => (props.total > 0 ? props.total : 1))
  const pct = createMemo(() => Math.min(props.current / total(), 1))
  const blocks = () => props.barWidth ?? 20
  const filled = () => Math.round(pct() * blocks())
  const bar = () => "█".repeat(filled()) + "░".repeat(blocks() - filled())
  return (
    <box flexDirection="column" gap={1} paddingTop={1}>
      <box flexDirection="row" gap={0} alignItems="center">
        <text fg={props.theme.text}>
          {bar()} {Math.round(pct() * 100)}%
        </text>
        <text fg={props.theme.textMuted} attributes={TextAttributes.DIM}>
          {" "}{props.current} of {total()}
        </text>
      </box>
      <Show when={props.status !== ""}>
        <text fg={props.theme.textMuted} wrapMode="none" overflow="hidden">{Locale.truncate(props.status, 80)}</text>
      </Show>
      <Show when={props.fileName !== ""}>
        <text fg={props.theme.textMuted} attributes={TextAttributes.DIM} wrapMode="none" overflow="hidden">{Locale.truncate(props.fileName, 80)}</text>
      </Show>
    </box>
  )
}
