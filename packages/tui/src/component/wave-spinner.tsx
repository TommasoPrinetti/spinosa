import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import { Show } from "solid-js"
import "opentui-spinner/solid"
import { useKV } from "../context/kv"
import { useTheme } from "../context/theme"

const WAVE_LEVELS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇"]

export const WAVE_SPINNER_FRAMES = Array.from({ length: 14 }, (_, frame) =>
  Array.from({ length: 6 }, (_, index) => {
    const position = (index + frame) % 14
    return WAVE_LEVELS[position <= 6 ? position : 13 - position]
  }).join(""),
)

export function WaveSpinner(props: { children?: JSX.Element; color?: RGBA }) {
  const { theme } = useTheme()
  const kv = useKV()
  const color = () => props.color ?? theme.spinnerColor ?? theme.textMuted

  return (
    <Show when={kv.get("animations_enabled", true)} fallback={<text fg={color()}>▁▃▅▇▅▃</text>}>
      <box flexDirection="row" gap={1}>
        <spinner frames={WAVE_SPINNER_FRAMES} interval={120} color={color()} />
        <Show when={props.children}>
          <text fg={color()}>{props.children}</text>
        </Show>
      </box>
    </Show>
  )
}
