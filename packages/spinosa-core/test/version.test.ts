import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import {
  compareFrameworkVersions,
  isDowngrade,
  isLegacyDevWorkspaceVersion,
  isPrereleaseFrameworkVersion,
  isSameVersion,
  isUpgrade,
  normalizeFrameworkVersion,
  parseInstallPinnedVersion,
  releaseChannel,
} from "../src/utils/version"

const versionArbitrary = fc.oneof(
  fc.tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 20 }))
    .map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
  fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 30 }))
    .map(([major, minor, patch, pre]) => `${major}.${minor}.${patch}-beta.${pre}`),
)

describe("compareFrameworkVersions", () => {
  test("handles equality for released versions", () => {
    expect(compareFrameworkVersions("1.0.2", "1.0.2")).toBe(0)
  })

  test("compares released version against prerelease", () => {
    expect(compareFrameworkVersions("1.0.2", "1.0.2-beta.14")).toBe(1)
    expect(compareFrameworkVersions("1.0.2-beta.14", "1.0.2")).toBe(-1)
  })

  test("handles equality for prerelease versions", () => {
    expect(compareFrameworkVersions("1.0.2-beta.14", "1.0.2-beta.14")).toBe(0)
  })

  test("compares numeric prerelease tokens correctly", () => {
    expect(compareFrameworkVersions("1.0.2-beta.9", "1.0.2-beta.10")).toBe(-1)
    expect(compareFrameworkVersions("1.0.2-beta.10", "1.0.2-beta.9")).toBe(1)
    expect(compareFrameworkVersions("1.0.2-beta.14", "1.0.2-beta.11")).toBe(1)
  })

  test("compares prerelease lengths", () => {
    expect(compareFrameworkVersions("1.0.2-beta.1", "1.0.2-beta.1.0")).toBe(-1)
    expect(compareFrameworkVersions("1.0.2-beta.1.0", "1.0.2-beta.1")).toBe(1)
  })

  test("compares core version segments", () => {
    expect(compareFrameworkVersions("1.0.3", "1.0.2")).toBe(1)
    expect(compareFrameworkVersions("1.1.0", "1.0.9")).toBe(1)
    expect(compareFrameworkVersions("2.0.0", "1.9.9")).toBe(1)
  })

  test("strips v prefix", () => {
    expect(compareFrameworkVersions("v1.0.2", "v1.0.2")).toBe(0)
    expect(compareFrameworkVersions("v1.0.3", "1.0.2")).toBe(1)
  })

  test("handles dev placeholder", () => {
    expect(compareFrameworkVersions("dev", "dev")).toBe(0)
    expect(compareFrameworkVersions("dev", "1.0.0")).toBe(-1)
    expect(compareFrameworkVersions("1.0.0", "dev")).toBe(1)
  })

  test("returns undefined for invalid inputs", () => {
    expect(compareFrameworkVersions(undefined, "1.0.0")).toBeUndefined()
    expect(compareFrameworkVersions("1.0.0", undefined)).toBeUndefined()
    expect(compareFrameworkVersions("unknown", "1.0.0")).toBeUndefined()
    expect(compareFrameworkVersions("not-a-version", "1.0.0")).toBeUndefined()
  })

  test("refuses downgrade scenarios", () => {
    expect(compareFrameworkVersions("1.0.2-beta.14", "1.0.2-beta.3")! > 0).toBe(true)
    expect(compareFrameworkVersions("1.0.2-beta.11", "1.0.2-beta.14")! < 0).toBe(true)
  })
})

describe("normalizeFrameworkVersion", () => {
  test("strips leading v", () => {
    expect(normalizeFrameworkVersion("v1.0.2")).toBe("1.0.2")
    expect(normalizeFrameworkVersion("V1.0.2")).toBe("1.0.2")
  })

  test("trims whitespace", () => {
    expect(normalizeFrameworkVersion("  1.0.2  ")).toBe("1.0.2")
  })

  test("handles undefined", () => {
    expect(normalizeFrameworkVersion(undefined)).toBe("")
  })
})

describe("isLegacyDevWorkspaceVersion", () => {
  test("matches dev markers", () => {
    expect(isLegacyDevWorkspaceVersion("dev")).toBe(true)
    expect(isLegacyDevWorkspaceVersion("vdev")).toBe(true)
    expect(isLegacyDevWorkspaceVersion("DEV")).toBe(true)
  })

  test("rejects real versions", () => {
    expect(isLegacyDevWorkspaceVersion("1.0.2")).toBe(false)
    expect(isLegacyDevWorkspaceVersion("")).toBe(false)
    expect(isLegacyDevWorkspaceVersion(undefined)).toBe(false)
  })
})

describe("isPrereleaseFrameworkVersion", () => {
  test("matches prerelease shape", () => {
    expect(isPrereleaseFrameworkVersion("1.0.2-beta.14")).toBe(true)
    expect(isPrereleaseFrameworkVersion("v1.0.2-beta.1")).toBe(true)
  })

  test("rejects released versions", () => {
    expect(isPrereleaseFrameworkVersion("1.0.2")).toBe(false)
    expect(isPrereleaseFrameworkVersion("dev")).toBe(false)
  })

  test("rejects malformed inputs", () => {
    expect(isPrereleaseFrameworkVersion("")).toBe(false)
    expect(isPrereleaseFrameworkVersion(undefined)).toBe(false)
    expect(isPrereleaseFrameworkVersion("1.0.2-")).toBe(false)
  })
})

describe("parseInstallPinnedVersion", () => {
  test("extracts PINNED_VERSION from a script", () => {
    const script = '#!/bin/sh\nPINNED_VERSION="1.0.2-beta.14"\nPINNED_TAG="beta"\n'
    expect(parseInstallPinnedVersion(script)).toBe("1.0.2-beta.14")
  })

  test("returns undefined when missing", () => {
    expect(parseInstallPinnedVersion("#!/bin/sh\necho hi")).toBeUndefined()
    expect(parseInstallPinnedVersion(undefined)).toBeUndefined()
    expect(parseInstallPinnedVersion("")).toBeUndefined()
  })
})

describe("semver helpers", () => {
  test("isUpgrade detects newer targets", () => {
    expect(isUpgrade("1.0.2-beta.9", "1.0.2-beta.10")).toBe(true)
    expect(isUpgrade("1.0.2-beta.14", "1.0.2")).toBe(true)
    expect(isUpgrade("1.0.2", "1.0.2-beta.14")).toBe(false)
  })

  test("isDowngrade detects older targets", () => {
    expect(isDowngrade("1.0.2-beta.14", "1.0.2-beta.12")).toBe(true)
    expect(isDowngrade("1.0.2", "1.0.2-beta.14")).toBe(true)
    expect(isDowngrade("1.0.2-beta.12", "1.0.2-beta.14")).toBe(false)
  })

  test("isSameVersion detects equality", () => {
    expect(isSameVersion("v1.0.2", "1.0.2")).toBe(true)
    expect(isSameVersion("1.0.2-beta.14", "1.0.2-beta.14")).toBe(true)
    expect(isSameVersion("1.0.2", "1.0.3")).toBe(false)
  })

  test("releaseChannel maps prerelease to beta", () => {
    expect(releaseChannel("1.0.2")).toBe("stable")
    expect(releaseChannel("1.0.2-beta.14")).toBe("beta")
    expect(releaseChannel("dev")).toBe("stable")
  })
})

describe("compareFrameworkVersions properties", () => {
  test("comparison is reflexive for valid versions", () => {
    fc.assert(
      fc.property(versionArbitrary, (version) => {
        expect(compareFrameworkVersions(version, version)).toBe(0)
      }),
    )
  })

  test("comparison is antisymmetric for valid versions", () => {
    fc.assert(
      fc.property(versionArbitrary, versionArbitrary, (left, right) => {
        const forward = compareFrameworkVersions(left, right)
        const reverse = compareFrameworkVersions(right, left)
        if (forward === undefined || reverse === undefined) return true
        if (forward === 0) return reverse === 0
        return forward === -reverse
      }),
    )
  })
})
