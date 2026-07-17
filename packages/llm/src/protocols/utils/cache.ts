/** Shared helpers for provider cache-marker lowering. Anthropic and Bedrock both enforce a 4-breakpoint cap per request and accept the same `5m`/`1h` TTL buckets. */

export interface Breakpoints {
  /** Remaining breakpoint budget for this request */
  remaining: number
  /** Count of breakpoints silently dropped due to cap */
  dropped: number
}

/** Create a fresh breakpoint counter with the given capacity */
export const newBreakpoints = (cap: number): Breakpoints => ({ remaining: cap, dropped: 0 })

/** Map a TTL in seconds to the provider bucket: `"1h"` for >=3600, `undefined` for provider default (5m) */
export const ttlBucket = (ttlSeconds: number | undefined): "1h" | undefined =>
  ttlSeconds !== undefined && ttlSeconds >= 3600 ? "1h" : undefined
