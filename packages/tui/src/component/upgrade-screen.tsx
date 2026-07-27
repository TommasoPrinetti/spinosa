import { createSignal } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { existsSync } from "node:fs"
import * as path from "node:path"
import { useTheme } from "../context/theme"
import { useBindings } from "../keymap"
import type { AutoUpgradeResult, UpgradeResult } from "@spinosa/core/commands/upgrade"
import { resolveFrameworkRoot } from "@spinosa/core/framework/discovery"
import { Spinner } from "./spinner"

type Phase = "prompt" | "installing" | "workspace_prompt" | "updating_workspaces" | "success" | "failed"

export type UpgradeScreenProps = {
  upgrade: AutoUpgradeResult
  onClose: () => void
}

export function UpgradeScreen(props: UpgradeScreenProps) {
  const { theme } = useTheme()
  const [phase, setPhase] = createSignal<Phase>("prompt")
  const [phaseMessage, setPhaseMessage] = createSignal("")
  const [result, setResult] = createSignal<UpgradeResult | null>(null)
  const [wsUpdated, setWsUpdated] = createSignal(0)
  const [wsTotal, setWsTotal] = createSignal(0)

  const startUpgrade = async () => {
    setPhase("installing")
    setPhaseMessage("Starting...")
    try {
      const { upgradeFramework } = await import("@spinosa/core/commands/upgrade")
      const res = await upgradeFramework({
        version: props.upgrade.latestVersion,
        yes: true,
        suppressInstallOutput: true,
        onPhase: (_phase, detail) => setPhaseMessage(detail),
      })
      setResult(res)
      if (!res.success) {
        setPhase("failed")
        return
      }
      if (res.workspaceUpgradesNeeded.length > 0) {
        setPhase("workspace_prompt")
      } else {
        setPhase("success")
      }
    } catch (err) {
      setResult(null)
      setPhase("failed")
      setPhaseMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const updateWorkspaces = async () => {
    const r = result()
    if (!r) return
    setPhase("updating_workspaces")
    setWsTotal(r.workspaceUpgradesNeeded.length)
    setWsUpdated(0)
    const fwRoot = resolveFrameworkRoot()
    if (!fwRoot) { setPhase("success"); return }
    const { updateWorkspace } = await import("@spinosa/core/commands/update")
    for (const ws of r.workspaceUpgradesNeeded) {
      setPhaseMessage(ws)
      const wsFile = path.join(ws, ".spinosa", "workspace")
      if (!existsSync(wsFile)) {
        setWsUpdated((n) => n + 1)
        continue
      }
      try {
        await updateWorkspace({ workspacePath: ws, frameworkRoot: fwRoot })
      } catch { /* best-effort */ }
      setWsUpdated((n) => n + 1)
    }
    setPhase("success")
  }

  useBindings(() => {
    if (phase() !== "prompt") return { bindings: [] }
    return {
      bindings: [
        { key: "y", desc: "Yes, update", group: "Upgrade", cmd: startUpgrade },
        { key: "n", desc: "No, skip", group: "Upgrade", cmd: props.onClose },
        { key: "escape", desc: "Skip", group: "Upgrade", cmd: props.onClose },
      ],
    }
  })

  useBindings(() => {
    if (phase() !== "workspace_prompt") return { bindings: [] }
    return {
      bindings: [
        { key: "y", desc: "Yes, update workspaces", group: "Upgrade", cmd: updateWorkspaces },
        { key: "n", desc: "No, skip workspace update", group: "Upgrade", cmd: () => setPhase("success") },
        { key: "escape", desc: "Skip workspace update", group: "Upgrade", cmd: () => setPhase("success") },
      ],
    }
  })

  useBindings(() => {
    if (phase() !== "success" && phase() !== "failed") return { bindings: [] }
    return {
      bindings: [
        { key: "return", desc: "Close", group: "Upgrade", cmd: props.onClose },
        { key: "escape", desc: "Close", group: "Upgrade", cmd: props.onClose },
      ],
    }
  })

  return (
    <box
      width="100%"
      height="100%"
      alignItems="center"
      justifyContent="center"
      backgroundColor={theme.background}
    >
      <box
        flexDirection="column"
        width={60}
        paddingLeft={4}
        paddingRight={4}
        paddingTop={3}
        paddingBottom={2}
        gap={1}
      >
        {phase() === "prompt" && (
          <>
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
              Update Available
            </text>
            <text fg={theme.textMuted}>
              Spinosa v{props.upgrade.latestVersion} is available
            </text>
            <text fg={theme.textMuted}>(current: v{props.upgrade.currentVersion}). Update now?</text>
            <box flexDirection="row" gap={2} paddingTop={1}>
              <box
                paddingLeft={3}
                paddingRight={3}
                backgroundColor={theme.primary}
                onMouseUp={startUpgrade}
              >
                <text fg={theme.selectedListItemText}>Yes</text>
              </box>
              <box
                paddingLeft={3}
                paddingRight={3}
                backgroundColor={theme.backgroundElement}
                onMouseUp={props.onClose}
              >
                <text fg={theme.text}>No</text>
              </box>
            </box>
            <text fg={theme.textMuted} paddingTop={1}>
              y / n
            </text>
          </>
        )}

        {phase() === "installing" && (
          <>
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
              Upgrading Spinosa...
            </text>
            <box flexDirection="row" gap={1} paddingTop={1}>
              <Spinner />
              <text fg={theme.textMuted}>{phaseMessage()}</text>
            </box>
          </>
        )}

        {phase() === "workspace_prompt" && (
          <>
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
              Update Workspaces
            </text>
            <text fg={theme.textMuted}>
              {result()?.workspaceUpgradesNeeded.length} workspace(s) need updating to match the new framework version.
            </text>
            <text fg={theme.textMuted}>Update now?</text>
            <box flexDirection="row" gap={2} paddingTop={1}>
              <box
                paddingLeft={3}
                paddingRight={3}
                backgroundColor={theme.primary}
                onMouseUp={updateWorkspaces}
              >
                <text fg={theme.selectedListItemText}>Yes</text>
              </box>
              <box
                paddingLeft={3}
                paddingRight={3}
                backgroundColor={theme.backgroundElement}
                onMouseUp={() => setPhase("success")}
              >
                <text fg={theme.text}>No</text>
              </box>
            </box>
            <text fg={theme.textMuted} paddingTop={1}>y / n</text>
          </>
        )}

        {phase() === "updating_workspaces" && (
          <>
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
              Updating Workspaces
            </text>
            <text fg={theme.textMuted}>
              {wsUpdated()}/{wsTotal()} — {phaseMessage()}
            </text>
            <box flexDirection="row" gap={1} paddingTop={1}>
              <Spinner />
              <text fg={theme.textMuted}>Updating workspace files...</text>
            </box>
          </>
        )}

        {(phase() === "success" || phase() === "failed") && (
          <>
            <text
              attributes={TextAttributes.BOLD}
              fg={phase() === "success" ? theme.success : theme.error}
            >
              {phase() === "success" ? "✓ Upgrade Complete" : "✗ Upgrade Failed"}
            </text>
            {phase() === "success" && (
              <text fg={theme.textMuted}>
                Restart Spinosa to use v{result()?.newVersion ?? props.upgrade.latestVersion}.
              </text>
            )}
            {phase() === "failed" && (
              <text fg={theme.textMuted}>
                {phaseMessage() || 'Run "spinosa upgrade" manually.'}
              </text>
            )}
            <box paddingTop={1}>
              <box
                paddingLeft={3}
                paddingRight={3}
                backgroundColor={theme.primary}
                onMouseUp={props.onClose}
              >
                <text fg={theme.selectedListItemText}>Close</text>
              </box>
            </box>
          </>
        )}
      </box>
    </box>
  )
}
