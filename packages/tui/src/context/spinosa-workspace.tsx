import { createSignal, createResource } from "solid-js"
import { createSimpleContext } from "./helper"
import { useKV } from "./kv"
import { useRoute } from "./route"
import { useTuiPaths } from "./runtime"
import type { PromptInfo } from "../prompt/history"
import {
  routeForSetupStatus,
  SPINOSA_ACTIVE_WORKSPACE_KV,
  SPINOSA_GENERIC_MODE_KV,
  SPINOSA_LAST_GOAL_KV,
  SPINOSA_LAST_SESSION_KV,
} from "../spinosa/entry"
import { isSpinosaWorkspace, readWorkspaceMeta } from "../spinosa/service"
import type { SpinosaWorkspaceMeta } from "../spinosa/types"
import { setActiveWorkspacePath, tuiLog } from "../spinosa/log"
export const { use: useSpinosaWorkspace, provider: SpinosaWorkspaceProvider } = createSimpleContext({
  name: "SpinosaWorkspace",
  init: () => {
    const kv = useKV()
    const route = useRoute()
    const paths = useTuiPaths()
    const cwdWorkspace = isSpinosaWorkspace(paths.cwd) ? paths.cwd : undefined
    const [activePath, setActivePath] = createSignal<string | undefined>(cwdWorkspace)
    const [genericMode, setGenericMode] = createSignal(false)
    const [pickerRequested, setPickerRequested] = createSignal(false)
    const [pendingPrompt, setPendingPrompt] = createSignal<PromptInfo | undefined>()

    const [meta, { refetch: refetchMeta }] = createResource(activePath, async (workspacePath) => {
      if (!workspacePath || !isSpinosaWorkspace(workspacePath)) return undefined
      return readWorkspaceMeta(workspacePath)
    })

    const openWorkspace = async (workspacePath: string) => {
      setActiveWorkspacePath(workspacePath)
      tuiLog(`openWorkspace path=${workspacePath}`)
      kv.set(SPINOSA_ACTIVE_WORKSPACE_KV, workspacePath)
      kv.set(SPINOSA_GENERIC_MODE_KV, false)
      setActivePath(workspacePath)
      setGenericMode(false)
      setPickerRequested(false)
      const loaded = await readWorkspaceMeta(workspacePath)
      if (!loaded) {
        showPicker()
        return
      }
      route.navigate(routeForSetupStatus(loaded.setupStatus))
    }

    const useGenericMode = () => {
      kv.set(SPINOSA_GENERIC_MODE_KV, true)
      kv.set(SPINOSA_ACTIVE_WORKSPACE_KV, undefined)
      setActivePath(undefined)
      setGenericMode(true)
      setPickerRequested(false)
      route.navigate({ type: "workspace" })
    }

    const showPicker = () => {
      // Save the current route before navigating away (so the dialog's onClose can restore it)
      const currentRoute = route.data
      if (currentRoute.type === "workspace" && currentRoute.sessionID) {
        kv.set(SPINOSA_LAST_SESSION_KV, currentRoute.sessionID)
      }
      route.navigate({ type: "workspace" })
      setPickerRequested(true)
    }

    const refresh = () => {
      if (activePath()) void refetchMeta()
    }

    const setLastRoute = (sessionId: string, goalPath: string) => {
      kv.set(SPINOSA_LAST_SESSION_KV, sessionId)
      kv.set(SPINOSA_LAST_GOAL_KV, goalPath)
    }

    const lastSessionId = () => kv.get(SPINOSA_LAST_SESSION_KV) as string | undefined
    const lastGoalPath = () => kv.get(SPINOSA_LAST_GOAL_KV) as string | undefined

    return {
      get activePath() {
        return activePath()
      },
      get genericMode() {
        return genericMode()
      },
      get meta(): SpinosaWorkspaceMeta | undefined {
        return meta()
      },
      get loading() {
        return meta.loading
      },
      get pickerRequested() {
        return pickerRequested()
      },
      get pendingPrompt(): PromptInfo | undefined {
        return pendingPrompt()
      },
      openWorkspace,
      useGenericMode,
      showPicker,
      clearPickerRequest() {
        setPickerRequested(false)
      },
      refresh,
      setLastRoute,
      lastSessionId,
      lastGoalPath,
      queuePrompt(prompt: PromptInfo) {
        setPendingPrompt(prompt)
      },
      consumePendingPrompt() {
        const prompt = pendingPrompt()
        setPendingPrompt(undefined)
        return prompt
      },
    }
  },
})
