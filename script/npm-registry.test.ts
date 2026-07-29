import { describe, expect, test } from "bun:test"
import { APPROVED_PUBLISH_PACKAGES } from "./npm-release-config"
import { assertPlatformPackagesPublished } from "./npm-registry"

const platformPackages = APPROVED_PUBLISH_PACKAGES.slice(1)
const version = "1.2.3-beta.4"

describe("npm platform package registry gate", () => {
  test("accepts exactly published platform packages", async () => {
    const calls: string[] = []
    await assertPlatformPackagesPublished(platformPackages, version, async (name, requestedVersion) => {
      calls.push(`${name}@${requestedVersion}`)
      return requestedVersion
    })
    expect(calls).toEqual(platformPackages.map((name) => `${name}@${version}`))
  })

  test("aggregates unavailable, mismatched, and failed lookups", async () => {
    const unavailable = platformPackages[0]
    const mismatched = platformPackages[1]
    const failed = platformPackages[2]
    const promise = assertPlatformPackagesPublished(platformPackages, version, async (name) => {
      if (name === unavailable) return
      if (name === mismatched) return "1.2.3"
      if (name === failed) throw new Error("registry timeout")
      return version
    })

    await expect(promise).rejects.toThrow(`${unavailable}@${version} is unavailable`)
    await expect(promise).rejects.toThrow(`${mismatched}@${version} resolved to 1.2.3`)
    await expect(promise).rejects.toThrow(`${failed}@${version} lookup failed: registry timeout`)
  })

  test("retries the complete gate before failing closed", async () => {
    let calls = 0
    await assertPlatformPackagesPublished(
      platformPackages,
      version,
      async () => {
        calls++
        return calls > platformPackages.length ? version : undefined
      },
      {
        attempts: 2,
        retryDelayMs: 0,
        sleep: async () => {},
      },
    )
    expect(calls).toBe(platformPackages.length * 2)
  })
})
