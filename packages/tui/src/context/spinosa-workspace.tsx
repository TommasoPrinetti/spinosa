import { createSignal, createResource, onCleanup } from "solid-js"
import { createSimpleContext } from "./helper"
import { useKV } from "./kv"
import { useRoute } from "./route"
import { useTuiPaths } from "./runtime"
import type { PromptInfo } from "../prompt/history"
import {
  routeForWorkspaceOpen,
  SPINOSA_ACTIVE_WORKSPACE_KV,
  SPINOSA_GENERIC_MODE_KV,
  SPINOSA_LAST_GOAL_KV,
  SPINOSA_LAST_SESSION_KV,
} from "../spinosa/entry"
import { isSpinosaWorkspace, readWorkspaceMeta } from "../spinosa/service"
import type { SpinosaWorkspaceMeta } from "../spinosa/types"
import { setActiveWorkspacePath, tuiLog } from "../spinosa/log"
import type { RouteNavigateInput } from "./route"
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
    const [pickerReturnSessionId, setPickerReturnSessionId] = createSignal<string | undefined>()
    const [pendingPrompt, setPendingPrompt] = createSignal<{ workspacePath: string; prompt: PromptInfo } | undefined>()

    const [meta, { refetch: refetchMeta }] = createResource(activePath, async (workspacePath) => {
      if (!workspacePath || !isSpinosaWorkspace(workspacePath)) return undefined
      return readWorkspaceMeta(workspacePath).catch(() => undefined)
    })
    const cwdDiscoveryTimer = setInterval(() => {
      if (activePath() || genericMode() || !isSpinosaWorkspace(paths.cwd)) return
      setActivePath(paths.cwd)
    }, 3000)
    onCleanup(() => clearInterval(cwdDiscoveryTimer))

    const openWorkspace = async (workspacePath: string, options?: { route?: RouteNavigateInput }) => {
      setActiveWorkspacePath(workspacePath)
      tuiLog(`openWorkspace path=${workspacePath}`)
      kv.set(SPINOSA_ACTIVE_WORKSPACE_KV, workspacePath)
      kv.set(SPINOSA_GENERIC_MODE_KV, false)
      setActivePath(workspacePath)
      setGenericMode(false)
      setPickerRequested(false)
      const loaded = await readWorkspaceMeta(workspacePath).catch(() => undefined)
      if (activePath() !== workspacePath) return
      if (!loaded) {
        showPicker()
        return
      }
      route.navigate(routeForWorkspaceOpen(loaded.setupStatus, options?.route))
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
        setPickerReturnSessionId(currentRoute.sessionID)
      } else {
        setPickerReturnSessionId(undefined)
      }
      setPickerRequested(true)
      route.navigate({ type: "workspace" })
    }

    const refresh = async (): Promise<void> => {
      if (!activePath()) return
      try {
        await refetchMeta()
      } catch (error) {
        tuiLog(`workspace refresh failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const setLastRoute = (sessionId: string, goalPath: string) => {
      kv.set(SPINOSA_LAST_SESSION_KV, sessionId)
      kv.set(SPINOSA_LAST_GOAL_KV, goalPath)
    }

    return {
      get activePath() {
        return activePath()
      },
      get genericMode() {
        return genericMode()
      },
      get meta(): SpinosaWorkspaceMeta | undefined {
        return genericMode() ? undefined : meta()
      },
      get loading() {
        return meta.loading
      },
      get pickerRequested() {
        return pickerRequested()
      },
      get pendingPrompt(): PromptInfo | undefined {
        const pending = pendingPrompt()
        return pending !== undefined && pending.workspacePath === activePath() ? pending.prompt : undefined
      },
      openWorkspace,
      useGenericMode,
      showPicker,
      clearPickerRequest() {
        setPickerRequested(false)
      },
      restorePickerRoute() {
        const sessionID = pickerReturnSessionId()
        setPickerReturnSessionId(undefined)
        route.navigate(sessionID ? { type: "workspace", sessionID } : { type: "workspace" })
      },
      refresh,
      setLastRoute,
      queuePrompt(prompt: PromptInfo, targetWorkspacePath?: string) {
        const workspacePath = targetWorkspacePath ?? activePath()
        if (workspacePath) setPendingPrompt({ workspacePath, prompt })
      },
      consumePendingPrompt() {
        const pending = pendingPrompt()
        const prompt = pending !== undefined && pending.workspacePath === activePath() ? pending.prompt : undefined
        setPendingPrompt(undefined)
        return prompt
      },
    }
  },
})
