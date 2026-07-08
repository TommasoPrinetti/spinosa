import { createEffect, Match, onCleanup, Switch } from "solid-js"
import { useKV } from "../../context/kv"
import { useRouteData } from "../../context/route"
import { SpinosaWorkspaceBinder } from "../../spinosa/workspace-bind"
import { Home } from "../home"
import { Session } from "../session"

const SESSION_DIR_FILTER_KV = "session_directory_filter_enabled"

export function Workspace() {
  const route = useRouteData("workspace")
  const kv = useKV()

  // Spinosa workspaces show all project sessions, not scoped to a directory.
  createEffect(() => {
    const orig = kv.get(SESSION_DIR_FILTER_KV, true)
    kv.set(SESSION_DIR_FILTER_KV, false)
    onCleanup(() => {
      kv.set(SESSION_DIR_FILTER_KV, orig)
    })
  })

  return (
    <box flexGrow={1} flexDirection="column" minHeight={0}>
      <SpinosaWorkspaceBinder />
      <box flexGrow={1} minHeight={0}>
        <Switch>
          <Match when={route.sessionID}>
            <Session />
          </Match>
          <Match when={true}>
            <Home />
          </Match>
        </Switch>
      </box>
    </box>
  )
}
