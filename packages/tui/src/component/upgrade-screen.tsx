import { createSignal } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useBindings } from "../keymap"
import type { AutoUpgradeResult, UpgradeResult } from "../spinosa-core/commands/upgrade"
import { Spinner } from "./spinner"

type Phase = "prompt" | "installing" | "success" | "failed"

export type UpgradeScreenProps = {
  upgrade: AutoUpgradeResult
  onClose: () => void
}

export function UpgradeScreen(props: UpgradeScreenProps) {
  const { theme } = useTheme()
  const [phase, setPhase] = createSignal<Phase>("prompt")
  const [phaseMessage, setPhaseMessage] = createSignal("")
  const [result, setResult] = createSignal<UpgradeResult | null>(null)

  const startUpgrade = async () => {
    setPhase("installing")
    setPhaseMessage("Starting...")
    try {
      const { upgradeFramework } = await import("../spinosa-core/commands/upgrade")
      const res = await upgradeFramework({
        version: props.upgrade.latestVersion,
        yes: true,
        suppressInstallOutput: true,
        onPhase: (_phase, detail) => setPhaseMessage(detail),
      })
      setResult(res)
      setPhase(res.success ? "success" : "failed")
    } catch (err) {
      setResult(null)
      setPhase("failed")
      setPhaseMessage(err instanceof Error ? err.message : String(err))
    }
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
