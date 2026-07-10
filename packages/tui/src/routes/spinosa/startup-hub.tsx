import { createEffect, createResource, Show } from "solid-js"
import { CenteredColumn } from "../../component/centered-column"
import { DialogSpinosaStartupChoice } from "../../component/dialog-spinosa-startup-choice"
import { useRoute } from "../../context/route"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"
import { useTheme } from "../../context/theme"
import { getWorkspaceLaunchDecision } from "../../spinosa/workspace-launch"

export function StartupHub() {
  const spinosa = useSpinosaWorkspace()
  const route = useRoute()
  const { theme } = useTheme()
  const [decision] = createResource(
    () => spinosa.activePath,
    async (workspacePath) => getWorkspaceLaunchDecision(workspacePath),
  )
  const launch = () => {
    const value = decision()
    return value?.type === "startup-choice" ? value : undefined
  }

  createEffect(() => {
    if (!spinosa.activePath) route.navigate({ type: "workspace-picker" })
    if (decision()?.type === "open") route.navigate({ type: "workspace" })
  })

  return (
    <CenteredColumn>
      <Show when={!decision.loading} fallback={<text fg={theme.textMuted}>Loading workspace startup…</text>}>
        <Show when={launch()}>
          {(choice) => (
            <DialogSpinosaStartupChoice
              workspacePath={choice().workspacePath}
              workspaceName={choice().workspaceName}
              prompt={choice().prompt}
              onBack={() => route.navigate({ type: "workspace-picker" })}
            />
          )}
        </Show>
      </Show>
    </CenteredColumn>
  )
}
