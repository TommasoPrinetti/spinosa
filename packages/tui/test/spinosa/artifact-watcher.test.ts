import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "../fixture/fixture"
import { createWorkspaceFileWatcher } from "../../src/spinosa/artifact-watcher"

test("workspace watcher retries failed refreshes and never overlaps callbacks", async () => {
  await using tmp = await tmpdir()
  await mkdir(path.join(tmp.path, ".spinosa"), { recursive: true })
  await Bun.write(path.join(tmp.path, ".spinosa", "workspace"), "setup_status: cli_started\n")
  let calls = 0
  let active = 0
  let maxActive = 0
  const dispose = createWorkspaceFileWatcher(
    () => tmp.path,
    [".spinosa/workspace"],
    async () => {
      calls++
      active++
      maxActive = Math.max(maxActive, active)
      await Bun.sleep(12)
      active--
      if (calls === 1) throw new Error("retry me")
    },
    2,
  )

  for (let attempt = 0; attempt < 100 && (calls < 2 || active > 0); attempt++) {
    await Bun.sleep(5)
  }
  dispose()

  expect(calls).toBeGreaterThanOrEqual(2)
  expect(maxActive).toBe(1)
})
