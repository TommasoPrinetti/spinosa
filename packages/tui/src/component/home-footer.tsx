import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useSpinosaWorkspace } from "../context/spinosa-workspace"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogSpinosaSettings } from "./dialog-spinosa-settings"
import { DialogAgent } from "./dialog-agent"
import { DialogSessionList } from "./dialog-session-list"
import { DialogModel } from "./dialog-model"
import { DialogProvider } from "./dialog-provider"
import { MAIN_CONTENT_MAX_WIDTH } from "../util/layout"
import { deleteWorkspace } from "../spinosa/service"
import { SPINOSA_BASE_MODE, useBindings } from "../keymap"
import { usePromptRef } from "../context/prompt"

export function HomeFooter() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const spinosa = useSpinosaWorkspace()
  const promptRef = usePromptRef()
  const [hovered, setHovered] = createSignal<string | undefined>()
  const [deleting, setDeleting] = createSignal(false)

  const deleteActiveWorkspace = async () => {
    const workspacePath = spinosa.activePath
    if (!workspacePath || spinosa.genericMode || deleting()) return

    const confirmed = await DialogConfirm.show(
      dialog,
      "Delete workspace",
      "Do you really want to delete the workspace folder and its contents?",
      {
        confirmLabel: "Yes, delete",
        cancelLabel: "No, keep it",
        defaultChoice: "cancel",
      },
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      await deleteWorkspace(workspacePath)
      spinosa.useGenericMode()
      spinosa.showPicker()
      toast.show({ variant: "success", message: "Workspace deleted." })
    } catch (error) {
      toast.show({
        variant: "error",
        message: error instanceof Error ? error.message : "Couldn’t delete this workspace.",
      })
    } finally {
      setDeleting(false)
    }
  }

  type Shortcut = { id: string; key: string; label: string; action: () => void; danger?: boolean }
  const buttons = createMemo<Shortcut[]>(() => {
    const items: Shortcut[] = [
      { id: "S", key: "shift+s", label: "Settings", action: () => dialog.replace(() => <DialogSpinosaSettings />) },
      { id: "A", key: "shift+a", label: "Agents", action: () => dialog.replace(() => <DialogAgent />) },
      { id: "P", key: "shift+p", label: "Provider", action: () => dialog.replace(() => <DialogProvider />) },
      { id: "M", key: "shift+m", label: "Models", action: () => dialog.replace(() => <DialogModel />) },
    ]
    if (!spinosa.genericMode) {
      items.splice(2, 0, {
        id: "K",
        key: "shift+k",
        label: "Sessions",
        action: () => dialog.replace(() => <DialogSessionList />),
      })
    }
    if (spinosa.activePath && !spinosa.genericMode) {
      items.push({
        id: "D",
        key: "shift+d",
        label: deleting() ? "Deleting…" : "Delete workspace",
        action: () => void deleteActiveWorkspace(),
        danger: true,
      })
    }
    return items
  })

  useBindings(() => ({
    mode: SPINOSA_BASE_MODE,
    enabled: () => !promptRef.current?.focused,
    bindings: buttons().map((item) => ({
      key: item.key,
      desc: item.label,
      group: "Home",
      cmd: () => item.action(),
    })),
  }))

  return (
    <box width="100%" maxWidth={MAIN_CONTENT_MAX_WIDTH} flexDirection="row" justifyContent="center" gap={0}>
      <For each={buttons()}>
        {(item, i) => (
          <>
            <Show when={i() > 0}>
              <text fg={theme.textMuted}>{" · "}</text>
            </Show>
            <box
              paddingX={1}
              onMouseOver={() => setHovered(item.id)}
              onMouseOut={() => setHovered(undefined)}
              onMouseUp={item.action}
            >
              <text
                fg={
                  hovered() === item.id
                    ? (item.danger ? theme.error : theme.text)
                    : (item.danger ? theme.error : theme.textMuted)
                }
                attributes={hovered() === item.id ? TextAttributes.BOLD : undefined}
              >
                {item.label}
              </text>
            </box>
          </>
        )}
      </For>
    </box>
  )
}
