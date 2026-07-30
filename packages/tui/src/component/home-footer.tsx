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

export function HomeFooter() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const spinosa = useSpinosaWorkspace()
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

  type Shortcut = { id: string; label: string; action: () => void; danger?: boolean }
  const buttons = createMemo<Shortcut[]>(() => {
    const items: Shortcut[] = [
      { id: "S", label: "Settings", action: () => dialog.replace(() => <DialogSpinosaSettings />) },
      { id: "A", label: "Agents", action: () => dialog.replace(() => <DialogAgent />) },
      { id: "P", label: "Provider", action: () => dialog.replace(() => <DialogProvider />) },
      { id: "M", label: "Models", action: () => dialog.replace(() => <DialogModel />) },
    ]
    if (!spinosa.genericMode) {
      items.splice(2, 0, { id: "K", label: "Sessions", action: () => dialog.replace(() => <DialogSessionList />) })
    }
    if (spinosa.activePath && !spinosa.genericMode) {
      items.push({
        id: "D",
        label: deleting() ? "Deleting…" : "Delete workspace",
        action: () => void deleteActiveWorkspace(),
        danger: true,
      })
    }
    return items
  })

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
