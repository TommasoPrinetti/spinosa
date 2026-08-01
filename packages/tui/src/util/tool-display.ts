export function webSearchProviderLabel(provider: unknown) {
  if (provider === "parallel") return "Parallel Web Search"
  if (provider === "exa") return "Exa Web Search"
  return "Web Search"
}

export function toolDisplayMetadata(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {}
  if (!("status" in state) || state.status === "pending") return {}
  if (!("structured" in state) || !state.structured || typeof state.structured !== "object") return {}
  if (Array.isArray(state.structured)) return {}
  return state.structured as Record<string, unknown>
}

/** Prefer explicit input; fall back to a filePath captured in pending raw JSON. */
export function toolFilePath(input: Record<string, unknown>, partState?: unknown): string | undefined {
  const fromInput = input.filePath
  if (typeof fromInput === "string" && fromInput.length > 0) return fromInput

  if (!partState || typeof partState !== "object" || Array.isArray(partState)) return undefined
  if (!("status" in partState) || partState.status !== "pending") return undefined
  const raw = "raw" in partState && typeof partState.raw === "string" ? partState.raw : ""
  if (!raw) return undefined

  const match = raw.match(/"filePath"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (!match) return undefined
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return match[1]
  }
}

/** One visible line for sequential tool rows in the transcript. */
export function ellipsisToolLine(value: string, maxLength = 72): string {
  if (value.length <= maxLength) return value
  if (maxLength <= 1) return "…"
  const ellipsis = "…"
  const keepStart = Math.ceil((maxLength - ellipsis.length) / 2)
  const keepEnd = Math.floor((maxLength - ellipsis.length) / 2)
  return value.slice(0, keepStart) + ellipsis + value.slice(-keepEnd)
}
