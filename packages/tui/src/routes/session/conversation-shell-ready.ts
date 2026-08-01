/** When the conversation boot overlay can dismiss (session synced + shell mounted). */
export function isConversationShellReady(input: {
  hasSession: boolean
  promptVisible: boolean
  promptMounted: boolean
}): boolean {
  if (!input.hasSession) return false
  if (!input.promptVisible) return true
  return input.promptMounted
}

/**
 * Session mounts call session.get; a miss normally returns Home.
 * While the boot overlay is up and sync already has the session, treat the miss
 * as transient (create/navigate race) instead of bouncing.
 */
export function shouldBounceMissingSession(input: {
  conversationBooting: boolean
  hasLocalSession: boolean
}): boolean {
  if (input.conversationBooting && input.hasLocalSession) return false
  return true
}
