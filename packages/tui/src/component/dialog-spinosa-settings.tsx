import { createMemo, createResource, createSignal, onMount } from "solid-js"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import { spinosaReleaseChannel, setReleaseChannel, type ReleaseChannel } from "@spinosa/core/system/channels"

type AutoUpdateMode = true | false | "notify"
type SettingsValue = "auto-true" | "auto-notify" | "auto-false" | "reset-skipped" | "channel-beta" | "channel-stable"
type GlobalConfig = Record<string, unknown> & {
  autoupdate?: boolean | "notify"
}

function normalizeAutoUpdate(value: GlobalConfig["autoupdate"]): AutoUpdateMode {
  if (value === true || value === false || value === "notify") return value
  return "notify"
}

export function DialogSpinosaSettings() {
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const kv = useKV()
  const { theme } = useTheme()
  const [currentChannel, setCurrentChannel] = createSignal<ReleaseChannel>("stable")

  onMount(async () => {
    dialog.setSize("medium")
    const ch = await spinosaReleaseChannel().catch(() => "stable" as ReleaseChannel)
    setCurrentChannel(ch)
  })

  const [config, { mutate }] = createResource<GlobalConfig>(async () => {
    const result = await sdk.client.global.config.get()
    if (result.error || !result.data) {
      throw new Error("Failed to load settings")
    }
    return result.data as GlobalConfig
  })

  const currentAutoUpdate = createMemo(() => normalizeAutoUpdate(config()?.autoupdate))
  const skippedVersion = createMemo(() => kv.get("skipped_version") as string | undefined)

  const updateAutoUpdate = async (value: AutoUpdateMode) => {
    const current = config()
    if (!current) return
    const result = await sdk.client.global.config.update({
      config: {
        ...current,
        autoupdate: value,
      },
    })

    if (result.error || !result.data) {
      toast.show({
        variant: "error",
        title: "Settings update failed",
        message: "Could not save settings.",
      })
      return
    }

    mutate(result.data as GlobalConfig)
    toast.show({
      variant: "success",
      message: "Settings updated",
    })
  }

  const updateChannel = async (channel: ReleaseChannel) => {
    await setReleaseChannel(channel)
    setCurrentChannel(channel)
    toast.show({
      variant: "success",
      message: `Release channel set to ${channel}`,
    })
  }

  const options = createMemo<DialogSelectOption<SettingsValue>[]>(() => [
    {
      title: "Install updates automatically",
      value: "auto-true",
      description: "Download and install updates when they become available.",
      category: "Updates",
      gutter: currentAutoUpdate() === true ? () => <text fg={theme.success}>✓</text> : undefined,
      onSelect: () => void updateAutoUpdate(true),
    },
    {
      title: "Notify before updating",
      value: "auto-notify",
      description: "Show update availability and let me choose when to update.",
      category: "Updates",
      gutter: currentAutoUpdate() === "notify" ? () => <text fg={theme.success}>✓</text> : undefined,
      onSelect: () => void updateAutoUpdate("notify"),
    },
    {
      title: "Disable automatic updates",
      value: "auto-false",
      description: "Don't check for or install updates automatically.",
      category: "Updates",
      gutter: currentAutoUpdate() === false ? () => <text fg={theme.success}>✓</text> : undefined,
      onSelect: () => void updateAutoUpdate(false),
    },
    {
      title: "Beta channel",
      value: "channel-beta",
      description: "Receive pre-release updates with the latest features.",
      category: "Release Channel",
      gutter: currentChannel() === "beta" ? () => <text fg={theme.success}>✓</text> : undefined,
      onSelect: () => void updateChannel("beta"),
    },
    {
      title: "Stable channel",
      value: "channel-stable",
      description: "Receive only stable, production-ready releases.",
      category: "Release Channel",
      gutter: currentChannel() === "stable" ? () => <text fg={theme.success}>✓</text> : undefined,
      onSelect: () => void updateChannel("stable"),
    },
    {
      title: "Show skipped update again",
      value: "reset-skipped",
      description: skippedVersion()
        ? `Previously skipped update v${skippedVersion()} will be shown again.`
        : "No dismissed update reminder is currently stored.",
      category: "Maintenance",
      onSelect: () => {
        if (!skippedVersion()) {
          toast.show({
            variant: "info",
            message: "No dismissed update reminder to reset.",
          })
          return
        }
        kv.set("skipped_version", undefined)
        toast.show({
          variant: "success",
          message: "Dismissed update reminder reset.",
        })
      },
    },
  ])

  return (
    <DialogSelect
      title="Settings"
      renderFilter={false}
      options={config() ? options() : []}
      emptyView={<text>{config.error ? "Failed to load settings." : "Loading settings\u2026"}</text>}
    />
  )
}
