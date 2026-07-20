import { For, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import type { GraphHit, GraphScene, GraphValue } from "./visualizer-graph-layout"

const PRIORITY = [
  "status",
  "tool",
  "path",
  "relation",
  "from",
  "to",
  "target",
  "session",
  "bucket",
  "order",
  "calls",
  "count",
  "errors",
  "durationMs",
  "reads",
  "searches",
  "discoveries",
  "mutations",
  "accesses",
  "sessions",
  "heat",
  "memberCount",
  "members",
  "collapsed",
  "causal",
  "start",
  "end",
  "lastAccessed",
] as const

const LABELS: Record<string, string> = {
  durationMs: "duration",
  memberCount: "members",
  lastAccessed: "last access",
}

const FORBIDDEN_FIELD = /(^|_)(absolute|raw|input|output|content|prompt|command|cwd|workdir)(_|$)/i
const ABSOLUTE_VALUE = /^(?:\/(?!\/)|~\/|[A-Za-z]:[\\/]|\\\\|file:\/\/)/

export type GraphInspectorDetail = Readonly<{ key: string; label: string; value: string }>

function safeField(key: string) {
  return !FORBIDDEN_FIELD.test(key.replace(/([a-z])([A-Z])/g, "$1_$2"))
}

function safeValue(value: GraphValue) {
  if (value === null) return
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : undefined
  const clean = value.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").trim()
  if (!clean || ABSOLUTE_VALUE.test(clean)) return
  return clean.length > 96 ? `${clean.slice(0, 95)}…` : clean
}

/** Curated presentation fields only; raw payloads and absolute paths never reach the UI. */
export function formatGraphInspectorDetails(hit: GraphHit, limit = 8): GraphInspectorDetail[] {
  const rank = new Map<string, number>(PRIORITY.map((key, index) => [key, index]))
  return Object.entries(hit.data)
    .filter(([key]) => safeField(key) && rank.has(key))
    .map(([key, value]) => ({ key, label: LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2"), value: safeValue(value) }))
    .filter((detail): detail is GraphInspectorDetail => detail.value !== undefined)
    .sort((left, right) => rank.get(left.key)! - rank.get(right.key)! || left.key.localeCompare(right.key))
    .slice(0, Math.max(0, limit))
}

export function formatGraphSummaryMetrics(scene: GraphScene, limit = 6): GraphInspectorDetail[] {
  return Object.entries(scene.summary.metrics)
    .filter(([key]) => safeField(key))
    .map(([key, value]) => ({ key, label: key.replace(/([a-z])([A-Z])/g, "$1 $2"), value: safeValue(value) }))
    .filter((detail): detail is GraphInspectorDetail => detail.value !== undefined)
    .slice(0, Math.max(0, limit))
}

export function graphInspectorStatus(scene: GraphScene, hit?: GraphHit) {
  const status = hit?.data.status
  if (typeof status === "string" && status.trim()) return status.trim().toUpperCase()
  if (hit) return hit.kind.toUpperCase()
  return scene.mode.toUpperCase()
}

export function GraphInspector(props: { scene: GraphScene; hit?: GraphHit; compact?: boolean }) {
  const { theme } = useTheme()
  const details = () => props.hit
    ? formatGraphInspectorDetails(props.hit, props.compact ? 4 : 7)
    : formatGraphSummaryMetrics(props.scene, props.compact ? 4 : 6)
  const status = () => graphInspectorStatus(props.scene, props.hit)
  const statusColor = () => {
    if (status() === "ERROR") return theme.error
    if (status() === "RUNNING") return theme.warning
    if (status() === "COMPLETED") return theme.success
    return theme.primary
  }
  const title = () => props.hit?.label ?? props.scene.summary.title

  return (
    <Show
      when={props.compact}
      fallback={
        <box width={30} minWidth={24} flexDirection="column" paddingX={1} paddingY={1} backgroundColor={theme.backgroundElement}>
          <text fg={statusColor()} wrapMode="none" overflow="hidden">{status()}</text>
          <text fg={theme.text} wrapMode="none" overflow="hidden">{title()}</text>
          <box height={1} />
          <For each={details()}>
            {(detail) => (
              <box flexDirection="row" justifyContent="space-between" gap={1}>
                <text fg={theme.textMuted} wrapMode="none">{detail.label}</text>
                <text fg={theme.text} wrapMode="none" overflow="hidden">{detail.value}</text>
              </box>
            )}
          </For>
          <Show when={!props.hit && props.scene.summary.coverage}>
            <text fg={theme.textMuted} wrapMode="word">{props.scene.summary.coverage}</text>
          </Show>
        </box>
      }
    >
      <box width="100%" flexDirection="column" paddingX={1}>
        <text fg={theme.text} wrapMode="none" overflow="hidden">
          <span style={{ fg: statusColor(), bold: true }}>{status()}</span> · {title()}
        </text>
        <Show when={details().length > 0}>
          <text fg={theme.textMuted} wrapMode="none" overflow="hidden">
            {details().map((detail) => `${detail.label} ${detail.value}`).join(" · ")}
          </text>
        </Show>
      </box>
    </Show>
  )
}
