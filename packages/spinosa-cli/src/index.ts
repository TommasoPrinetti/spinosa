// Spinosa product entrypoint for local development.
// Spawns the kernel CLI with SPINOSA_TEMPLATE_ROOT set to the repo root.
// Re-execs when launch preflight exits with code 10 after a successful upgrade.
import { fileURLToPath } from "node:url"
import { PREFLIGHT_RESTART_EXIT_CODE } from "@spinosa/core/commands/preflight"

const kernelDirectory = fileURLToPath(new URL("../../spinosa-kernel", import.meta.url))
const kernelEntry = fileURLToPath(new URL("../../spinosa-kernel/src/index.ts", import.meta.url))
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))

process.env.SPINOSA_PRODUCT = "1"
process.env.SPINOSA_TEMPLATE_ROOT ??= repoRoot

const args = process.argv.slice(2)
while (true) {
  const child = Bun.spawn([process.execPath, "run", kernelEntry, ...args], {
    cwd: kernelDirectory,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  })
  const exitCode = await child.exited
  if (exitCode === PREFLIGHT_RESTART_EXIT_CODE) {
    process.env.SPINOSA_UPGRADE_REEXEC = "1"
    continue
  }
  process.exitCode = exitCode
  break
}
