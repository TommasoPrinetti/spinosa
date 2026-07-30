import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const previousHome = process.env.SPINOSA_HOME
const isolatedHome = mkdtempSync(path.join(tmpdir(), "spinosa-test-home-"))
process.env.SPINOSA_HOME = isolatedHome

process.on("beforeExit", () => {
  try {
    rmSync(isolatedHome, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors on exit
  }
  if (previousHome === undefined) delete process.env.SPINOSA_HOME
  else process.env.SPINOSA_HOME = previousHome
})
