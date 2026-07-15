import { createMemo } from "solid-js"
import { useSync } from "../context/sync"
import { useLocal } from "../context/local"

export function useConnected() {
  const sync = useSync()
  const local = useLocal()
  return createMemo(() => {
    const model = local.model.current()
    const acceptedFreeOpenCode =
      model?.providerID === "opencode" &&
      local.model.recent().some((item) => item.providerID === model.providerID && item.modelID === model.modelID)
    return acceptedFreeOpenCode ||
    sync.data.provider.some(
      (provider) =>
        provider.id !== "opencode" || Object.values(provider.models).some((model) => model.cost?.input !== 0),
    )
  })
}
