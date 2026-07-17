import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { dirname, join } from "node:path"
import { statSync } from "node:fs"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useOpencodeKeymap } from "../keymap"
import {
  listRegisteredWorkspaces,
  readBundledFrameworkVersion,
  readWorkspaceMeta,
  workspaceNeedsFrameworkUpdate,
} from "../spinosa/service"
import { setupStatusLabel } from "../spinosa/status-labels"
import { truncatePathTail } from "../spinosa/truncate-path"
import { useSpinosaWorkspace } from "../context/spinosa-workspace"
import { getWorkspaceLaunchDecision } from "../spinosa/workspace-launch"
import { resolveWorkspaceDisplayName } from "../spinosa/workspace-name"
import { DialogSpinosaStartupChoice } from "./dialog-spinosa-startup-choice"
import { buttonBackground, buttonBorder, buttonText } from "../util/button"
import type { SpinosaSetupStatus } from "../spinosa/types"
import type { SpinosaWorkspacePresence } from "../spinosa-core/types"
import { workspacePresenceLabel } from "../spinosa-core/workspace/presence"

type SortColumn = "name" | "folder" | "status" | "version" | "accessed"
type SortDir = "asc" | "desc"

type SelectWorkspaceRow = {
  path: string
  name: string
  parentFolder: string
  status: SpinosaSetupStatus
  version: string
  needsUpdate: boolean
  lastAccessed: number
  presence?: SpinosaWorkspacePresence
  available: boolean
}

function relativeTime(timestamp: number): string {
  if (timestamp <= 0) return "unknown"
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function getParentFolder(workspacePath: string): string {
  return dirname(workspacePath)
}

function getLastAccessed(workspacePath: string): number {
  try {
    return statSync(join(workspacePath, ".spinosa", "workspace")).mtimeMs
  } catch {
    return 0
  }
}

export function DialogSpinosaWorkspacePicker(props: { onClose?: () => void } = {}) {
  const dialog = useDialog()
  const route = useRoute()
  const spinosa = useSpinosaWorkspace()
  const { theme } = useTheme()
  const keymap = useOpencodeKeymap()

  const [sortColumn, setSortColumn] = createSignal<SortColumn>("name")
  const [sortDir, setSortDir] = createSignal<SortDir>("asc")
  const [selected, setSelected] = createSignal(0)

  const toggleSort = (column: SortColumn) => {
    if (sortColumn() === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDir("asc")
    }
  }

  const [workspaces] = createResource(() => spinosa.bootReady, async (bootReady) => {
    if (!bootReady) return []
    const list = await listRegisteredWorkspaces()
    const bundled = await readBundledFrameworkVersion()
    const pairs = await Promise.all(
      list.map(async (ws) => ({ ws, meta: await readWorkspaceMeta(ws.path) })),
    )
    return pairs.map(({ ws, meta }) => ({
      path: ws.path,
      name: resolveWorkspaceDisplayName(ws.path, meta?.projectName ?? ws.projectName),
      parentFolder: getParentFolder(ws.path),
      status: meta?.setupStatus || "unknown",
      version: meta?.frameworkVersion || "unknown",
      needsUpdate: workspaceNeedsFrameworkUpdate(meta?.frameworkVersion, bundled),
      lastAccessed: getLastAccessed(ws.path),
      presence: ws.presence,
      available: !!meta,
    } satisfies SelectWorkspaceRow))
  })

  const workspaceError = createMemo(() => {
    const error = workspaces.error
    if (!error) return undefined
    return error instanceof Error ? error.message : String(error)
  })

  const sorted = createMemo(() => {
    const rows = workspaces() ?? []
    const col = sortColumn()
    const dir = sortDir()
    const copy = [...rows]
    copy.sort((a, b) => {
      let cmp = 0
      switch (col) {
        case "name": cmp = a.name.localeCompare(b.name); break
        case "folder": cmp = a.parentFolder.localeCompare(b.parentFolder); break
        case "status": cmp = a.status.localeCompare(b.status); break
        case "version": cmp = a.version.localeCompare(b.version); break
        case "accessed": cmp = a.lastAccessed - b.lastAccessed; break
      }
      return dir === "desc" ? -cmp : cmp
    })
    return copy
  })

  const navCount = createMemo(() => sorted().length + 1) // rows + New workspace
  const close = () => {
    dialog.clear()
    props.onClose?.()
  }

  async function chooseWorkspace(path: string) {
    const launch = await getWorkspaceLaunchDecision(path)
    if (launch.type === "startup-choice") {
      dialog.replace(() => (
        <DialogSpinosaStartupChoice
          workspacePath={launch.workspacePath}
          workspaceName={launch.workspaceName}
          prompt={launch.prompt}
          onBack={() => dialog.replace(() => <DialogSpinosaWorkspacePicker />)}
        />
      ))
      return
    }
    dialog.clear()
    await spinosa.openWorkspace(path)
  }

  onMount(() => {
    dialog.setSize("xlarge")

    const off = keymap.intercept("key", ({ event, consume }) => {
      if (event.name === "up" || event.name === "k") {
        setSelected((v) => Math.max(0, v - 1))
        consume(); return
      }
      if (event.name === "down" || event.name === "j") {
        setSelected((v) => Math.min(navCount() - 1, v + 1))
        consume(); return
      }
      if (event.name === "return") {
        const idx = selected()
        const rows = sorted()
        if (idx < rows.length) {
          if (rows[idx]?.available) void chooseWorkspace(rows[idx].path)
        } else if (idx === rows.length) {
          dialog.clear()
          route.navigate({ type: "onboarding" })
        }
        consume(); return
      }
    })
    onCleanup(off)
  })

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} paddingBottom={1}>
      {/* ── back button ── */}
      <box flexDirection="row" alignItems="center" gap={1}>
        <box
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          onMouseDown={close}
        >
          <text fg={theme.textMuted}>← Back</text>
        </box>
        <text fg={theme.text}>
          <span style={{ bold: true }}>Choose a workspace</span>
        </text>
      </box>
      <box height={1} />

      {/* ── loading ── */}
      <Show when={workspaces.loading}>
        <text fg={theme.textMuted}>Loading saved workspaces…</text>
      </Show>

      {/* ── error ── */}
      <Show when={workspaceError()}>
        {(message) => (
          <box paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
            <text fg={theme.error}>Couldn’t load workspaces: {message()}</text>
          </box>
        )}
      </Show>

      {/* ── table ── */}
      <Show when={sorted().length > 0}>
        <box flexDirection="column" maxHeight={18}>
          {/* header row */}
          <box
            flexDirection="row"
            gap={1}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
            backgroundColor={theme.backgroundPanel}
          >
            <box width={30} onMouseDown={() => toggleSort("name")}>
              <text fg={theme.textMuted}>
                Name{sortColumn() === "name" ? (sortDir() === "asc" ? " ↑" : " ↓") : ""}
              </text>
            </box>
            <box width={30} onMouseDown={() => toggleSort("folder")}>
              <text fg={theme.textMuted}>
                Parent{sortColumn() === "folder" ? (sortDir() === "asc" ? " ↑" : " ↓") : ""}
              </text>
            </box>
            <box width={14} onMouseDown={() => toggleSort("status")}>
              <text fg={theme.textMuted}>
                Status{sortColumn() === "status" ? (sortDir() === "asc" ? " ↑" : " ↓") : ""}
              </text>
            </box>
            <box width={10} onMouseDown={() => toggleSort("version")}>
              <text fg={theme.textMuted}>
                Ver{sortColumn() === "version" ? (sortDir() === "asc" ? " ↑" : " ↓") : ""}
              </text>
            </box>
            <box width={20} onMouseDown={() => toggleSort("accessed")}>
              <text fg={theme.textMuted}>
                Accessed{sortColumn() === "accessed" ? (sortDir() === "asc" ? " ↑" : " ↓") : ""}
              </text>
            </box>
          </box>

          {/* data rows */}
          <For each={sorted()}>
            {(row, i) => {
              const active = () => selected() === i()
              return (
                <box
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={active() ? theme.backgroundElement : i() % 2 === 0 ? theme.backgroundPanel : "transparent"}
                  border={["left"]}
                  borderColor={active() ? theme.borderActive : theme.border}
                  flexDirection="row"
                  gap={1}
                  onMouseOver={() => setSelected(i())}
                  onMouseDown={() => { setSelected(i()); if (row.available) void chooseWorkspace(row.path) }}
                >
                  <box width={30}>
                    <text fg={theme.text} overflow="hidden" wrapMode="none">
                      <span style={{ bold: active() }}>{row.name}</span>
                    </text>
                  </box>
                  <box width={30}>
                    <text fg={theme.textMuted} overflow="hidden" wrapMode="none">
                      {truncatePathTail(row.parentFolder, 28)}
                    </text>
                  </box>
                  <box width={14} flexShrink={0}>
                    <text fg={row.available ? theme.textMuted : theme.warning} overflow="hidden" wrapMode="none">
                      {row.presence && row.presence !== "present" && row.presence !== "legacy"
                        ? workspacePresenceLabel(row.presence)
                        : row.presence === "legacy" ? "Legacy" : setupStatusLabel(row.status)}
                    </text>
                  </box>
                  <box width={10} flexShrink={0}>
                    <text fg={theme.textMuted} overflow="hidden" wrapMode="none">
                      v{row.version}{row.needsUpdate ? " ⚠" : ""}
                    </text>
                  </box>
                  <box width={20} flexShrink={0}>
                    <text fg={theme.textMuted} overflow="hidden" wrapMode="none">
                      {relativeTime(row.lastAccessed)}
                    </text>
                  </box>
                </box>
              )
            }}
          </For>
        </box>
      </Show>

      {/* ── empty ── */}
      <Show when={!workspaces.loading && !workspaceError() && sorted().length === 0}>
        <box paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
          <text fg={theme.textMuted}>No saved workspaces yet. Create one to begin.</text>
        </box>
      </Show>

      {/* ── separator + New workspace ── */}
      <box height={1} />
      <box
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        marginTop={1}
        backgroundColor={buttonBackground(theme, selected() === sorted().length)}
        border={["left"]}
        borderColor={buttonBorder(theme, selected() === sorted().length, theme.borderActive)}
        onMouseDown={() => { dialog.clear(); route.navigate({ type: "onboarding" }) }}
        onMouseOver={() => setSelected(sorted().length)}
      >
        <text fg={buttonText(theme, selected() === sorted().length, theme.primary)}>
          <span style={{ bold: selected() === sorted().length }}>+ New workspace</span>
        </text>
        <text fg={buttonText(theme, selected() === sorted().length, theme.textMuted)}>
          Import source folders into a new workspace
        </text>
      </box>
    </box>
  )
}
