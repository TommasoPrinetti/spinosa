import { describe, expect, test } from "bun:test"
import {
  APPROVED_PUBLISH_PACKAGES,
  KERNEL_RELEASE_TARGETS,
  npmTagForVersion,
  platformPackageName,
} from "./npm-release-config"

describe("npm release configuration", () => {
  test("defines the approved first-release package set", () => {
    expect(APPROVED_PUBLISH_PACKAGES).toEqual([
      "@spinosa/kernel",
      "@spinosa/kernel-darwin-arm64",
      "@spinosa/kernel-darwin-x64",
      "@spinosa/kernel-darwin-x64-baseline",
      "@spinosa/kernel-linux-arm64",
      "@spinosa/kernel-linux-x64",
      "@spinosa/kernel-linux-x64-baseline",
      "@spinosa/kernel-linux-arm64-musl",
      "@spinosa/kernel-linux-x64-musl",
      "@spinosa/kernel-linux-x64-baseline-musl",
    ])
  })

  test("keeps package naming aligned with the target matrix", () => {
    expect(KERNEL_RELEASE_TARGETS.map((target) => platformPackageName("@spinosa/kernel", target))).toEqual(
      APPROVED_PUBLISH_PACKAGES.slice(1),
    )
  })

  test("maps only supported product versions to npm dist-tags", () => {
    expect(npmTagForVersion("1.2.3")).toBe("latest")
    expect(npmTagForVersion("1.2.3-beta.4")).toBe("beta")
    expect(() => npmTagForVersion("1.2.3-rc.1")).toThrow("Unsupported product version")
  })
})
