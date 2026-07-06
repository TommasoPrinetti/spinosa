import { createSignal } from "solid-js"
import { useTheme } from "../context/theme"
import { buttonBackground, buttonText } from "../util/button"

export function PluginRouteMissing(props: { id: string; onHome: () => void }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)

  return (
    <box width="100%" height="100%" alignItems="center" justifyContent="center" flexDirection="column" gap={1}>
      <text fg={theme.warning}>Unknown plugin route: {props.id}</text>
      <box
        onMouseOver={() => setHover(true)}
        onMouseOut={() => setHover(false)}
        onMouseDown={props.onHome}
        backgroundColor={buttonBackground(theme, hover())}
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={buttonText(theme, hover(), theme.text)}>go home</text>
      </box>
    </box>
  )
}
