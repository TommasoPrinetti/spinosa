import type { SpinosaSetupStatus } from "./types"

export function setupStatusLabel(status: SpinosaSetupStatus): string {
  switch (status) {
    case "not_started":
      return "Setup needed"
    case "cli_started":
      return "Ready to index"
    case "workspace_started":
      return "Ready"
    default:
      return "Unknown"
  }
}

export function setupStatusThemeKey(status: SpinosaSetupStatus): "success" | "info" | "warning" | "textMuted" {
  switch (status) {
    case "workspace_started":
      return "success"
    case "cli_started":
      return "info"
    case "not_started":
      return "warning"
    default:
      return "textMuted"
  }
}