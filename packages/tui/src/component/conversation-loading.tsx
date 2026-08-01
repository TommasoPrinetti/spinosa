import { createEffect, onCleanup, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { Spinner } from "./spinner"

export const CONVERSATION_BOOT_TIMEOUT_MS = 30_000

export function ConversationLoading(props: {
  active: () => boolean
  onTimeout?: () => void
}) {
  const theme = useTheme().theme

  createEffect(() => {
    if (!props.active()) return
    const timer = setTimeout(() => {
      props.onTimeout?.()
    }, CONVERSATION_BOOT_TIMEOUT_MS).unref()
    onCleanup(() => clearTimeout(timer))
  })

  return (
    <Show when={props.active()}>
      <box
        position="absolute"
        zIndex={6000}
        left={0}
        right={0}
        top={0}
        bottom={0}
        justifyContent="center"
        alignItems="center"
        backgroundColor={theme.background}
      >
        <box
          backgroundColor={theme.backgroundPanel}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <Spinner color={theme.textMuted}>Loading conversation engine…</Spinner>
        </box>
      </box>
    </Show>
  )
}
