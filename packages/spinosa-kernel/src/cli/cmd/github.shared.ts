import type { SessionV1 } from "@spinosa/kernel-core/v1/session"

export { parseGitHubRemote } from "@/util/repository"

/**
 * Orphan OpenCode cloud endpoints formerly used by the GitHub agent install/share flow.
 * Spinosa does not own these hosts. Do not treat them as Spinosa product URLs.
 * `spinosa github install` refuses until a medialab/spinosa action is published.
 */
export const GitHubApiURL = "https://api.opencode.ai" // orphan: OpenCode cloud, not Spinosa
export const GitHubDevShareURL = "https://dev.opencode.ai" // orphan: OpenCode cloud, not Spinosa

/**
 * Extracts displayable text from assistant response parts.
 * Returns null for non-text responses (signals summary needed).
 * Throws only for truly empty responses.
 */
export function extractResponseText(parts: SessionV1.Part[]): string | null {
  const textPart = parts.findLast((p) => p.type === "text")
  if (textPart) return textPart.text

  // Non-text parts (tools, reasoning, step-start/step-finish, etc.) - signal summary needed
  if (parts.length > 0) return null

  throw new Error("Failed to parse response: no parts returned")
}

/**
 * Formats a PROMPT_TOO_LARGE error message with details about files in the prompt.
 * Content is base64 encoded, so we calculate original size by multiplying by 0.75.
 */
export function formatPromptTooLargeError(files: { filename: string; content: string }[]): string {
  const fileDetails =
    files.length > 0
      ? `\n\nFiles in prompt:\n${files.map((f) => `  - ${f.filename} (${((f.content.length * 0.75) / 1024).toFixed(0)} KB)`).join("\n")}`
      : ""
  return `PROMPT_TOO_LARGE: The prompt exceeds the model's context limit.${fileDetails}`
}
