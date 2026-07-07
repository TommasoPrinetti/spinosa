export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function sanitizeYaml(value: string): string {
  return value.replace(/"/g, "'").replace(/\n/g, " ").trimEnd()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  let value = bytes / 1024
  let unit = "KB"
  if (value >= 1024) { value /= 1024; unit = "MB" }
  if (value >= 1024) { value /= 1024; unit = "GB" }
  return `${value.toFixed(1)} ${unit}`
}

export function pluralCount(count: number, singular: string, plural?: string): string {
  const form = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${count} ${form}`
}

export function joinBy(separator: string, ...parts: string[]): string {
  return parts.join(separator)
}
