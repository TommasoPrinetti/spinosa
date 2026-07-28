const hop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
])

function sanitize(out: Headers) {
  for (const key of hop) out.delete(key)
  // Incoming credentials authenticate the local Spinosa server and must never
  // cross a proxy trust boundary. A target-specific credential may still be
  // supplied explicitly through `extra` after sanitization.
  out.delete("authorization")
  out.delete("cookie")
  out.delete("origin")
  out.delete("referer")
  out.delete("accept-encoding")
  out.delete("x-spinosa-directory")
  out.delete("x-spinosa-workspace")
  out.delete("x-opencode-directory")
  out.delete("x-opencode-workspace")
}

export function headers(input: Request | HeadersInit | Record<string, string>, extra?: HeadersInit) {
  const raw = input instanceof Request ? input.headers : input
  const out = new Headers(raw instanceof Headers ? raw : Object.entries(raw as Record<string, string>))
  sanitize(out)
  if (!extra) return out
  for (const [key, value] of new Headers(extra).entries()) {
    out.set(key, value)
  }
  return out
}

export function websocketProtocols(input: Request | Record<string, string | undefined>) {
  const value = input instanceof Request ? input.headers.get("sec-websocket-protocol") : input["sec-websocket-protocol"]
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function websocketTargetURL(url: string | URL) {
  const next = new URL(url)
  if (next.protocol === "http:") next.protocol = "ws:"
  if (next.protocol === "https:") next.protocol = "wss:"
  return next.toString()
}

export * as ProxyUtil from "./proxy-util"
