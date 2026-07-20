import { createEffect, on } from "solid-js"
import { useRoute } from "../context/route"
import { useSpinosaWorkspace } from "../context/spinosa-workspace"
import { createWorkspaceFileWatcher } from "./artifact-watcher"
import { routeForWorkspaceStatusTransition } from "./workspace-transition"

export function SpinosaWorkspaceBinder() {
  const spinosa = useSpinosaWorkspace()
  const route = useRoute()

  createWorkspaceFileWatcher(
    () => spinosa.activePath,
    ["system/configuration.md", "system/context.md", ".spinosa/workspace"],
    () => spinosa.refresh(),
  )

  createEffect(
    on(
      () => [spinosa.activePath, spinosa.meta?.setupStatus] as const,
      (current, prev) => {
        if (spinosa.genericMode) return
        const nextRoute = routeForWorkspaceStatusTransition(current, prev, {
          sourceLocation: spinosa.meta?.sourceLocation,
          workspaceName: spinosa.meta?.projectName,
        })
        if (nextRoute) route.navigate(nextRoute)
      },
    ),
  )

  return null
}
