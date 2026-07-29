import { describe, expect, test } from "bun:test"
import {
  APPROVED_PUBLISH_PACKAGES,
  KERNEL_RELEASE_TARGETS,
  createKernelPackageManifest,
  createPlatformPackageManifest,
  npmTagForVersion,
  platformPackageName,
  publishManifestErrors,
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

  test("generates valid deterministic publish manifests", () => {
    for (const target of KERNEL_RELEASE_TARGETS) {
      const manifest = createPlatformPackageManifest("@spinosa/kernel", "1.2.3-beta.4", target)
      expect(publishManifestErrors(manifest, "1.2.3-beta.4")).toEqual([])
    }

    const optionalDependencies = Object.fromEntries(APPROVED_PUBLISH_PACKAGES.slice(1).map((name) => [name, "1.2.3-beta.4"]))
    const manifest = createKernelPackageManifest("1.2.3-beta.4", optionalDependencies)
    expect(publishManifestErrors(manifest, "1.2.3-beta.4")).toEqual([])
    expect(manifest.bin).toEqual({ spinosa: "./bin/spinosa" })
    expect(manifest.files).toEqual(["bin", "README.md", "LICENSE"])
    expect("scripts" in manifest).toBe(false)
  })

  test("rejects workspace and git dependency leakage", () => {
    const optionalDependencies = Object.fromEntries(APPROVED_PUBLISH_PACKAGES.slice(1).map((name) => [name, "1.2.3-beta.4"]))
    const manifest = {
      ...createKernelPackageManifest("1.2.3-beta.4", optionalDependencies),
      dependencies: {
        workspace: "workspace:*",
        git: "git+https://github.com/example/private.git",
      },
    }
    expect(publishManifestErrors(manifest, "1.2.3-beta.4")).toEqual([
      "dependencies.workspace contains forbidden release dependency workspace:*",
      "dependencies.git contains forbidden release dependency git+https://github.com/example/private.git",
    ])
  })

  test("requires exact platform optional dependency versions", () => {
    const optionalDependencies = Object.fromEntries(APPROVED_PUBLISH_PACKAGES.slice(1).map((name) => [name, "1.2.3-beta.4"]))
    optionalDependencies["@spinosa/kernel-linux-x64"] = "1.2.3"
    const manifest = createKernelPackageManifest("1.2.3-beta.4", optionalDependencies)
    expect(publishManifestErrors(manifest, "1.2.3-beta.4")).toContain(
      "optionalDependencies.@spinosa/kernel-linux-x64 must equal 1.2.3-beta.4",
    )
  })

  test("rejects an npm postinstall lifecycle hook", () => {
    const optionalDependencies = Object.fromEntries(APPROVED_PUBLISH_PACKAGES.slice(1).map((name) => [name, "1.2.3-beta.4"]))
    const manifest = {
      ...createKernelPackageManifest("1.2.3-beta.4", optionalDependencies),
      scripts: {
        postinstall: "",
      },
    }
    expect(publishManifestErrors(manifest, "1.2.3-beta.4")).toContain(
      "published manifest must not define a postinstall script",
    )
  })
})
