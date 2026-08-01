import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { generateAddPrompt } from "../src/commands/startup"

describe("generateAddPrompt", () => {
  test("points at mapper add protocol and does not re-trigger full startup", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "spinosa-add-prompt-"))
    try {
      mkdirSync(path.join(root, "raw"), { recursive: true })
      writeFileSync(path.join(root, "raw", "a.md"), "# a\n")
      const prompt = await generateAddPrompt(root, "spinosa")
      expect(prompt).toContain("incremental add — NOT full startup indexing")
      expect(prompt).toContain("Do not invoke spinosa-overseer or agent-interception")
      expect(prompt).toContain(".agents/skills/spinosa-mapper/SKILL.md")
      expect(prompt).toContain("extraction_{batch_id}.md")
      expect(prompt).toContain("spinosa-mapper Phase 2 (map_write)")
      expect(prompt).not.toContain("startup-prompt.md (for extraction format")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
