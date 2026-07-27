import { describe, expect, test } from "bun:test"
import { readFile } from "fs/promises"

const legacyIdentifier = /open(?:code)(?:-ai)?|anomalyco/i

async function source(relative: string) {
  return readFile(new URL(relative, import.meta.url), "utf8")
}

describe("Spinosa identity cutover", () => {
  test("rejects legacy product identifiers in migration, lifecycle, and runtime boundaries", async () => {
    const boundaries = await Promise.all([
      source("../../core/src/global.ts"),
      source("../src/config/paths.ts"),
      source("../src/installation/index.ts"),
      source("../src/cli/cmd/upgrade.ts"),
      source("../src/cli/cmd/uninstall.ts"),
      source("../src/server/mdns.ts"),
    ])

    for (const content of boundaries) expect(content).not.toMatch(legacyIdentifier)
  })

  test("contains the OpenCode vendor identifier only in the Zen adapter boundary", async () => {
    const adapter = await source("../../core/src/plugin/provider/opencode-zen.ts")
    expect(adapter).toContain('label: "OpenCode Zen"')
    expect(adapter).toContain("ProviderV2.ID.opencode")
  })
})
