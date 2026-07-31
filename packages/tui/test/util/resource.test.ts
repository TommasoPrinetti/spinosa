import { describe, expect, test } from "bun:test"
import { createRoot, createResource } from "solid-js"
import { safeResourceValue } from "../../src/util/resource"

describe("safeResourceValue", () => {
  test("returns value when ready", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const [resource] = createResource(async () => "ok")
        const check = () => {
          if (resource.loading) return setTimeout(check, 5)
          try {
            expect(safeResourceValue(resource)).toBe("ok")
            dispose()
            resolve()
          } catch (error) {
            dispose()
            reject(error)
          }
        }
        setTimeout(check, 5)
      })
    })
  })

  test("returns undefined instead of throwing when errored", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const [resource] = createResource(async () => {
          throw Object.assign(new Error("ENOENT: missing"), { code: "ENOENT" })
        })
        const check = () => {
          if (resource.loading) return setTimeout(check, 5)
          try {
            expect(resource.error).toBeTruthy()
            expect(() => resource()).toThrow(/ENOENT/)
            expect(safeResourceValue(resource)).toBeUndefined()
            dispose()
            resolve()
          } catch (error) {
            dispose()
            reject(error)
          }
        }
        setTimeout(check, 5)
      })
    })
  })
})
