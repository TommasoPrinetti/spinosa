import { createMemo, createResource } from "solid-js"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useProject } from "../context/project"
import { useSDK } from "../context/sdk"
import { createStore } from "solid-js/store"

export function DialogTag(props: { onSelect?: (value: string) => void }) {
  const sdk = useSDK()
  const dialog = useDialog()
  const project = useProject()

  const [store] = createStore({
    filter: "",
  })

  const [files] = createResource(
    () => ({ filter: store.filter, workspace: project.workspace.current() }),
    async (params) => {
      try {
        const result = await sdk.client.find.files({
          query: params.filter,
          workspace: params.workspace,
        })
        if (result.error) return []
        return (result.data ?? []).slice(0, 5)
      } catch {
        return []
      }
    },
  )

  const options = createMemo(() =>
    (files() ?? []).map((file) => ({
      value: file,
      title: file,
    })),
  )

  return (
    <DialogSelect
      title="Autocomplete"
      options={options()}
      onSelect={(option) => {
        props.onSelect?.(option.value)
        dialog.clear()
      }}
    />
  )
}
