import type { RGBA } from "@opentui/core"
import type { Theme } from "../../context/theme"

export function inputSummary(tool: string, input: Record<string, unknown>): string {
  if (tool === "bash") return `$ ${String(input.command ?? "").slice(0, 50)}`
  if (tool === "read" || tool === "edit" || tool === "write") {
    const path = String(input.filePath ?? input.file_path ?? "")
    return (path.split(/[\\/]/).pop() ?? "").slice(0, 50)
  }
  if (tool === "grep" || tool === "glob") return `"${String(input.pattern ?? "").slice(0, 40)}"`
  if (tool === "webfetch") return String(input.url ?? "").slice(0, 50)
  if (tool === "websearch") return String(input.query ?? "").slice(0, 50)
  if (tool === "task") return String(input.description ?? "").slice(0, 50)
  if (tool === "question") return `Ask ${Array.isArray(input.questions) ? input.questions.length : 0} questions`
  return JSON.stringify(input).slice(0, 50)
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function toolCalloutColor(tool: string, theme: Theme): RGBA {
  const map: Record<string, RGBA> = {
    bash: theme.secondary,
    read: theme.success,
    grep: theme.primary,
    glob: theme.warning,
    webfetch: theme.info,
    websearch: theme.info,
    write: theme.accent,
    edit: theme.accent,
    apply_patch: theme.error,
    todowrite: theme.textMuted,
    task: theme.textMuted,
    skill: theme.info,
    question: theme.warning,
  }
  return map[tool] ?? theme.textMuted
}
