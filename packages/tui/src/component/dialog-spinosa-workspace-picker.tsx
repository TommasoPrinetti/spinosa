import { createMemo, createResource, onMount } from "solid-js"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { listRegisteredWorkspaces } from "../spinosa/service"
import { useRoute } from "../context/route"
import { useSpinosaWorkspace } from "../context/spinosa-workspace"
import { getWorkspaceLaunchDecision } from "../spinosa/workspace-launch"
import { DialogSpinosaStartupChoice } from "./dialog-spinosa-startup-choice"

type OptionValue =
  | { type: "workspace"; path: string; projectName: string }
  | { type: "new-workspace" }

export function DialogSpinosaWorkspacePicker() {
  const dialog = useDialog()
  const route = useRoute()
  const spinosa = useSpinosaWorkspace()
  const [registered] = createResource(() => listRegisteredWorkspaces())

  onMount(() => {
    dialog.setSize("medium")
  })

  const options = createMemo<DialogSelectOption<OptionValue>[]>(() => {
    const workspaces = (registered() ?? [])
      .toSorted((a, b) => a.projectName.localeCompare(b.projectName))
      .map((workspace) => ({
        title: workspace.projectName,
        description: workspace.path,
        value: {
          type: "workspace" as const,
          path: workspace.path,
          projectName: workspace.projectName,
        },
        onSelect: () => void chooseWorkspace(workspace.path),
      }))

    return [
      ...workspaces,
      {
        title: "New workspace",
        description: "Create new Spinosa workspace",
        value: { type: "new-workspace" as const },
        onSelect: () => {
          dialog.clear()
          route.navigate({ type: "onboarding" })
        },
      },
    ]
  })

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

  return (
    <DialogSelect
      title="Select workspace"
      placeholder="Filter workspaces"
      emptyView={<text>No registered workspaces found.</text>}
      options={options()}
    />
  )
}
