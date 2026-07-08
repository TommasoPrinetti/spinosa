import type { ParentProps } from "solid-js"
import { MAIN_CONTENT_MAX_WIDTH } from "../util/layout"

export function CenteredColumn(props: ParentProps<{ maxWidth?: number; flexGrow?: number; minHeight?: number }>) {
  return (
    <box flexGrow={props.flexGrow ?? 1} minHeight={props.minHeight ?? 0} alignItems="center" width="100%">
      <box
        maxWidth={props.maxWidth ?? MAIN_CONTENT_MAX_WIDTH}
        width="100%"
        flexGrow={1}
        minHeight={props.minHeight ?? 0}
        flexDirection="column"
      >
        {props.children}
      </box>
    </box>
  )
}