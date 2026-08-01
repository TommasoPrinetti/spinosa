import type { SpinosaSetupStatus } from "./types"

/**
 * Esc/Back from onboarding should land on global Home chips when the active
 * workspace is not ready. Keep a ready workspace when canceling a brand-new
 * create started from that workspace (`n` then Esc).
 */
export function shouldClearActiveOnOnboardingCancel(input: {
  isResume: boolean
  activePath?: string
  setupStatus?: SpinosaSetupStatus
}): boolean {
  if (input.isResume) return input.setupStatus !== "workspace_started"
  if (!input.activePath) return false
  return input.setupStatus !== undefined && input.setupStatus !== "workspace_started"
}
