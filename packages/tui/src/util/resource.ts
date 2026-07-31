import type { Resource } from "solid-js"

/**
 * Read a Solid `createResource` value without throwing when the resource is errored.
 *
 * Solid's resource accessor rethrows on read after a rejected fetcher
 * (`if (err !== undefined && !pr) throw err`). That can escape dialog/render
 * trees and hard-abort the TUI (mouse mode left on). Prefer this helper (or a
 * fetcher that never rejects) before calling `resource()` in UI memos.
 */
export function safeResourceValue<T>(resource: Resource<T>): T | undefined {
  if (resource.error !== undefined) return undefined
  return resource()
}
