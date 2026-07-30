// Spinosa product entrypoint for local development.
// Spawns the kernel CLI with SPINOSA_TEMPLATE_ROOT set to the repo root.
import { fileURLToPath } from "node:url"

const kernelDirectory = fileURLToPath(new URL("../../spinosa-kernel", import.meta.url))
const kernelEntry = fileURLToPath(new URL("../../spinosa-kernel/src/index.ts", import.meta.url))
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))

process.env.SPINOSA_PRODUCT = "1"
process.env.SPINOSA_TEMPLATE_ROOT ??= repoRoot

const args = process.argv.slice(2)
const child = Bun.spawn([process.execPath, "run", kernelEntry, ...args], {
  cwd: kernelDirectory,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
})
process.exitCode = await child.exited
