import { describe, expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { spinosaLogInfo } from "../../src/spinosa-core/utils/log"
import { setActiveWorkspacePath, tuiLog } from "../../src/spinosa/log"

describe("Spinosa logging", () => {
  test("respects SPINOSA_HOME and avoids full workspace paths", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "spinosa-home")
    const workspace = path.join(tmp.path, "private", "workspace-name")
    try {
      setActiveWorkspacePath(workspace)
      tuiLog(`opened ${workspace}`)
      spinosaLogInfo("test", `workspacePath=${workspace}`)

      const tuiText = await Bun.file(path.join(process.env.SPINOSA_HOME, "logs", "tui.ndjson")).text()
      const coreText = await Bun.file(path.join(process.env.SPINOSA_HOME, "logs", "spinosa.log")).text()
      expect(tuiText).toContain('"ws":"workspace-name"')
      expect(tuiText).not.toContain(workspace)
      expect(coreText).toContain("component=test")
      expect(coreText).not.toContain(workspace)
    } finally {
      setActiveWorkspacePath(undefined)
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })
})
