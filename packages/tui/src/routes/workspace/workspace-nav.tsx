import { createResource, createSignal, For, onCleanup, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useRoute } from "../../context/route"
import { usePromptRef } from "../../context/prompt"
import { WORKSPACE_PANES, type WorkspacePane } from "../../workspace/pane"
import { SplitBorder } from "../../ui/border"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { OPENCODE_BASE_MODE, useBindings } from "../../keymap"
import { setupStatusLabel, setupStatusThemeKey } from "../../spinosa/status-labels"
import { truncatePathTail } from "../../spinosa/truncate-path"
import {
  getCorpusSummary,
  getRoutesSnapshot,
  readBundledFrameworkVersion,
  workspaceNeedsFrameworkUpdate,
  writeWorkspaceFrameworkVersion,
} from "../../spinosa/service"
import { runUpdate } from "../../spinosa/cli-bridge"

type UpdateState = "idle" | "running" | "done"

export function WorkspaceNav(props: { pane: WorkspacePane; onPane: (pane: WorkspacePane) => void }) {
  const { theme } = useTheme()
  const { navigate } = useRoute()
  const promptRef = usePromptRef()
  const spinosa = useSpinosaWorkspace()
  const [updateState, setUpdateState] = createSignal<UpdateState>("idle")
  const [updateLabel, setUpdateLabel] = createSignal("")
  let resetTimer: ReturnType<typeof setTimeout> | undefined
  const [bundledVersion] = createResource(
    () => (spinosa.meta && !spinosa.genericMode ? "bundled" : undefined),
    () => readBundledFrameworkVersion(),
  )

  const [statusData] = createResource(
    () =>
      spinosa.activePath && !spinosa.genericMode
        ? `${spinosa.activePath}:${spinosa.meta?.setupStatus ?? ""}:${spinosa.lastSessionId() ?? ""}`
        : undefined,
    async (key) => {
      const workspacePath = key.split(":")[0]!
      const [corpus, routes] = await Promise.all([
        getCorpusSummary(workspacePath),
        getRoutesSnapshot(workspacePath, spinosa.lastSessionId()),
      ])
      return { corpus, routes }
    },
  )

  const newQuestion = () => {
    navigate({
      type: "workspace",
      pane: "chat",
      prompt: { input: "", parts: [] },
    })
  }

  const addFiles = () => {
    navigate({ type: "onboarding", mode: "add" })
  }

  const statusColor = () => {
    const status = spinosa.meta?.setupStatus
    if (!status) return theme.textMuted
    const key = setupStatusThemeKey(status)
    return theme[key]
  }

  const needsWorkspaceUpdate = () =>
    workspaceNeedsFrameworkUpdate(spinosa.meta?.frameworkVersion, bundledVersion())

  const doUpdate = async () => {
    if (updateState() !== "idle") return
    setUpdateState("running")
    setUpdateLabel("Starting…")
    const path = spinosa.activePath
    if (!path) {
      setUpdateState("done")
      setUpdateLabel("No workspace")
      scheduleReset(2000)
      return
    }
    const result = await runUpdate(path, {
      onStdout: (chunk) => {
        const line = chunk.trim()
        if (!line) return
        const brief = line.replace(/^[#>\s]+/, "").slice(0, 14)
        setUpdateLabel(brief)
      },
      onStderr: (chunk) => {
        const line = chunk.trim()
        if (line) setUpdateLabel(line.slice(0, 14))
      },
    })
    if (result.exitCode === 0) {
      const version = bundledVersion() ?? (await readBundledFrameworkVersion())
      if (version) {
        await writeWorkspaceFrameworkVersion(path, version)
      }
      spinosa.refresh()
      setUpdateState("idle")
      setUpdateLabel("")
    } else {
      setUpdateState("done")
      setUpdateLabel("✗ Failed")
      scheduleReset(3000)
    }
  }

  const scheduleReset = (delayMs: number) => {
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      resetTimer = undefined
      setUpdateState("idle")
      setUpdateLabel("")
    }, delayMs)
  }

  onCleanup(() => {
    if (resetTimer) clearTimeout(resetTimer)
  })

  useBindings(() => ({
    mode: OPENCODE_BASE_MODE,
    enabled: () => props.pane !== "chat" || !promptRef.current?.focused,
    bindings: [
      { key: "1", desc: "Open Chat pane", group: "Workspace", cmd: () => props.onPane("chat") },
      { key: "2", desc: "Open Corpus pane", group: "Workspace", cmd: () => props.onPane("corpus") },
      { key: "3", desc: "Open Routes pane", group: "Workspace", cmd: () => props.onPane("routes") },
      { key: "4", desc: "Open Settings pane", group: "Workspace", cmd: () => props.onPane("settings") },
      ...(spinosa.meta && !spinosa.genericMode
        ? [
            { key: "n", desc: "Start a new question", group: "Workspace", cmd: () => newQuestion() },
            { key: "a", desc: "Open add-files flow", group: "Workspace", cmd: () => addFiles() },
            { key: "w", desc: "Open workspace picker", group: "Workspace", cmd: () => spinosa.showPicker() },
          ]
        : []),
    ],
  }))

  return (
    <box
      flexShrink={0}
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
      border={["bottom"]}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={theme.border}
    >
      <Show when={spinosa.meta && !spinosa.genericMode ? spinosa.meta : undefined}>
        {(meta) => (
          <box paddingLeft={2} paddingRight={2} paddingTop={1} flexDirection="row" gap={2}>
            <text fg={theme.text}>
              <span style={{ bold: true }}>{meta().projectName}</span>
            </text>
            <text fg={statusColor()}>
              {setupStatusLabel(meta().setupStatus)}
            </text>
            <text fg={theme.textMuted}>{truncatePathTail(meta().path)}</text>
            <text fg={theme.textMuted}>v{meta().frameworkVersion}</text>
          </box>
        )}
      </Show>
      <Show when={spinosa.genericMode}>
        <box paddingLeft={2} paddingRight={2} paddingTop={1} flexDirection="row" gap={2}>
          <text fg={theme.textMuted}>Coding agent only — no Spinosa corpus</text>
          <box flexGrow={1} />
          <box onMouseUp={() => spinosa.showPicker()}>
            <text fg={theme.primary}>Switch workspace</text>
          </box>
        </box>
      </Show>
      <box flexDirection="row" gap={1} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={0}>
        <For each={WORKSPACE_PANES}>
          {(item) => {
            const active = () => props.pane === item.pane
            return (
              <box
                paddingLeft={2}
                paddingRight={2}
                paddingTop={0}
                paddingBottom={0}
                backgroundColor={active() ? theme.backgroundElement : theme.background}
                border={active() ? ["bottom"] : []}
                borderColor={theme.primary}
                onMouseUp={() => props.onPane(item.pane)}
              >
                <text fg={active() ? theme.primary : theme.textMuted}>
                  <span style={{ bold: active() }}>
                    [{item.hint}] {item.title}
                  </span>
                </text>
              </box>
            )
          }}
        </For>
        <box flexGrow={1} />
        <Show when={spinosa.meta && !spinosa.genericMode}>
          <box paddingLeft={1} paddingRight={1} onMouseUp={newQuestion}>
            <text fg={theme.textMuted}>New question</text>
          </box>
          <box paddingLeft={1} paddingRight={1} onMouseUp={addFiles}>
            <text fg={theme.textMuted}>Add files</text>
          </box>
        </Show>
        <box paddingLeft={1} paddingRight={1} onMouseUp={() => spinosa.showPicker()}>
          <text fg={theme.textMuted}>Switch workspace</text>
        </box>
      </box>
      <Show when={spinosa.meta && !spinosa.genericMode && statusData()}>
        {(data) => (
          <box paddingLeft={2} paddingRight={2} paddingBottom={0} paddingTop={0} flexDirection="row" gap={1}>
            <text fg={theme.textMuted}>
              <Show when={spinosa.meta?.setupStatus === "cli_started"}>
                Indexing: {data().corpus.index.extractionProgress.read ?? 0}/
                {data().corpus.index.extractionProgress.total ?? "?"} read
                {" · "}
              </Show>
              <Show when={data().routes.activeGoal}>
                {(goal) => <>Active: {goal().filename}</>}
              </Show>
              <Show when={!data().routes.activeGoal && data().routes.reports[0]}>
                {(report) => <>Latest report: {report().filename}</>}
              </Show>
            </text>
            <box flexGrow={1} />
            <Show when={updateState() === "running" || needsWorkspaceUpdate()}>
              <box
                paddingLeft={1}
                paddingRight={1}
                onMouseUp={updateState() === "idle" ? doUpdate : undefined}
              >
                <text
                  fg={
                    updateState() === "running"
                      ? theme.primary
                      : updateState() === "done"
                        ? theme.success
                        : theme.textMuted
                  }
                >
                  {updateState() === "idle" ? "Update" : updateLabel()}
                </text>
              </box>
            </Show>
          </box>
        )}
      </Show>
      <box paddingLeft={2} paddingRight={2} paddingBottom={1} paddingTop={0}>
        <text fg={theme.textMuted}>
          1–4 panes
          <Show when={spinosa.meta && !spinosa.genericMode}> · n new question · a add files · w switch workspace</Show>
        </text>
      </box>
    </box>
  )
}
