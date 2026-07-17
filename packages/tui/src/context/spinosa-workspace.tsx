import { createEffect, createSignal, createResource, onCleanup } from "solid-js"
import path from "node:path"
import { createSimpleContext } from "./helper"
import { useKV } from "./kv"
import { useRoute } from "./route"
import { useTuiPaths, useTuiStartup } from "./runtime"
import type { PromptInfo } from "../prompt/history"
import {
  routeForWorkspaceOpen,
  SPINOSA_ACTIVE_WORKSPACE_KV,
  SPINOSA_ACTIVE_WORKSPACE_ID_KV,
  SPINOSA_GENERIC_MODE_KV,
  SPINOSA_LAST_GOAL_KV,
  SPINOSA_LAST_SESSION_KV,
} from "../spinosa/entry"
import { isSpinosaWorkspace, readWorkspaceMeta } from "../spinosa/service"
import type { SpinosaWorkspaceMeta } from "../spinosa/types"
import { setActiveWorkspacePath, tuiLog } from "../spinosa/log"
import { parseWorkspaceID } from "../spinosa-core/workspace/identity"
import { recoverWorkspacePathByID } from "../spinosa-core/workspace/registry"
import { inspectRegisteredWorkspacePresence, inspectWorkspacePresence, isUsableWorkspacePresence } from "../spinosa-core/workspace/presence"
import { runSpinosaBootHealth, SPINOSA_BOOT_OPERATIONS, type SpinosaBootOperation } from "../spinosa-core/system/boot"
import type { RouteNavigateInput } from "./route"
export const { use: useSpinosaWorkspace, provider: SpinosaWorkspaceProvider } = createSimpleContext({
  name: "SpinosaWorkspace",
  init: () => {
    const kv = useKV()
    const route = useRoute()
    const paths = useTuiPaths()
    const startup = useTuiStartup()
    const cwdWorkspace = isSpinosaWorkspace(paths.cwd) ? paths.cwd : undefined
    const [activePath, setActivePath] = createSignal<string | undefined>()
    const [genericMode, setGenericMode] = createSignal(false)
    const [pickerRequested, setPickerRequested] = createSignal(false)
    const [pickerReturnSessionId, setPickerReturnSessionId] = createSignal<string | undefined>()
    const [pendingPrompt, setPendingPrompt] = createSignal<{ workspacePath: string; prompt: PromptInfo } | undefined>()
    const [bootOperations, setBootOperations] = createSignal<SpinosaBootOperation[]>(SPINOSA_BOOT_OPERATIONS.map((operation) => ({ ...operation })))
    let attemptedInitialWorkspaceHydration = false

    const [bootHealth] = createResource(async () => runSpinosaBootHealth({
      minimumOperationDurationMs: startup.skipInitialLoading ? 0 : 1_000,
      onProgress(operation) {
        setBootOperations((current) => current.map((candidate) => candidate.id === operation.id ? operation : candidate))
      },
    }))

    const [meta, { refetch: refetchMeta }] = createResource(activePath, async (workspacePath) => {
      if (!workspacePath || !isSpinosaWorkspace(workspacePath)) return undefined
      return readWorkspaceMeta(workspacePath).catch(() => undefined)
    })
    const openWorkspace = async (workspacePath: string, options?: { route?: RouteNavigateInput }) => {
      const presence = await inspectRegisteredWorkspacePresence(workspacePath).catch(() => undefined)
      if (presence && !isUsableWorkspacePresence(presence)) {
        showPicker()
        return
      }
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
        if (route.data.type !== "workspace" && route.data.type !== "visualizer") showPicker()
        return
      }
      kv.set(SPINOSA_ACTIVE_WORKSPACE_ID_KV, loaded.workspaceID)
      const nextRoute = options?.route
        ?? (route.data.type === "workspace" || route.data.type === "visualizer"
          ? route.data
          : routeForWorkspaceOpen(loaded.setupStatus, undefined, {
              workspacePath,
              sourceLocation: loaded.sourceLocation,
              workspaceName: loaded.projectName,
            }))
      route.navigate(nextRoute)
    }

    const cwdDiscoveryTimer = setInterval(() => {
      if (activePath() || genericMode() || !isSpinosaWorkspace(paths.cwd)) return
      void openWorkspace(paths.cwd)
    }, 3000)
    onCleanup(() => clearInterval(cwdDiscoveryTimer))

    const useGenericMode = () => {
      kv.set(SPINOSA_GENERIC_MODE_KV, true)
      kv.set(SPINOSA_ACTIVE_WORKSPACE_KV, undefined)
      kv.set(SPINOSA_ACTIVE_WORKSPACE_ID_KV, undefined)
      setActivePath(undefined)
      setGenericMode(true)
      setPickerRequested(false)
      route.navigate({ type: "global" })
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
      route.navigate({ type: "global" })
    }

    createEffect(() => {
      if (!kv.ready || bootHealth.loading || attemptedInitialWorkspaceHydration || activePath() || genericMode()) return
      if (startup.initialRoute || route.data.type !== "global" || route.data.prompt) {
        attemptedInitialWorkspaceHydration = true
        return
      }
      attemptedInitialWorkspaceHydration = true
      if (kv.get(SPINOSA_GENERIC_MODE_KV) === true) {
        setGenericMode(true)
        return
      }

      if (cwdWorkspace) {
        void openWorkspace(cwdWorkspace)
        return
      }

      const savedPath = kv.get(SPINOSA_ACTIVE_WORKSPACE_KV) as string | undefined
      const workspaceID = parseWorkspaceID(kv.get(SPINOSA_ACTIVE_WORKSPACE_ID_KV) as string | undefined)
      if (savedPath && isSpinosaWorkspace(savedPath)) {
        const savedPresence = inspectWorkspacePresence({ workspacePath: savedPath, workspaceID })
        if (isUsableWorkspacePresence(savedPresence)) {
          void openWorkspace(savedPath)
          return
        }
      }
      if (!workspaceID) return
      const recoveryRoots = [paths.cwd, ...(savedPath ? [path.dirname(savedPath)] : [])]
      void recoverWorkspacePathByID(workspaceID, recoveryRoots).then((recovered) => {
        if (recovered) return openWorkspace(recovered)
      }).catch(() => {})
    })

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
      get bootReady() {
        return !bootHealth.loading
      },
      get bootOperations() {
        return bootOperations()
      },
      get bootHealth() {
        return bootHealth()
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
        route.navigate(sessionID ? { type: "workspace", sessionID } : { type: "global" })
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
