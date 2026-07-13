import { DialogSelect } from "../../ui/dialog-select"
import { useRoute } from "../../context/route"

export function DialogSubagent(props: { sessionID: string }) {
  const route = useRoute()

  return (
    <DialogSelect
      title="Subagent actions"
      options={[
        {
          title: "Open",
          value: "subagent.view",
          description: "the subagent's session",
          onSelect: (dialog) => {
            route.navigate({
              type: "workspace",
              sessionID: props.sessionID,
            })
            dialog.clear()
          },
        },
      ]}
    />
  )
}
