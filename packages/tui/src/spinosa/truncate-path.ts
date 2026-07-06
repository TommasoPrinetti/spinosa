export function truncatePathTail(filePath: string, maxLen = 48): string {
  if (filePath.length <= maxLen) return filePath
  const tail = filePath.slice(-(maxLen - 1))
  return `…${tail}`
}