import { describe, expect, test } from "bun:test"
import { createSpinosaClient as createV1Client } from "../src/client"
import { createSpinosaClient as createV2Client } from "../src/v2/client"

function capture() {
  let request: Request | undefined
  return {
    fetch: async (input: Request) => {
      request = input
      return new Response("{}", { headers: { "content-type": "application/json" } })
    },
    request: () => request,
  }
}

describe("SDK location headers", () => {
  test("v2 retains Spinosa location headers for writes", async () => {
    const seen = capture()
    const client = createV2Client({
      baseUrl: "http://localhost",
      directory: "/tmp/spinosa project",
      experimental_workspaceID: "wrk_spinosa",
      fetch: seen.fetch,
    })

    await client.session.create()

    expect(seen.request()?.headers.get("x-spinosa-directory")).toBe(encodeURIComponent("/tmp/spinosa project"))
    expect(seen.request()?.headers.get("x-spinosa-workspace")).toBe("wrk_spinosa")
  })

  test("v2 rewrites legacy location headers for reads", async () => {
    const seen = capture()
    const client = createV2Client({
      baseUrl: "http://localhost",
      headers: {
        "x-opencode-directory": encodeURIComponent("/tmp/legacy project"),
        "x-opencode-workspace": "wrk_legacy",
      },
      fetch: seen.fetch,
    })

    await client.session.list()

    const request = seen.request()!
    const url = new URL(request.url)
    expect(url.searchParams.get("directory")).toBe("/tmp/legacy project")
    expect(url.searchParams.get("workspace")).toBe("wrk_legacy")
    expect(request.headers.has("x-opencode-directory")).toBe(false)
    expect(request.headers.has("x-opencode-workspace")).toBe(false)
  })

  test("v1 rewrites legacy directory headers for reads", async () => {
    const seen = capture()
    const client = createV1Client({
      baseUrl: "http://localhost",
      headers: { "x-opencode-directory": encodeURIComponent("/tmp/legacy project") },
      fetch: seen.fetch,
    })

    await client.session.list()

    const request = seen.request()!
    expect(new URL(request.url).searchParams.get("directory")).toBe("/tmp/legacy project")
    expect(request.headers.has("x-opencode-directory")).toBe(false)
  })
})
