import { createMemo, createSignal, For, onMount, Show } from "solid-js"
import { TextAttributes, type RGBA } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useRoute } from "../../context/route"
import { useDialog } from "../../ui/dialog"
import { useTheme } from "../../context/theme"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { useSDK } from "../../context/sdk"
import { DialogSelect } from "../../ui/dialog-select"
import { buttonBackground, buttonBorder, buttonText } from "../../util/button"
import { listRegisteredWorkspaces, readWorkspaceMeta } from "../../spinosa/service"
import { resolveWorkspaceDisplayName } from "../../spinosa/workspace-name"
import { CenteredColumn } from "../../component/centered-column"
import { MAIN_CONTENT_MAX_WIDTH } from "../../util/layout"
import { errorMessage } from "../../util/error"
import type { SpinosaSetupStatus } from "../../spinosa/types"
import { DialogToolDetail } from "./dialog-tool-detail"

type WorkspaceInfo = {
  path: string
  name: string
  status: SpinosaSetupStatus
}

type ToolCallRecord = {
  id: string
  tool: string
  status: string
  input: Record<string, unknown>
  output?: string
  error?: string
  title?: string
  timeStart: number
  timeEnd?: number
  sessionTitle: string
  part: any
}

export function Visualizer() {
  const { theme } = useTheme()
  const { navigate } = useRoute()
  const dialog = useDialog()
  const spinosa = useSpinosaWorkspace()
  const sdk = useSDK()
  const dimensions = useTerminalDimensions()

  const [selectedWorkspace, setSelectedWorkspace] = createSignal<WorkspaceInfo | undefined>()
  const [selectedSession, setSelectedSession] = createSignal<{ id: string; title: string } | undefined>()
  const [toolCalls, setToolCalls] = createSignal<ToolCallRecord[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [loadError, setLoadError] = createSignal<string | undefined>()
  const [activeFilter, setActiveFilter] = createSignal<string>("__all__")
  const [mode, setMode] = createSignal<"timeline" | "stats">("timeline")

  onMount(async () => {
    const activePath = spinosa.activePath
    if (!activePath || spinosa.genericMode) return
    const meta = await readWorkspaceMeta(activePath).catch(() => undefined)
    if (!meta) return
    setSelectedWorkspace({
      path: activePath,
      name: resolveWorkspaceDisplayName(activePath, meta.projectName ?? ""),
      status: meta.setupStatus,
    })
  })

  const canvasWidth = createMemo(() => Math.min(MAIN_CONTENT_MAX_WIDTH, dimensions().width - 4))
  const CANVAS_HEIGHT = 24

  const uniqueTools = createMemo(() => {
    const calls = toolCalls()
    return [...new Set(calls.map((c) => c.tool))].sort()
  })

  const filteredCalls = createMemo(() => {
    const calls = toolCalls()
    const filter = activeFilter()
    if (filter === "__all__") return calls
    return calls.filter((c) => c.tool === filter)
  })

  const openWorkspacePicker = async () => {
    const list = await listRegisteredWorkspaces()
    const rows: { value: WorkspaceInfo; title: string; description: string }[] = []
    for (const ws of list) {
      const meta = await readWorkspaceMeta(ws.path).catch(() => undefined)
      if (!meta) continue
      rows.push({
        value: { path: ws.path, name: resolveWorkspaceDisplayName(ws.path, meta.projectName ?? ws.projectName), status: meta.setupStatus },
        title: resolveWorkspaceDisplayName(ws.path, meta.projectName ?? ws.projectName),
        description: meta.setupStatus === "workspace_started" ? "Ready" : "Setup needed",
      })
    }
    dialog.replace(() => (
      <DialogSelect
        title="Choose a workspace"
        options={rows}
        onSelect={(option) => {
          setSelectedWorkspace(option.value)
          setSelectedSession(undefined)
          setToolCalls([])
          setLoadError(undefined)
          dialog.clear()
        }}
      />
    ))
  }

  const openSessionPicker = async () => {
    const ws = selectedWorkspace()
    if (!ws) return
    dialog.setSize("large")
    const result = await sdk.client.session.list({ roots: true, limit: 50 }).catch(() => ({ data: undefined }))
    const sessions = (result.data ?? []).filter((s) => s.workspaceID === ws.path || s.directory?.startsWith(ws.path))
    const options = [
      { value: { id: "__all__", title: "All sessions" }, title: "All sessions", description: `Load tool calls from all ${sessions.length} session(s)`, category: "ALL" },
      ...sessions.map((s) => ({
        value: { id: s.id, title: s.title },
        title: s.title,
        description: `Updated ${new Date(s.time.updated).toLocaleDateString()}`,
        category: "Sessions",
      })),
    ]
    if (sessions.length === 0) options.push({ value: { id: "__all__", title: "All sessions" }, title: "(no sessions found)", description: "Create a chat session first", category: "" })
    dialog.replace(() => (
      <DialogSelect
        title="Choose a session"
        options={options}
        onSelect={(option) => {
          setSelectedSession(option.value)
          setToolCalls([])
          setLoadError(undefined)
          dialog.clear()
        }}
      />
    ))
  }

  const loadToolCalls = async () => {
    const ws = selectedWorkspace()
    const sess = selectedSession()
    if (!ws || !sess) return

    setIsLoading(true)
    setLoadError(undefined)
    setToolCalls([])

    try {
      let records: ToolCallRecord[] = []
      const sessionIDs: string[] = []

      if (sess.id === "__all__") {
        const listResult = await sdk.client.session.list({ workspace: ws.path, roots: true, limit: 50 }).catch(() => ({ data: undefined }))
        sessionIDs.push(...((listResult.data ?? []).map((s) => s.id)))
      } else {
        sessionIDs.push(sess.id)
      }

      for (const sid of sessionIDs) {
        const msgResult = await sdk.client.session.messages({ sessionID: sid, limit: 100 }).catch(() => ({ data: undefined }))
        const messages = msgResult.data ?? []
        for (const msg of messages) {
          for (const part of msg.parts ?? []) {
            if (part.type !== "tool") continue
            const state = part.state
            records.push({
              id: part.id,
              tool: part.tool,
              status: state.status,
              input: state.input ?? {},
              output: state.status === "completed" ? (state as any).output : undefined,
              error: state.status === "error" ? (state as any).error : undefined,
              title: (state as any).title,
              timeStart: (state as any).time?.start ?? 0,
              timeEnd: (state as any).time?.end,
              sessionTitle: "",
              part,
            })
          }
        }
      }

      records.sort((a, b) => a.timeStart - b.timeStart)
      setToolCalls(records)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <CenteredColumn>
      <box flexGrow={1} flexDirection="column" alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box width="100%" maxWidth={MAIN_CONTENT_MAX_WIDTH} flexDirection="column" alignItems="center" flexShrink={0}>
          <box flexDirection="row" alignItems="center" width="100%">
            <BackButton onClick={() => navigate({ type: "global" })} />
          </box>
          <box height={1} />

          {/* canvas */}
          <box width={canvasWidth()} height={CANVAS_HEIGHT} backgroundColor={theme.backgroundPanel} overflow="hidden">
            <CanvasContent
              isLoading={isLoading()}
              loadError={loadError()}
              toolCalls={filteredCalls()}
              mode={mode()}
              theme={theme}
              dialog={dialog}
            />
          </box>
          <box height={2} />

          {/* picker buttons */}
          <box flexDirection="row" gap={2} width="100%" justifyContent="center">
            <WorkspaceButton
              label={selectedWorkspace()?.name ?? "Pick workspace"}
              active={!!selectedWorkspace()}
              onClick={openWorkspacePicker}
            />
            <SessionButton
              label={selectedSession()?.title ?? "Pick session"}
              active={!!selectedSession()}
              onClick={openSessionPicker}
              disabled={!selectedWorkspace() || isLoading()}
            />
            <LoadButton
              loading={isLoading()}
              disabled={!selectedSession() || isLoading()}
              onClick={loadToolCalls}
            />
          </box>
          <box height={1} />

          {/* filter chips */}
          <Show when={toolCalls().length > 0}>
            <box flexDirection="row" gap={1} width="100%" justifyContent="center" flexWrap="wrap">
              <FilterChip
                label="All"
                count={toolCalls().length}
                active={activeFilter() === "__all__"}
                onClick={() => setActiveFilter("__all__")}
              />
              <For each={uniqueTools()}>
                {(tool) => (
                  <FilterChip
                    label={tool}
                    count={toolCalls().filter((c) => c.tool === tool).length}
                    active={activeFilter() === tool}
                    onClick={() => setActiveFilter(tool)}
                  />
                )}
              </For>
              <box
                paddingX={1}
                onMouseDown={() => setMode((m) => (m === "timeline" ? "stats" : "timeline"))}
              >
                <text fg={theme.textMuted}>[{mode() === "timeline" ? "Stats" : "Timeline"}]</text>
              </box>
            </box>
          </Show>
        </box>
        <box flexGrow={1} minHeight={0} />
      </box>
    </CenteredColumn>
  )
}

function CanvasContent(props: {
  isLoading: boolean
  loadError: string | undefined
  toolCalls: ToolCallRecord[]
  mode: "timeline" | "stats"
  theme: any
  dialog: any
}) {
  const { theme } = props

  if (props.isLoading) {
    return (
      <box alignItems="center" justifyContent="center" width="100%" height="100%">
        <text fg={theme.textMuted}>Loading tool calls…</text>
      </box>
    )
  }

  if (props.loadError) {
    return (
      <box alignItems="center" justifyContent="center" width="100%" height="100%" flexDirection="column" gap={1}>
        <text fg={theme.error}>Failed to load</text>
        <text fg={theme.textMuted} attributes={TextAttributes.DIM}>{props.loadError}</text>
      </box>
    )
  }

  if (props.toolCalls.length === 0) {
    return (
      <box alignItems="center" justifyContent="center" width="100%" height="100%" flexDirection="column" gap={1}>
        <text fg={theme.textMuted} attributes={TextAttributes.DIM}>Pick a workspace and session, then load</text>
      </box>
    )
  }

  if (props.mode === "stats") {
    return <StatsView toolCalls={props.toolCalls} theme={theme} />
  }

  return <TimelineView toolCalls={props.toolCalls} theme={theme} dialog={props.dialog} />
}

function TimelineView(props: { toolCalls: ToolCallRecord[]; theme: any; dialog: any }) {
  const { theme } = props
  const calls = props.toolCalls

  const maxDuration = createMemo(() => {
    let max = 1
    for (const c of calls) {
      if (c.timeStart && c.timeEnd) {
        max = Math.max(max, c.timeEnd - c.timeStart)
      }
    }
    return max
  })

  return (
    <box flexDirection="column" width="100%">
      <For each={calls}>
        {(call, idx) => {
          const duration = call.timeStart && call.timeEnd ? call.timeEnd - call.timeStart : 0
          const barLen = maxDuration() > 0 ? Math.round((duration / maxDuration()) * 8) : 0
          const dotColor = call.status === "completed" ? theme.success : call.status === "error" ? theme.error : call.status === "running" ? theme.warning : theme.textMuted
          const dotIcon = call.status === "completed" ? "✔" : call.status === "error" ? "✗" : call.status === "running" ? "◌" : "●"
          const isLast = idx() === calls.length - 1
          const conn = isLast ? " └─" : " ├─"

          return (
            <box
              flexDirection="row"
              gap={0}
              paddingLeft={1}
              paddingRight={1}
              onMouseDown={() => props.dialog.replace(() => <DialogToolDetail part={call.part} />)}
            >
              <text fg={theme.border} width={4}>{conn}</text>
              <text fg={dotColor} width={2}>{dotIcon}</text>
              <text fg={theme.text} width={14}>{call.tool}</text>
              <text fg={theme.textMuted} overflow="hidden" wrapMode="none" flexGrow={1}>
                {inputSummary(call.tool, call.input)}
              </text>
              <text fg={dotColor} width={9}>
                {"█".repeat(barLen) + "░".repeat(8 - barLen)}
              </text>
            </box>
          )
        }}
      </For>
    </box>
  )
}

function StatsView(props: { toolCalls: ToolCallRecord[]; theme: any }) {
  const { theme } = props
  const calls = props.toolCalls

  const stats = createMemo(() => {
    const byTool: Record<string, { total: number; completed: number; error: number; running: number }> = {}
    for (const c of calls) {
      if (!byTool[c.tool]) byTool[c.tool] = { total: 0, completed: 0, error: 0, running: 0 }
      byTool[c.tool].total++
      byTool[c.tool][c.status as keyof typeof byTool[string]]++
    }
    return Object.entries(byTool).sort((a, b) => b[1].total - a[1].total)
  })

  const maxCount = createMemo(() => Math.max(...stats().map(([, s]) => s.total), 1))
  const barWidth = 52
  const PARTIAL = ["", "▁", "▂", "▃", "▄", "▅", "▆", "▇"]

  return (
    <box flexDirection="column" width="100%">
      <box paddingLeft={1}>
        <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
          Total: {calls.length}  Err: {calls.filter((c) => c.status === "error").length}  Run: {calls.filter((c) => c.status === "running").length}
        </text>
      </box>
      <box height={1} />

      <For each={stats()}>
        {([tool, s]) => {
          const scaled = (s.total / maxCount()) * barWidth
          const full = Math.floor(scaled)
          const partial = Math.round((scaled - full) * 8)
          const bar = "█".repeat(full) + (partial > 0 ? PARTIAL[partial] : "")
          return (
            <box flexDirection="row" paddingLeft={1} gap={1}>
              <text fg={theme.text} width={12}>{tool}</text>
              <text fg={theme.primary}>{bar.padEnd(barWidth)}</text>
              <text fg={theme.text} width={4}>{String(s.total).padStart(3)}</text>
              <Show when={s.error > 0}>
                <text fg={theme.error}>✕{s.error}</text>
              </Show>
            </box>
          )
        }}
      </For>
    </box>
  )
}

function inputSummary(tool: string, input: Record<string, unknown>): string {
  if (tool === "bash") return `$ ${String(input.command ?? "")}`
  if (tool === "read" || tool === "edit" || tool === "write") return String(input.filePath ?? input.file_path ?? "")
  if (tool === "grep" || tool === "glob") return `"${String(input.pattern ?? "")}"`
  if (tool === "webfetch") return String(input.url ?? "")
  if (tool === "websearch") return String(input.query ?? "")
  if (tool === "task") return String(input.description ?? "").slice(0, 60)
  if (tool === "question") return `Ask ${Array.isArray(input.questions) ? input.questions.length : 0} questions`
  return JSON.stringify(input).slice(0, 60)
}

// ── Button components ──

function WorkspaceButton(props: { label: string; active: boolean; onClick: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const over = () => hover() || props.active
  return (
    <box
      paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}
      backgroundColor={buttonBackground(theme, over())}
      border={["left"]}
      borderColor={buttonBorder(theme, over(), theme.success)}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.onClick}
    >
      <text fg={buttonText(theme, over(), props.active ? theme.success : theme.textMuted)}>
        <span style={{ bold: over() }}>{props.label}</span>
      </text>
    </box>
  )
}

function SessionButton(props: { label: string; active: boolean; onClick: () => void; disabled: boolean }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const over = () => hover() || props.active
  return (
    <box
      paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}
      backgroundColor={props.disabled ? undefined : buttonBackground(theme, over())}
      border={["left"]}
      borderColor={props.disabled ? theme.border : buttonBorder(theme, over(), theme.warning)}
      onMouseOver={() => !props.disabled && setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.disabled ? undefined : props.onClick}
    >
      <text fg={props.disabled ? theme.textMuted : buttonText(theme, over(), props.active ? theme.warning : theme.textMuted)}>
        <span style={{ bold: over() }}>{props.label}</span>
      </text>
    </box>
  )
}

function LoadButton(props: { loading: boolean; disabled: boolean; onClick: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  return (
    <box
      paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}
      backgroundColor={props.disabled ? undefined : buttonBackground(theme, hover())}
      border={["left"]}
      borderColor={props.disabled ? theme.border : buttonBorder(theme, hover(), theme.primary)}
      onMouseOver={() => !props.disabled && setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.disabled ? undefined : props.onClick}
    >
      <text fg={props.disabled ? theme.textMuted : buttonText(theme, hover(), theme.primary)}>
        <span style={{ bold: hover() }}>{props.loading ? "Loading…" : "Load"}</span>
      </text>
    </box>
  )
}

function FilterChip(props: { label: string; count?: number; active: boolean; onClick: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const over = () => hover() || props.active
  return (
    <box
      paddingX={1}
      backgroundColor={buttonBackground(theme, over())}
      border={["left"]}
      borderColor={buttonBorder(theme, over(), theme.primary)}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.onClick}
    >
      <text fg={buttonText(theme, over(), props.active ? theme.primary : theme.textMuted)}>
        <span style={{ bold: props.active }}>{props.label}{props.count !== undefined ? ` (${props.count})` : ""}</span>
      </text>
    </box>
  )
}

function BackButton(props: { onClick: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  return (
    <box
      paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}
      backgroundColor={buttonBackground(theme, hover())}
      border={["left"]}
      borderColor={buttonBorder(theme, hover(), theme.borderActive)}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.onClick}
    >
      <text fg={buttonText(theme, hover(), theme.text)}>
        <span style={{ bold: hover() }}>← Back</span>
      </text>
    </box>
  )
}
