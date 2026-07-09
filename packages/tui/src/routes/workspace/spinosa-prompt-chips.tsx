import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useToast } from "../../ui/toast"
import { useRoute } from "../../context/route"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"

import { updateWorkspace } from "../../spinosa-core/commands/update"
import { resolveFrameworkRoot } from "../../spinosa-core/framework/discovery"
import {
  readBundledFrameworkVersion,
  workspaceNeedsFrameworkUpdate,
  writeWorkspaceFrameworkVersion,
} from "../../spinosa/service"
import { useBindings, OPENCODE_BASE_MODE } from "../../keymap"
import { usePromptRef } from "../../context/prompt"
import { buttonBackground, buttonBorder, buttonText } from "../../util/button"

type ActionRowItem = {
  key: string
  label: string
  onPress: () => void
}

export function SpinosaPromptChips() {
  const { theme } = useTheme()
  const toast = useToast()
  const { navigate } = useRoute()
  const spinosa = useSpinosaWorkspace()
  const promptRef = usePromptRef()
  const [busyAction, setBusyAction] = createSignal<"update" | "completed" | undefined>()
  const [updateLabel, setUpdateLabel] = createSignal("Updating workspace…")
  const [selectedAction, setSelectedAction] = createSignal(0)
  const [hoveredAction, setHoveredAction] = createSignal<string | undefined>()
  const workspaceReady = createMemo(() => Boolean(spinosa.activePath && !spinosa.genericMode))
  const [bundledVersion] = createResource(
    () => (workspaceReady() ? "bundled" : undefined),
    () => readBundledFrameworkVersion(),
  )
  const needsWorkspaceUpdate = createMemo(() =>
    workspaceNeedsFrameworkUpdate(spinosa.meta?.frameworkVersion, bundledVersion()),
  )

  const runWorkspaceUpdate = async () => {
    const workspacePath = spinosa.activePath
    if (!workspacePath || busyAction()) return
    setBusyAction("update")
    setUpdateLabel("Starting…")
    toast.show({
      variant: "info",
      message: "Updating workspace…",
      duration: 30000,
    })
    const result = await updateWorkspace({
      workspacePath,
      frameworkRoot: resolveFrameworkRoot() ?? "",
      onPhase: (_phase, detail) => {
        const line = detail.trim()
        if (!line) return
        setUpdateLabel(line.replace(/^[#>\s]+/, "").slice(0, 22))
      },
    })
    if (result.success) {
      const version = bundledVersion() ?? (await readBundledFrameworkVersion())
      if (version) {
        await writeWorkspaceFrameworkVersion(workspacePath, version)
      }
    }
    spinosa.refresh()

    if (result.success) {
      setBusyAction("completed")
      setUpdateLabel("Updated workspace!")
      setTimeout(() => {
        setBusyAction(undefined)
        setUpdateLabel("Updating workspace…")
      }, 2000)
      return
    }

    setBusyAction(undefined)
    setUpdateLabel("Updating workspace…")

    toast.show({
      title: "Workspace update failed",
      variant: "error",
      message: "Workspace update failed",
      duration: 10000,
    })
  }

  const primaryActions = createMemo<ActionRowItem[]>(() =>
    workspaceReady()
      ? ([
          {
            key: "new-workspace",
            label: "New workspace",
            onPress: () => navigate({ type: "onboarding" }),
          },
          {
            key: "add-files",
            label: "Add files",
            onPress: () => navigate({ type: "add-files" }),
          },
          {
            key: "change-workspace",
            label: "Change workspace",
            onPress: () => spinosa.showPicker(),
          },
          ...(needsWorkspaceUpdate() || busyAction() === "update" || busyAction() === "completed"
            ? [
                {
                  key: "update-workspace",
                  label:
                    busyAction() === "completed"
                      ? "Updated workspace!"
                      : busyAction() === "update"
                        ? updateLabel()
                        : "Update workspace",
                  onPress: () => void runWorkspaceUpdate(),
                },
              ]
            : []),
        ] as const)
      : ([
          {
            key: "new-workspace",
            label: "New workspace",
            onPress: () => navigate({ type: "onboarding" }),
          },
          {
            key: "select-workspace",
            label: "Select workspace",
            onPress: () => spinosa.showPicker(),
          },
        ] as const),
  )

  const renderRow = (items: ActionRowItem[]) => (
    <box width="100%" flexDirection="row" gap={workspaceReady() ? 2 : 1} paddingBottom={workspaceReady() ? 2 : 1}>
      <For each={items}>
        {(item, index) => {
          const highlighted = createMemo(
            () => hoveredAction() === item.key || selectedAction() === index(),
          )

          return (
            <box
              flexGrow={1}
              minWidth={0}
              justifyContent="center"
              alignItems="center"
              paddingLeft={workspaceReady() ? 2 : 1}
              paddingRight={workspaceReady() ? 2 : 1}
              paddingTop={1}
              paddingBottom={1}
              backgroundColor={buttonBackground(theme, highlighted())}
              border={workspaceReady() ? ["left"] : ["top", "bottom", "left", "right"]}
              borderColor={buttonBorder(theme, highlighted())}
              onMouseOver={() => {
                setHoveredAction(item.key)
                setSelectedAction(index())
              }}
              onMouseOut={() => setHoveredAction(undefined)}
              onMouseDown={() => {
                setSelectedAction(index())
                setTimeout(() => item.onPress(), 0)
              }}
            >
              <text fg={buttonText(theme, highlighted())} wrapMode="none">
                {item.label}
              </text>
            </box>
          )
        }}
      </For>
    </box>
  )

  const moveSelection = (offset: number) => {
    const total = primaryActions().length
    if (total === 0) return
    setSelectedAction((current) => (current + offset + total) % total)
  }

  const runSelectedAction = () => {
    const item = primaryActions()[selectedAction()]
    if (!item) return
    item.onPress()
  }

  useBindings(() => ({
    mode: OPENCODE_BASE_MODE,
    enabled: () => workspaceReady() && !spinosa.genericMode && !promptRef.current?.focused,
    bindings: [
      { key: "n", desc: "New workspace", group: "Home", cmd: () => navigate({ type: "onboarding" }) },
      { key: "a", desc: "Add files", group: "Home", cmd: () => navigate({ type: "add-files" }) },
      { key: "w", desc: "Change workspace", group: "Home", cmd: () => spinosa.showPicker() },
    ],
  }))

  return (
    <Show when={!spinosa.genericMode}>
      <box width="100%" flexDirection="column">{renderRow(primaryActions())}</box>
    </Show>
  )
}
