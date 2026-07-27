import { expect, test } from "bun:test"
import { copyProviderAuthorizationCode } from "../../src/util/provider-authorization-code"

const authorization = { instructions: "Use code ABCD-1234", url: "https://example.test" } as never

test("reports success only after copying the provider authorization code", async () => {
  let copied = ""
  expect(await copyProviderAuthorizationCode(authorization, async (text) => { copied = text })).toBe(true)
  expect(copied).toBe("ABCD-1234")
})

test("does not report success when the clipboard is unavailable or rejects", async () => {
  expect(await copyProviderAuthorizationCode(authorization, undefined)).toBe(false)
  await expect(copyProviderAuthorizationCode(authorization, async () => { throw new Error("clipboard failed") })).rejects.toThrow("clipboard failed")
})
