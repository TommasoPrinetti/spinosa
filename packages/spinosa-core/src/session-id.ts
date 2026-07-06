export function generateSessionId(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("")
  const hash = Math.random().toString(16).slice(2, 10)
  return `${stamp}-${hash}`
}
