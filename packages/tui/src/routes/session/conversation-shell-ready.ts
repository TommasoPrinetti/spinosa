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
