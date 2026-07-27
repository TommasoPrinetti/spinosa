import { afterEach, describe, expect, mock, test } from "bun:test"
import { resolvePinnedVersionFromInstaller } from "@spinosa/core/system/channels"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("spinosa system channels", () => {
  test("returns undefined when installer lookup fails before a response arrives", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("dns failure")
    }) as unknown as typeof fetch

    await expect(resolvePinnedVersionFromInstaller("stable", "https://example.invalid/install.sh")).resolves.toBeUndefined()
  })
})
