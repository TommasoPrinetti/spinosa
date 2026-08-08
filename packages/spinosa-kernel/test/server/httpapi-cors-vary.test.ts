import { afterEach, describe, expect, test } from "bun:test"
import { Server } from "../../src/server/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances } from "../fixture/fixture"

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

function app() {
  return Server.Default().app
}

const PREFLIGHT_HEADERS = {
  origin: "http://localhost:3000",
  "access-control-request-method": "POST",
  "access-control-request-headers": "content-type, x-opencode-directory",
}

function preflight(options: RequestInit) {
  return app().request("/global/config", { ...options, method: "OPTIONS" })
}

// effect-smol's HttpMiddleware.cors overwrites `Vary: Origin` with
// `Vary: Access-Control-Request-Headers` on OPTIONS preflight responses
// (the two share the same record key during the spread). With dynamic
// origin echoing, missing Vary: Origin lets shared caches serve a preflight
// cached for one origin against a different origin. corsVaryFixLayer
// restores the merged form.
describe("CORS preflight Vary header", () => {
  test("denies preflight from foreign localhost origin", async () => {
    const response = await preflight({ headers: PREFLIGHT_HEADERS })

    expect([200, 204]).toContain(response.status)
    // a page served from localhost:3000 must NOT get CORS access to this
    // server (arbitrary localhost pages are the attack surface this locks down)
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  test("allows same-origin preflight and keeps Vary: Origin + Access-Control-Request-Headers", async () => {
    const response = await preflight({
      // origin host matches the request Host header -> allowed
      headers: { ...PREFLIGHT_HEADERS, host: "localhost:3000" },
    })

    expect([200, 204]).toContain(response.status)
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000")
    const vary = (response.headers.get("vary") ?? "").toLowerCase()
    expect(vary).toContain("origin")
    expect(vary).toContain("access-control-request-headers")
  })

  test("does not duplicate Origin in Vary", async () => {
    const response = await preflight({
      headers: { ...PREFLIGHT_HEADERS, host: "localhost:3000" },
    })

    const vary = response.headers.get("vary") ?? ""
    const originCount = vary
      .split(",")
      .map((s: string) => s.trim().toLowerCase())
      .filter((s: string) => s === "origin").length
    expect(originCount).toBe(1)
  })
})