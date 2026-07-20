import { expect, test } from "bun:test"

test("registers /session as an alias for switching sessions", async () => {
  const source = await Bun.file(new URL("../src/app.tsx", import.meta.url)).text()
  const sessionListCommand = source.match(/name: "session\.list",[\s\S]*?\n      },/)

  expect(sessionListCommand?.[0]).toContain('slashAliases: ["session", "resume", "continue"]')
})
