import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { useTheme } from "../../context/theme"
import { useRoute } from "../../context/route"
import { Logo } from "../../component/logo"
import { usePluginRuntime } from "../../plugin/runtime"
import { OPENCODE_BASE_MODE, useOpencodeKeymap, useOpencodeModeStack } from "../../keymap"
import { Toast } from "../../ui/toast"
import { CenteredColumn } from "../../component/centered-column"
import { MAIN_CONTENT_MAX_WIDTH } from "../../util/layout"
import {
  listRegisteredWorkspaces,
  isSpinosaWorkspace,
  readBundledFrameworkVersion,
  readWorkspaceMeta,
  countRawMarkdownFiles,
  unregisterWorkspace,
  workspaceNeedsFrameworkUpdate,
  writeWorkspaceFrameworkVersion,
} from "../../spinosa/service"
import { runUpdate } from "../../spinosa/cli-bridge"
import { setupStatusLabel } from "../../spinosa/status-labels"
import type { SpinosaSetupStatus } from "../../spinosa/types"
import { truncatePathTail } from "../../spinosa/truncate-path"
import { fixtureWorkspacePath } from "../../spinosa/verify"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { useTuiPaths } from "../../context/runtime"
import { getWorkspaceLaunchDecision } from "../../spinosa/workspace-launch"
import { resolveWorkspaceDisplayName } from "../../spinosa/workspace-name"

type PickerStep = "home" | "select" | "manager"

type HomeOption = {
  id: string
  title: string
  description: string
  hint: string
  run: () => void | Promise<void>
}

type WorkspaceRow = {
  path: string
  name: string
  status: SpinosaSetupStatus
  version: string
  fileCount: number
}

type ManagerActionID = "update-all" | "open" | "update" | "delete"

const MANAGER_VISIBLE_ROWS = 8
const MANAGER_ALL_ID = "__all__"

function workspaceCategoryLabel(status: SpinosaSetupStatus) {
  switch (status) {
    case "workspace_started":
      return "ready"
    case "cli_started":
      return "index"
    case "not_started":
      return "setup"
    default:
      return "unknown"
  }
}

export function WorkspacePicker() {
  const { theme } = useTheme()
  const { navigate } = useRoute()
  const pluginRuntime = usePluginRuntime()
  const keymap = useOpencodeKeymap()
  const modeStack = useOpencodeModeStack()
  const spinosa = useSpinosaWorkspace()
  const paths = useTuiPaths()

  const [step, setStep] = createSignal<PickerStep>("home")
  const [selected, setSelected] = createSignal(0)

  const [startupPath, setStartupPath] = createSignal<string | undefined>()
  const [startupName, setStartupName] = createSignal("")
  const [startupPrompt, setStartupPrompt] = createSignal("")
  const [startupSelected, setStartupSelected] = createSignal(0)
  const [managerFocus, setManagerFocus] = createSignal<"actions" | "rows">("rows")
  const [managerAction, setManagerAction] = createSignal(0)

  const [deleting, setDeleting] = createSignal<string | undefined>()
  const [updating, setUpdating] = createSignal<string | undefined>()
  const [updateLabel, setUpdateLabel] = createSignal("")
  let statusResetTimer: ReturnType<typeof setTimeout> | undefined

  const [registered] = createResource(() => listRegisteredWorkspaces())
  const [bundledVersion] = createResource(() => (step() === "manager" ? "bundled" : undefined), () => readBundledFrameworkVersion())

  const [managerRows, { refetch: refetchManager }] = createResource<WorkspaceRow[], string>(
    () => (step() === "manager" ? "manager-load" : undefined),
    async () => {
      const workspaces = await listRegisteredWorkspaces()
      const rows: WorkspaceRow[] = []
      for (const ws of workspaces) {
        const meta = await readWorkspaceMeta(ws.path)
        const fileCount = await countRawMarkdownFiles(join(ws.path, "raw"))
        rows.push({
          path: ws.path,
          name: resolveWorkspaceDisplayName(ws.path, meta?.projectName ?? ws.projectName),
          status: meta?.setupStatus || "unknown",
          version: meta?.frameworkVersion || "unknown",
          fileCount,
        })
      }
      return rows
    },
  )

  const goStep = (s: PickerStep) => {
    setStep(s)
    setSelected(0)
    setManagerFocus("rows")
    setManagerAction(0)
    setStartupPath(undefined)
  }

  const selectOptions = () => {
    const items: HomeOption[] = []
    let hint = 1

    const add = (id: string, title: string, description: string, run: HomeOption["run"]) => {
      items.push({ id, title, description, hint: String(hint), run })
      hint++
    }

    if (isSpinosaWorkspace(paths.cwd)) {
      add("cwd", "Current directory", paths.cwd, () => pickWorkspace(paths.cwd))
    }

    const fixture = fixtureWorkspacePath()
    if (isSpinosaWorkspace(fixture)) {
      add("fixture", "Fixture workspace (verify)", fixture, () => pickWorkspace(fixture))
    }

    for (const workspace of registered() ?? []) {
      add(workspace.path, resolveWorkspaceDisplayName(workspace.path, workspace.projectName), workspace.path, () =>
        pickWorkspace(workspace.path),
      )
    }

    add("generic", "OpenCode only", "Use OpenCode without a Spinosa workspace", () => spinosa.useGenericMode())

    return items
  }

  const pickWorkspace = async (workspacePath: string) => {
    const launch = await getWorkspaceLaunchDecision(workspacePath)
    if (launch.type === "open") {
      await spinosa.openWorkspace(workspacePath)
      return
    }
    setStep("select")
    setStartupPath(launch.workspacePath)
    setStartupName(launch.workspaceName)
    setStartupPrompt(launch.prompt)
    setStartupSelected(0)
  }

  const launchStartupInChat = async () => {
    const path = startupPath()
    if (!path) return
    await spinosa.openWorkspace(path)
    navigate({
      type: "workspace",
      pane: "chat",
      prompt: { input: startupPrompt(), parts: [], autoSubmit: true },
    })
  }

  const openChatDirectly = async () => {
    const path = startupPath()
    if (!path) return
    await spinosa.openWorkspace(path)
    navigate({ type: "workspace", pane: "chat" })
  }

  const deleteWorkspace = async (wsPath: string) => {
    if (deleting()) return
    setDeleting(wsPath)
    try {
      const spinosaDir = join(wsPath, ".spinosa")
      rmSync(spinosaDir, { recursive: true, force: true })
      await unregisterWorkspace(wsPath)
    } finally {
      setDeleting(undefined)
      refetchManager()
    }
  }

  const updateWorkspace = async (wsPath: string) => {
    if (updating()) return
    setUpdating(wsPath)
    setUpdateLabel("Starting…")
    try {
      const result = await runUpdate(wsPath, {
        onStdout: (chunk) => {
          const line = chunk.trim()
          if (line) setUpdateLabel(line.slice(0, 18))
        },
        onStderr: (chunk) => {
          const line = chunk.trim()
          if (line) setUpdateLabel(line.slice(0, 18))
        },
      })
      if (result.exitCode === 0) {
        const version = bundledVersion() ?? (await readBundledFrameworkVersion())
        if (version) {
          await writeWorkspaceFrameworkVersion(wsPath, version)
        }
      }
      setUpdateLabel(result.exitCode === 0 ? "✔ Done" : "✗ Failed")
    } catch {
      setUpdateLabel("✗ Failed")
    }
    scheduleStatusReset(2000)
  }

  const updateAllWorkspaces = async () => {
    const rows = (managerRows() ?? []).filter((row) => workspaceNeedsFrameworkUpdate(row.version, bundledVersion()))
    if (updating() || rows.length === 0) return
    setUpdating(MANAGER_ALL_ID)
    try {
      let failures = 0
      for (const [index, row] of rows.entries()) {
        const prefix = `${index + 1}/${rows.length} ${row.name}`
        const result = await runUpdate(row.path, {
          onStdout: (chunk) => {
            const line = chunk.trim()
            if (line) setUpdateLabel(`${prefix} · ${line.slice(0, 18)}`)
          },
          onStderr: (chunk) => {
            const line = chunk.trim()
            if (line) setUpdateLabel(`${prefix} · ${line.slice(0, 18)}`)
          },
        })
        if (result.exitCode === 0) {
          const version = bundledVersion() ?? (await readBundledFrameworkVersion())
          if (version) {
            await writeWorkspaceFrameworkVersion(row.path, version)
          }
        } else {
          failures++
        }
      }
      setUpdateLabel(failures === 0 ? "✔ All done" : `✗ ${failures} failed`)
    } catch {
      setUpdateLabel("✗ Batch failed")
    }
    scheduleStatusReset(3000)
  }

  const scheduleStatusReset = (delayMs: number) => {
    if (statusResetTimer) clearTimeout(statusResetTimer)
    statusResetTimer = setTimeout(() => {
      statusResetTimer = undefined
      setUpdating(undefined)
      setUpdateLabel("")
      refetchManager()
    }, delayMs)
  }

  const managerRowsValue = createMemo(() => managerRows() ?? [])
  const selectedManagerRow = createMemo(() => managerRowsValue()[selected()])
  const managerSummary = createMemo(() => {
    const rows = managerRowsValue()
    return {
      total: rows.length,
      ready: rows.filter((row) => row.status === "workspace_started").length,
      index: rows.filter((row) => row.status === "cli_started").length,
      setup: rows.filter((row) => row.status === "not_started").length,
      unknown: rows.filter((row) => row.status === "unknown").length,
    }
  })
  const managerWindowStart = createMemo(() => {
    const rows = managerRowsValue()
    const maxStart = Math.max(0, rows.length - MANAGER_VISIBLE_ROWS)
    return Math.max(0, Math.min(selected() - Math.floor(MANAGER_VISIBLE_ROWS / 2), maxStart))
  })
  const visibleManagerRows = createMemo(() =>
    managerRowsValue()
      .slice(managerWindowStart(), managerWindowStart() + MANAGER_VISIBLE_ROWS)
      .map((row, offset) => ({ row, index: managerWindowStart() + offset })),
  )
  const selectedManagerRowNeedsUpdate = createMemo(() =>
    workspaceNeedsFrameworkUpdate(selectedManagerRow()?.version, bundledVersion()),
  )
  const outdatedManagerCount = createMemo(() =>
    managerRowsValue().filter((row) => workspaceNeedsFrameworkUpdate(row.version, bundledVersion())).length,
  )
  const managerActions = createMemo<
    { id: ManagerActionID; label: string; disabled: boolean; run: () => void | Promise<void> }[]
  >(() => [
    {
      id: "update-all",
      label: updating() === MANAGER_ALL_ID ? updateLabel() || "Updating…" : "Update all outdated",
      disabled: outdatedManagerCount() === 0 || Boolean(updating()) || Boolean(deleting()),
      run: () => void updateAllWorkspaces(),
    },
    {
      id: "open",
      label: "Open selected",
      disabled: !selectedManagerRow() || Boolean(updating()) || Boolean(deleting()),
      run: () => {
        const row = selectedManagerRow()
        if (!row) return
        void pickWorkspace(row.path)
      },
    },
    {
      id: "update",
      label:
        updating() && updating() !== MANAGER_ALL_ID
          ? selectedManagerRow()?.path === updating()
            ? updateLabel() || "Updating…"
            : "Update selected"
          : "Update selected",
      disabled: !selectedManagerRow() || !selectedManagerRowNeedsUpdate() || Boolean(updating()) || Boolean(deleting()),
      run: () => {
        const row = selectedManagerRow()
        if (!row) return
        void updateWorkspace(row.path)
      },
    },
    {
      id: "delete",
      label:
        deleting() && selectedManagerRow()?.path === deleting()
          ? "Deleting…"
          : "Delete selected",
      disabled: !selectedManagerRow() || Boolean(updating()) || Boolean(deleting()),
      run: () => {
        const row = selectedManagerRow()
        if (!row) return
        void deleteWorkspace(row.path)
      },
    },
  ])

  createEffect(() => {
    if (step() !== "manager") return
    const rows = managerRowsValue()
    if (rows.length === 0) {
      setSelected(0)
      return
    }
    if (selected() >= rows.length) setSelected(rows.length - 1)
  })

  const homeOptions = (): HomeOption[] => [
    {
      id: "new",
      title: "New workspace",
      description: "Create a new Spinosa workspace from a source folder",
      hint: "1",
      run: () => navigate({ type: "onboarding", mode: "new" }),
    },
    {
      id: "select",
      title: "Select workspace",
      description: "Choose an existing workspace to work on",
      hint: "2",
      run: () => goStep("select"),
    },
    {
      id: "manager",
      title: "Workspace manager",
      description: "View, update, or delete registered workspaces",
      hint: "3",
      run: () => goStep("manager"),
    },
  ]

  const runSelected = () => {
    const item = homeOptions()[selected()]
    if (item) void item.run()
  }

  const runSelect = () => {
    const items = selectOptions()
    const item = items[selected()]
    if (item) void item.run()
  }

  onMount(() => {
    const off = keymap.intercept("key", ({ event }) => {
      if (modeStack.current() !== OPENCODE_BASE_MODE) return

      if (step() === "home") {
        const list = homeOptions()
        if (event.name === "up" || event.name === "k") {
          setSelected((v) => Math.max(0, v - 1))
          return true
        }
        if (event.name === "down" || event.name === "j") {
          setSelected((v) => Math.min(list.length - 1, v + 1))
          return true
        }
        if (event.name === "return") {
          runSelected()
          return true
        }
        const index = list.findIndex((item) => item.hint === event.name)
        if (index >= 0) {
          setSelected(index)
          runSelected()
          return true
        }
        return
      }

      if (step() === "select" && startupPath()) {
        if (event.name === "up" || event.name === "k") {
          setStartupSelected((v) => Math.max(0, v - 1))
          return true
        }
        if (event.name === "down" || event.name === "j") {
          setStartupSelected((v) => Math.min(1, v + 1))
          return true
        }
        if (event.name === "return") {
          if (startupSelected() === 0) void launchStartupInChat()
          else void openChatDirectly()
          return true
        }
        if (event.name === "escape") {
          setStartupPath(undefined)
          return true
        }
        return
      }

      if (event.name === "escape") {
        if (step() === "select" || step() === "manager") {
          goStep("home")
          return true
        }
        return
      }

      if (step() === "select") {
        const list = selectOptions()
        if (event.name === "up" || event.name === "k") {
          setSelected((v) => Math.max(0, v - 1))
          return true
        }
        if (event.name === "down" || event.name === "j") {
          setSelected((v) => Math.min(list.length - 1, v + 1))
          return true
        }
        if (event.name === "return") {
          runSelect()
          return true
        }
        const index = list.findIndex((item) => item.hint === event.name)
        if (index >= 0) {
          setSelected(index)
          runSelect()
          return true
        }
      }

      if (step() === "manager") {
        const rows = managerRowsValue()
        const actions = managerActions()
        if (event.name === "left" || event.name === "h") {
          if (managerFocus() === "actions") {
            setManagerAction((value) => Math.max(0, value - 1))
            return true
          }
        }
        if (event.name === "right" || event.name === "l") {
          if (managerFocus() === "actions") {
            setManagerAction((value) => Math.min(actions.length - 1, value + 1))
            return true
          }
        }
        if (event.name === "up" || event.name === "k") {
          if (managerFocus() === "rows") {
            if (selected() === 0) setManagerFocus("actions")
            else setSelected((v) => Math.max(0, v - 1))
            return true
          }
          setManagerAction((value) => Math.max(0, value - 1))
          return true
        }
        if (event.name === "down" || event.name === "j") {
          if (managerFocus() === "actions") {
            if (rows.length > 0) setManagerFocus("rows")
            return true
          }
          setSelected((v) => Math.min(rows.length - 1, v + 1))
          return true
        }
        if (event.name === "a") {
          void updateAllWorkspaces()
          return true
        }
        if (event.name === "u") {
          const row = selectedManagerRow()
          if (row) void updateWorkspace(row.path)
          return true
        }
        if (event.name === "d") {
          const row = selectedManagerRow()
          if (row) void deleteWorkspace(row.path)
          return true
        }
        if (event.name === "return") {
          if (managerFocus() === "actions") {
            const action = actions[managerAction()]
            if (action && !action.disabled) void action.run()
            return true
          }
          const row = selectedManagerRow()
          if (row) void pickWorkspace(row.path)
          return true
        }
      }
    })
    onCleanup(off)
    onCleanup(() => {
      if (statusResetTimer) clearTimeout(statusResetTimer)
    })
  })

  return (
    <CenteredColumn>
      <box flexGrow={1} flexDirection="column" alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box flexShrink={0}>
          <pluginRuntime.Slot name="home_logo" mode="replace">
            <Logo />
          </pluginRuntime.Slot>
        </box>
        <box height={1} />

        <Show when={step() === "home"}>
          <text fg={theme.text}>
            <span style={{ bold: true }}>Spinosa — workspace menu</span>
          </text>
          <box height={1} />
          <box width="100%" maxWidth={MAIN_CONTENT_MAX_WIDTH} flexDirection="column" gap={1} flexShrink={0}>
            <For each={homeOptions()}>
              {(item, index) => (
                <box
                  paddingLeft={2}
                  paddingRight={2}
                  paddingTop={1}
                  paddingBottom={1}
                  backgroundColor={selected() === index() ? theme.backgroundElement : theme.backgroundPanel}
                  border={["left"]}
                  borderColor={selected() === index() ? theme.borderActive : theme.border}
                  onMouseOver={() => setSelected(index())}
                  onMouseUp={() => void item.run()}
                >
                  <text fg={theme.text}>
                    <span style={{ fg: theme.primary, bold: selected() === index() }}>
                      [{item.hint}] {item.title}
                    </span>
                  </text>
                  <text fg={theme.textMuted}>{item.description}</text>
                </box>
              )}
            </For>
          </box>
          <box height={1} />
          <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
            ↑↓ move · enter select · number keys jump
          </text>
        </Show>

        <Show when={step() === "select"}>
          <box flexDirection="row" alignItems="center" gap={1}>
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={theme.backgroundPanel}
              onMouseUp={() => goStep("home")}
            >
              <text fg={theme.text}>←</text>
            </box>
            <text fg={theme.text}>
              <span style={{ bold: true }}>Choose a workspace</span>
            </text>
          </box>
          <box height={1} />

          <Show when={startupPath()}>
            <box
              flexDirection="column"
              gap={1}
              paddingLeft={2}
              paddingRight={2}
              paddingTop={1}
              paddingBottom={1}
              backgroundColor={theme.backgroundPanel}
              border={["left"]}
              borderColor={theme.borderActive}
              maxWidth={MAIN_CONTENT_MAX_WIDTH}
              width="100%"
            >
              <text fg={theme.text}>
                <span style={{ bold: true }}>{startupName()}</span>
              </text>
              <text fg={theme.textMuted}>This workspace hasn't completed startup indexing.</text>
              <box height={1} />
              <box
                paddingLeft={2}
                paddingRight={2}
                paddingTop={1}
                paddingBottom={1}
                backgroundColor={startupSelected() === 0 ? theme.backgroundElement : theme.backgroundPanel}
                border={["left"]}
                borderColor={startupSelected() === 0 ? theme.primary : theme.border}
                onMouseOver={() => setStartupSelected(0)}
                onMouseUp={() => void launchStartupInChat()}
              >
                <text fg={theme.primary}>
                  <span style={{ bold: startupSelected() === 0 }}>Launch startup indexing</span>
                </text>
                <text fg={theme.textMuted}>Begin indexing automatically in Chat</text>
              </box>
              <box
                paddingLeft={2}
                paddingRight={2}
                paddingTop={1}
                paddingBottom={1}
                backgroundColor={startupSelected() === 1 ? theme.backgroundElement : theme.backgroundPanel}
                border={["left"]}
                borderColor={startupSelected() === 1 ? theme.borderActive : theme.border}
                onMouseOver={() => setStartupSelected(1)}
                onMouseUp={() => void openChatDirectly()}
              >
                <text fg={theme.text}>
                  <span style={{ bold: startupSelected() === 1 }}>Open chat directly</span>
                </text>
                <text fg={theme.textMuted}>Skip startup and open the workspace</text>
              </box>
              <box height={1} />
              <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
                ↑↓ move · enter select · esc back
              </text>
            </box>
          </Show>

          <Show when={!startupPath()}>
            <Show when={registered.loading}>
              <text fg={theme.textMuted}>Loading registered workspaces…</text>
            </Show>
            <box width="100%" maxWidth={MAIN_CONTENT_MAX_WIDTH} flexDirection="column" gap={1} flexShrink={0}>
              <For each={selectOptions()}>
                {(item, index) => (
                  <box
                    paddingLeft={2}
                    paddingRight={2}
                    paddingTop={1}
                    paddingBottom={1}
                    backgroundColor={selected() === index() ? theme.backgroundElement : theme.backgroundPanel}
                    border={["left"]}
                    borderColor={selected() === index() ? theme.borderActive : theme.border}
                    onMouseOver={() => setSelected(index())}
                    onMouseUp={() => void item.run()}
                  >
                    <text fg={theme.text}>
                      <span style={{ fg: theme.primary, bold: selected() === index() }}>
                        [{item.hint}] {item.title}
                      </span>
                    </text>
                    <text fg={theme.textMuted}>{item.description}</text>
                  </box>
                )}
              </For>
            </box>
          </Show>

          <box height={1} />
          <Show when={!startupPath()}>
            <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
              ↑↓ move · enter select · number keys jump · esc back
            </text>
          </Show>
        </Show>

        <Show when={step() === "manager"}>
          <box flexDirection="row" alignItems="center" gap={1}>
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={theme.backgroundPanel}
              onMouseUp={() => goStep("home")}
            >
              <text fg={theme.text}>←</text>
            </box>
            <text fg={theme.text}>
              <span style={{ bold: true }}>Workspace manager</span>
            </text>
          </box>
          <box height={1} />

          <Show when={managerRows.loading}>
            <text fg={theme.textMuted}>Loading workspaces…</text>
          </Show>
          <Show when={managerRows()}>
            {(rows) => (
              <box
                width="100%"
                maxWidth={MAIN_CONTENT_MAX_WIDTH}
                flexDirection="column"
                gap={1}
                flexShrink={0}
              >
                <text fg={theme.textMuted}>
                  {managerSummary().total} total · {managerSummary().ready} ready · {managerSummary().index} to index ·{" "}
                  {managerSummary().setup} setup · {managerSummary().unknown} unknown
                </text>

                <box flexDirection="row" gap={1}>
                  <For each={managerActions()}>
                    {(action, index) => {
                      const active = () => managerFocus() === "actions" && managerAction() === index()
                      return (
                        <box
                          paddingLeft={1}
                          paddingRight={1}
                          backgroundColor={active() ? theme.backgroundElement : theme.backgroundPanel}
                          border={["left"]}
                          borderColor={active() ? theme.borderActive : theme.border}
                          onMouseOver={() => {
                            setManagerFocus("actions")
                            setManagerAction(index())
                          }}
                          onMouseUp={() => {
                            if (action.disabled) return
                            setManagerFocus("actions")
                            setManagerAction(index())
                            void action.run()
                          }}
                        >
                          <text fg={action.disabled ? theme.textMuted : active() ? theme.primary : theme.text}>
                            <span style={{ bold: active() }}>{action.label}</span>
                          </text>
                        </box>
                      )
                    }}
                  </For>
                </box>

                <box
                  paddingLeft={1}
                  paddingRight={1}
                  paddingTop={1}
                  paddingBottom={1}
                  backgroundColor={theme.backgroundPanel}
                  flexDirection="column"
                  gap={0}
                >
                  <box flexDirection="row" gap={1}>
                    <text fg={theme.textMuted} width={4}>
                      #
                    </text>
                    <text fg={theme.textMuted} width={24}>
                      Name
                    </text>
                    <text fg={theme.textMuted} width={10}>
                      Category
                    </text>
                    <text fg={theme.textMuted} width={10}>
                      Files
                    </text>
                    <text fg={theme.textMuted} width={8}>
                      Version
                    </text>
                    <text fg={theme.textMuted}>
                      Path
                    </text>
                  </box>

                  <Show when={rows().length === 0}>
                    <text fg={theme.textMuted}>No registered workspaces.</text>
                  </Show>

                  <For each={visibleManagerRows()}>
                    {({ row, index }) => {
                      const active = () => selected() === index
                      return (
                        <box
                          paddingLeft={1}
                          paddingRight={1}
                          backgroundColor={
                            active()
                              ? managerFocus() === "rows"
                                ? theme.backgroundElement
                                : theme.backgroundPanel
                              : index % 2 === 0
                                ? theme.backgroundPanel
                                : "transparent"
                          }
                          border={["left"]}
                          borderColor={active() ? theme.borderActive : theme.border}
                          flexDirection="row"
                          gap={1}
                          onMouseOver={() => {
                            setManagerFocus("rows")
                            setSelected(index)
                          }}
                          onMouseUp={() => {
                            setManagerFocus("rows")
                            setSelected(index)
                          }}
                        >
                          <text fg={theme.textMuted} width={4}>
                            {index + 1}
                          </text>
                          <text fg={theme.text} width={24}>
                            <span style={{ bold: active() }}>{row.name}</span>
                          </text>
                          <text fg={theme.textMuted} width={10}>
                            {workspaceCategoryLabel(row.status)}
                          </text>
                          <text fg={theme.textMuted} width={10}>
                            {row.fileCount} file{row.fileCount === 1 ? "" : "s"}
                          </text>
                          <text fg={theme.textMuted} width={8}>
                            v{row.version}
                          </text>
                          <text fg={theme.textMuted}>
                            {truncatePathTail(row.path)}
                          </text>
                        </box>
                      )
                    }}
                  </For>
                </box>

                <Show when={rows().length > MANAGER_VISIBLE_ROWS}>
                  <text fg={theme.textMuted}>
                    Showing {managerWindowStart() + 1}-
                    {Math.min(managerWindowStart() + MANAGER_VISIBLE_ROWS, rows().length)} of {rows().length}
                  </text>
                </Show>

                <Show when={selectedManagerRow()}>
                  {(row) => (
                    <text fg={theme.textMuted}>
                      Selected: {row().name} · {setupStatusLabel(row().status)} · {truncatePathTail(row().path)}
                    </text>
                  )}
                </Show>
              </box>
            )}
          </Show>

          <box height={1} />
          <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
            ↑↓ rows · ←→ actions · enter open/run · u update · d delete · a update all · esc back
          </text>
        </Show>

        <box height={1} />
        <Toast />
        <box flexGrow={1} minHeight={0} />
      </box>
    </CenteredColumn>
  )
}
