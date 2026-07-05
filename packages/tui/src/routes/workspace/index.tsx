import { Match, Switch } from "solid-js"
import { useRouteData } from "../../context/route"
import { SpinosaWorkspaceBinder } from "../../spinosa/workspace-bind"
import { Home } from "../home"
import { Session } from "../session"

export function Workspace() {
  const route = useRouteData("workspace")

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
