import { createMemo } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"

type QueuedPromptOption = {
  messageID: string
  sessionID: string
  text: string
}

function queuedText(parts: ReadonlyArray<{ type: string; text?: string; synthetic?: boolean }> | undefined): string {
  if (!parts) return ""
  return parts
    .filter((part) => part.type === "text" && !part.synthetic && typeof part.text === "string")
    .map((part) => part.text!)
    .join("\n")
    .trim()
}

/** Manage V2 mid-run queued admissions: Return steers the selected prompt. */
export function DialogQueuedPrompts(props: { sessionID: string }) {
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()

  const options = createMemo((): DialogSelectOption<QueuedPromptOption>[] => {
    const delivery = sync.data.prompt_delivery
    const messages = sync.data.message[props.sessionID] ?? []
    return messages
      .filter((message) => message.role === "user" && delivery[message.id] === "queue")
      .map((message) => {
        const text = queuedText(sync.data.part[message.id])
        return {
          title: text.replaceAll("\n", " ").slice(0, 80) || "(empty prompt)",
          value: {
            messageID: message.id,
            sessionID: message.sessionID,
            text,
          },
          description: "queued",
        } satisfies DialogSelectOption<QueuedPromptOption>
      })
  })

  const steer = async (option: DialogSelectOption<QueuedPromptOption>) => {
    const body = option.value.text
    if (!body) {
      toast.show({ variant: "warning", message: "Queued prompt has no text to steer" })
      return
    }
    try {
      await sdk.client.v2.session.prompt(
        {
          sessionID: option.value.sessionID,
          id: option.value.messageID,
          prompt: { text: body },
          delivery: "steer",
        },
        { throwOnError: true },
      )
      dialog.clear()
    } catch (error) {
      toast.show({
        title: "Couldn’t steer",
        message: errorMessage(error),
        variant: "error",
      })
    }
  }

  return (
    <DialogSelect
      title="Queued prompts"
      options={options()}
      emptyView={
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
          <text>No queued prompts</text>
        </box>
      }
      onSelect={(option) => void steer(option)}
      footerHints={[{ title: "Steer", label: "return" }]}
    />
  )
}
