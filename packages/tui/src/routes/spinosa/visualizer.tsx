import { createMemo, createSignal, For, onMount, Show } from "solid-js"
import type { RGBA } from "@opentui/core"
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
import { errorMessage } from "../../util/error"
import type { SpinosaSetupStatus } from "../../spinosa/types"
import type { ToolCallRecord, VisualizerMode } from "./visualizer-types"
import { Viewport, VisualizerCanvas } from "./visualizer-viewport"
import { toolCalloutColor } from "./visualizer-utils"
import { TimelineView } from "./visualizer-timeline"
import { TypesView } from "./visualizer-types-view"
import { SessionsView } from "./visualizer-sessions"

type WorkspaceInfo = {
  path: string
  name: string
  status: SpinosaSetupStatus
}

const CANVAS_MAX_WIDTH = 92
const CANVAS_HEIGHT = 28

export function Visualizer() {
  const { theme } = useTheme()
  const route = useRoute()
  const { navigate } = route
  const dialog = useDialog()
  const spinosa = useSpinosaWorkspace()
  const sdk = useSDK()

  const [selectedWorkspace, setSelectedWorkspace] = createSignal<WorkspaceInfo | undefined>()
  const [selectedSession, setSelectedSession] = createSignal<{ id: string; title: string } | undefined>()
  const [toolCalls, setToolCalls] = createSignal<ToolCallRecord[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [loadedOnce, setLoadedOnce] = createSignal(false)
  const [loadError, setLoadError] = createSignal<string | undefined>()
  const [activeFilter, setActiveFilter] = createSignal<string>("__all__")
  const [mode, setMode] = createSignal<VisualizerMode>("timeline")

  onMount(async () => {
    const initial = route.data.type === "visualizer" ? route.data : undefined
    const workspacePath = initial?.workspacePath ?? (spinosa.genericMode ? undefined : spinosa.activePath)
    if (!workspacePath) return
    const meta = await readWorkspaceMeta(workspacePath).catch(() => undefined)
    if (!meta) return
    setSelectedWorkspace({
      path: workspacePath,
      name: resolveWorkspaceDisplayName(workspacePath, meta.projectName ?? ""),
      status: meta.setupStatus,
    })
    const sessionsResult = await sdk.client.session.list({ roots: true, limit: 5, directory: workspacePath }).catch(() => ({ data: undefined }))
    const sessions = sessionsResult.data ?? []
    const requested = initial?.sessionID
    const initialSession = requested
      ? sessions.find((session) => session.id === requested) ?? { id: requested, title: requested }
      : undefined
    if (initialSession) {
      setSelectedSession({ id: initialSession.id, title: initialSession.title })
      await loadToolCallsForSession(initialSession.id)
    } else if (sessions.length > 0) {
      sessions.sort((a, b) => b.time.updated - a.time.updated)
      const latest = sessions[0]
      setSelectedSession({ id: latest.id, title: latest.title })
      await loadToolCallsForSession(latest.id)
    }
  })

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

  const modes: VisualizerMode[] = ["timeline", "types", "sessions"]

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
          setLoadedOnce(false)
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
    const result = await sdk.client.session.list({ roots: true, limit: 50, directory: ws.path }).catch(() => ({ data: undefined }))
    const sessions = result.data ?? []
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
          setLoadedOnce(false)
          setLoadError(undefined)
          dialog.clear()
          void loadToolCalls(option.value)
        }}
      />
    ))
  }

  const loadToolCallsForSession = async (sessionID: string) => {
    setIsLoading(true)
    setLoadError(undefined)
    setToolCalls([])
    try {
      const records: ToolCallRecord[] = []
      const msgResult = await sdk.client.session.messages({ sessionID, limit: 100 }).catch(() => ({ data: undefined }))
      for (const msg of msgResult.data ?? []) {
        for (const part of msg.parts ?? []) {
          if (part.type !== "tool") continue
          const state = part.state
          records.push({
            id: part.id, tool: part.tool, status: state.status,
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
      records.sort((a, b) => a.timeStart - b.timeStart)
      setToolCalls(records)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
      setLoadedOnce(true)
    }
  }

  const loadToolCalls = async (session = selectedSession()) => {
    const ws = selectedWorkspace()
    if (!ws || !session) return

    if (session.id === "__all__") {
      setIsLoading(true)
      setLoadError(undefined)
      setToolCalls([])
      try {
        const listResult = await sdk.client.session.list({ directory: ws.path, roots: true, limit: 50 }).catch(() => ({ data: undefined }))
        let allRecords: ToolCallRecord[] = []
        for (const s of listResult.data ?? []) {
          const msgResult = await sdk.client.session.messages({ sessionID: s.id, limit: 100 }).catch(() => ({ data: undefined }))
          for (const msg of msgResult.data ?? []) {
            for (const part of msg.parts ?? []) {
              if (part.type !== "tool") continue
              const state = part.state
              allRecords.push({
                id: part.id, tool: part.tool, status: state.status,
                input: state.input ?? {},
                output: state.status === "completed" ? (state as any).output : undefined,
                error: state.status === "error" ? (state as any).error : undefined,
                title: (state as any).title,
                timeStart: (state as any).time?.start ?? 0,
                timeEnd: (state as any).time?.end,
                sessionTitle: s.title,
                part,
              })
            }
          }
        }
        allRecords.sort((a, b) => a.timeStart - b.timeStart)
        setToolCalls(allRecords)
      } catch (err) {
        setLoadError(errorMessage(err))
      } finally {
        setIsLoading(false)
        setLoadedOnce(true)
      }
      return
    }

    await loadToolCallsForSession(session.id)
  }

  return (
    <CenteredColumn maxWidth={CANVAS_MAX_WIDTH}>
      <box flexGrow={1} flexDirection="column" alignItems="center" paddingLeft={0} paddingRight={0}>
        <box flexGrow={1} minHeight={0} />
        <box width="100%" flexDirection="column" alignItems="center" flexShrink={0}>
          {/* Canvas actions */}
          <box flexDirection="row" alignItems="center" justifyContent="space-between" width="100%">
            <BackButton onClick={() => navigate({ type: "global" })} />
            <LoadButton
              loading={isLoading()}
              disabled={!selectedSession() || isLoading()}
              onClick={loadToolCalls}
            />
          </box>
          <box height={1} />

          {/* canvas */}
          <VisualizerCanvas height={CANVAS_HEIGHT}>
            <Viewport
              mode={mode()}
              toolCalls={filteredCalls()}
              loading={isLoading()}
              loadedOnce={loadedOnce()}
              error={loadError()}
            >
              <Show when={mode() === "timeline"}><TimelineView toolCalls={filteredCalls()} theme={theme} dialog={dialog} workdir={selectedWorkspace()?.path} /></Show>
              <Show when={mode() === "types"}><TypesView toolCalls={filteredCalls()} theme={theme} dialog={dialog} /></Show>
              <Show when={mode() === "sessions"}><SessionsView toolCalls={filteredCalls()} theme={theme} dialog={dialog} /></Show>
            </Viewport>
          </VisualizerCanvas>
          <box height={1} />

          {/* Data source selectors */}
          <box flexDirection="row" alignItems="center" width="100%" gap={1}>
            <WorkspaceButton
              label={`Workspace: ${selectedWorkspace()?.name ?? "Pick workspace"}`}
              active={!!selectedWorkspace()}
              onClick={openWorkspacePicker}
            />
            <SessionButton
              label={`Session: ${selectedSession()?.title ?? "Pick session"}`}
              active={!!selectedSession()}
              onClick={openSessionPicker}
              disabled={!selectedWorkspace() || isLoading()}
            />
          </box>
          <box height={2} />

          {/* mode tabs */}
          <box flexDirection="row" gap={1} width="100%" justifyContent="flex-start" alignItems="center">
            <text fg={theme.textMuted}>Visualization type:</text>
            <For each={modes}>
              {(m) => (
                <ModeButton
                  label={m.charAt(0).toUpperCase() + m.slice(1)}
                  active={mode() === m}
                  onClick={() => setMode(m)}
                />
              )}
            </For>
          </box>
          <box height={1} />

          {/* filter chips */}
          <Show when={toolCalls().length > 0}>
            <box flexDirection="row" gap={1} width="100%" justifyContent="flex-start" alignItems="center" flexWrap="wrap">
              <text fg={theme.textMuted}>Tools:</text>
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
                    selectedColor={toolCalloutColor(tool, theme)}
                    onClick={() => setActiveFilter(tool)}
                  />
                )}
              </For>
            </box>
          </Show>
        </box>
        <box flexGrow={1} minHeight={0} />
      </box>
    </CenteredColumn>
  )
}

// ── Button components ──

function WorkspaceButton(props: { label: string; active: boolean; onClick: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const over = () => hover() || props.active
  const background = () => hover() ? buttonBackground(theme, true) : props.active ? theme.backgroundElement : buttonBackground(theme, false)
  const foreground = () => hover() ? buttonText(theme, true) : props.active ? theme.success : theme.textMuted
  return (
    <box
      flexGrow={1} minWidth={0}
      paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}
      justifyContent="center" alignItems="center"
      backgroundColor={background()}
      border={["left"]}
      borderColor={hover() ? buttonBorder(theme, true) : props.active ? theme.success : theme.success}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.onClick}
    >
      <text fg={foreground()} overflow="hidden" wrapMode="none">
        <span style={{ bold: over() }}>{props.label}{props.active ? " ▼" : ""}</span>
      </text>
    </box>
  )
}

function SessionButton(props: { label: string; active: boolean; onClick: () => void; disabled: boolean }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const over = () => hover() || props.active
  const background = () => hover() ? buttonBackground(theme, true) : props.active ? theme.backgroundElement : props.disabled ? undefined : buttonBackground(theme, false)
  const foreground = () => hover() ? buttonText(theme, true) : props.active ? theme.success : theme.textMuted
  return (
    <box
      flexGrow={1} minWidth={0}
      paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}
      justifyContent="center" alignItems="center"
      backgroundColor={background()}
      border={["left"]}
      borderColor={hover() ? buttonBorder(theme, true) : props.active ? theme.success : props.disabled ? theme.border : theme.success}
      onMouseOver={() => !props.disabled && setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.disabled ? undefined : props.onClick}
    >
      <text fg={foreground()} overflow="hidden" wrapMode="none">
        <span style={{ bold: over() }}>{props.label}{props.active ? " ▼" : ""}</span>
      </text>
    </box>
  )
}

function LoadButton(props: { loading: boolean; disabled: boolean; onClick: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const label = props.loading ? "⟳ Loading…" : "⟳ Reload"
  return (
    <box
      flexShrink={0}
      paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}
      justifyContent="center" alignItems="center"
      backgroundColor={props.disabled ? undefined : buttonBackground(theme, hover())}
      border={["left"]}
      borderColor={props.disabled ? theme.border : buttonBorder(theme, hover(), theme.primary)}
      onMouseOver={() => !props.disabled && setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.disabled ? undefined : props.onClick}
    >
      <text fg={props.disabled ? theme.textMuted : buttonText(theme, hover(), theme.primary)}>
        <span style={{ bold: hover() }}>{label}</span>
      </text>
    </box>
  )
}

function FilterChip(props: { label: string; count?: number; active: boolean; selectedColor?: RGBA; onClick: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const selectedColor = () => props.selectedColor ?? theme.success
  const background = () => hover() ? buttonBackground(theme, true) : props.active ? theme.backgroundElement : buttonBackground(theme, false)
  const foreground = () => hover() ? buttonText(theme, true) : props.active ? selectedColor() : theme.textMuted
  return (
    <box
      paddingX={1}
      justifyContent="center" alignItems="center"
      backgroundColor={background()}
      border={["left"]}
      borderColor={hover() ? buttonBorder(theme, true) : props.active ? selectedColor() : theme.primary}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.onClick}
    >
      <text fg={foreground()}>
        <span style={{ bold: hover() || props.active }}>{props.label}{props.count !== undefined ? ` (${props.count})` : ""}</span>
      </text>
    </box>
  )
}

function ModeButton(props: { label: string; active: boolean; onClick: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const background = () => hover() ? buttonBackground(theme, true) : props.active ? theme.backgroundElement : buttonBackground(theme, false)
  const foreground = () => hover() ? buttonText(theme, true) : props.active ? theme.success : theme.textMuted
  return (
    <box
      paddingX={1}
      justifyContent="center"
      alignItems="center"
      backgroundColor={background()}
      border={["left"]}
      borderColor={hover() ? buttonBorder(theme, true) : props.active ? theme.success : theme.primary}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={props.onClick}
    >
      <text fg={foreground()}>
        <span style={{ bold: hover() || props.active }}>{props.label}</span>
      </text>
    </box>
  )
}

function BackButton(props: { onClick: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  return (
    <box
      flexShrink={0}
      paddingLeft={0} paddingRight={1} paddingTop={1} paddingBottom={1}
      justifyContent="center" alignItems="center"
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
