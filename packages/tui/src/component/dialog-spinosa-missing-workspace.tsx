import { InputRenderable, TextAttributes } from "@opentui/core"
import { createEffect, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { Spinner } from "./spinner"
import { buttonBackground, buttonBorder, buttonText } from "../util/button"
import { truncatePathTail } from "../spinosa/truncate-path"
import { unregisterWorkspace } from "@spinosa/core/workspace/registry"
import {
  recoverWorkspaceAtPath,
  scanAndRecoverWorkspace,
} from "@spinosa/core/workspace/recovery"
import type { SpinosaWorkspaceID } from "@spinosa/core/workspace/identity"
import { useBindings } from "../keymap"

type MissingWorkspaceAction = "path" | "scan" | "remove"

export function DialogSpinosaMissingWorkspace(props: {
  workspacePath: string
  workspaceName: string
  workspaceID?: SpinosaWorkspaceID
  onBack: () => void
  onRecovered: (workspacePath: string) => void | Promise<void>
  onRemoved: () => void | Promise<void>
}) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    active: "path" as MissingWorkspaceAction,
    candidatePath: "",
    busy: false,
    message: "",
    progress: "",
    removeArmed: false,
  })
  let input: InputRenderable
  let generation = 0
  let scanController: AbortController | undefined

  const focusInput = () => setTimeout(() => {
    if (!input || input.isDestroyed || store.busy) return
    input.focus()
  }, 1)

  onMount(() => {
    dialog.setSize("large")
    focusInput()
  })

  onCleanup(() => {
    generation++
    scanController?.abort()
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    input.traits = store.busy ? { suspend: true, status: "BUSY" } : { status: "WORKSPACE PATH" }
    if (store.busy) input.blur()
  })

  const begin = (message: string) => {
    if (store.busy) return false
    generation++
    setStore({ busy: true, message, progress: "", removeArmed: false })
    input?.blur()
    return true
  }

  const finish = (message: string) => {
    setStore({ busy: false, message, progress: "" })
    focusInput()
  }

  async function useCandidatePath() {
    if (!store.candidatePath.trim()) {
      finish("Enter the workspace’s new folder path first.")
      return
    }
    if (!begin("Checking workspace path…")) return
    const currentGeneration = generation
    try {
      const recovered = await recoverWorkspaceAtPath({
        indexedPath: props.workspacePath,
        candidatePath: store.candidatePath,
        projectName: props.workspaceName,
        workspaceID: props.workspaceID,
      })
      if (currentGeneration !== generation) return
      await props.onRecovered(recovered)
    } catch (error) {
      if (currentGeneration !== generation) return
      finish(error instanceof Error ? error.message : String(error))
    }
  }

  async function scanComputer() {
    if (!props.workspaceID) {
      finish("This legacy index entry has no workspace ID. Enter its new path instead.")
      return
    }
    if (!begin("Scanning this computer for the workspace ID…")) return
    scanController?.abort()
    scanController = new AbortController()
    const currentGeneration = generation
    try {
      const result = await scanAndRecoverWorkspace({
        indexedPath: props.workspacePath,
        projectName: props.workspaceName,
        workspaceID: props.workspaceID,
        signal: scanController.signal,
        onProgress(progress) {
          if (currentGeneration !== generation) return
          setStore("progress", `${progress.visited} folders · ${truncatePathTail(progress.currentPath, 56)}`)
        },
      })
      if (currentGeneration !== generation) return
      if (result.status === "found") {
        await props.onRecovered(result.path)
        return
      }
      if (result.status === "ambiguous") {
        finish(`Found ${result.matches.length} folders with this ID. Enter the correct path manually.`)
        return
      }
      finish("No workspace with this ID was found in the standard search locations.")
    } catch (error) {
      if (currentGeneration !== generation) return
      finish(error instanceof Error ? error.message : String(error))
    }
  }

  async function removeFromIndex() {
    if (store.busy) return
    if (!store.removeArmed) {
      setStore({
        active: "remove",
        removeArmed: true,
        message: "Click “Confirm remove” to forget this workspace. No workspace files will be deleted.",
      })
      return
    }
    if (!begin("Removing workspace from the index…")) return
    try {
      await unregisterWorkspace(props.workspacePath)
      await props.onRemoved()
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error))
    }
  }

  const runAction = (action: MissingWorkspaceAction) => {
    setStore("active", action)
    if (action !== "remove") setStore("removeArmed", false)
    queueMicrotask(() => {
      if (action === "path") void useCandidatePath()
      if (action === "scan") void scanComputer()
      if (action === "remove") void removeFromIndex()
    })
  }

  const actions = ["path", "scan", "remove"] as const
  const moveAction = (offset: number) => {
    if (store.busy) return
    input?.blur()
    const current = Math.max(0, actions.indexOf(store.active))
    setStore("active", actions[(current + offset + actions.length) % actions.length]!)
  }

  useBindings(() => ({
    enabled: !store.busy,
    bindings: [
      { key: "tab", desc: "Next recovery action", group: "Dialog", cmd: () => moveAction(1) },
      { key: "shift+tab", desc: "Previous recovery action", group: "Dialog", cmd: () => moveAction(-1) },
      { key: "left", desc: "Previous recovery action", group: "Dialog", cmd: () => { if (!input?.focused) moveAction(-1) } },
      { key: "right", desc: "Next recovery action", group: "Dialog", cmd: () => { if (!input?.focused) moveAction(1) } },
      { key: "return", desc: "Run recovery action", group: "Dialog", cmd: () => { if (!input?.focused) runAction(store.active) } },
    ],
  }))

  const back = () => {
    if (store.busy) return
    input?.blur()
    props.onBack()
  }

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>Workspace not found</text>
        <text fg={theme.textMuted} onMouseUp={back}>esc</text>
      </box>
      <text fg={theme.error}>✕ {props.workspaceName}</text>
      <text fg={theme.textMuted} wrapMode="word">
        This workspace doesn’t exist at its indexed location. Enter its new path, scan this computer using its ID, or remove it from the index.
      </text>
      <text fg={theme.textMuted}>{truncatePathTail(props.workspacePath, 72)}</text>
      <Show when={props.workspaceID}>
        {(workspaceID) => <text fg={theme.textMuted}>ID: {workspaceID()}</text>}
      </Show>
      <box paddingTop={1}>
        <input
          ref={(value: InputRenderable) => { input = value }}
          onInput={(value) => setStore("candidatePath", value)}
          onSubmit={() => void useCandidatePath()}
          placeholder="New workspace folder path"
          placeholderColor={theme.textMuted}
          textColor={theme.text}
          focusedTextColor={theme.text}
          focusedBackgroundColor={theme.backgroundPanel}
          cursorColor={theme.primary}
        />
      </box>
      <Show when={store.busy}>
        <Spinner color={theme.primary}>{store.message}</Spinner>
      </Show>
      <Show when={!store.busy && store.message}>
        <text fg={store.removeArmed ? theme.warning : theme.textMuted} wrapMode="word">{store.message}</text>
      </Show>
      <Show when={store.progress}>
        <text fg={theme.textMuted}>{store.progress}</text>
      </Show>
      <box flexDirection="row" justifyContent="flex-end" gap={2} paddingTop={1}>
        {actions.map((action) => {
          const active = () => store.active === action
          const label = () => action === "path"
            ? "Use new path"
            : action === "scan"
              ? "Scan computer"
              : store.removeArmed ? "Confirm remove" : "Remove from index"
          return (
            <box
              paddingLeft={2}
              paddingRight={2}
              backgroundColor={buttonBackground(theme, active())}
              border={["left"]}
              borderColor={buttonBorder(theme, active(), action === "remove" ? theme.error : theme.borderActive)}
              onMouseOver={() => { if (!store.busy) setStore("active", action) }}
              onMouseUp={() => { if (!store.busy) { input?.blur(); runAction(action) } }}
            >
              <text fg={buttonText(theme, active(), action === "remove" ? theme.error : theme.primary)}>
                {label()}
              </text>
            </box>
          )
        })}
      </box>
    </box>
  )
}
