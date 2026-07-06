import { createEffect, on } from "solid-js"
import { useRoute } from "../context/route"
import { useSpinosaWorkspace } from "../context/spinosa-workspace"
import { routeForSetupStatus } from "./entry"
import { createWorkspaceFileWatcher } from "./artifact-watcher"

export function SpinosaWorkspaceBinder() {
  const spinosa = useSpinosaWorkspace()
  const route = useRoute()

  createWorkspaceFileWatcher(
    () => spinosa.activePath,
    ["system/configuration.md", "system/context.md", ".spinosa/workspace"],
    () => {
      spinosa.refresh()
    },
  )

  createEffect(
    on(
      () => spinosa.meta?.setupStatus,
      (status, prev) => {
        if (!status || !spinosa.activePath || spinosa.genericMode) return
        if (prev === "cli_started" && status === "workspace_started") {
          route.navigate(routeForSetupStatus(status))
        }
      },
    ),
  )

  return null
}
