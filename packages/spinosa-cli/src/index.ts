// Spinosa product entrypoint for local development.
// Spawns the kernel CLI with SPINOSA_TEMPLATE_ROOT set to the repo root.
import { fileURLToPath } from "node:url"
import { buildKernelBunArgv } from "@spinosa/core/system/bun-launch"

const kernelEntry = fileURLToPath(new URL("../../spinosa-kernel/src/index.ts", import.meta.url))
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))

process.env.SPINOSA_PRODUCT = "1"
process.env.SPINOSA_TEMPLATE_ROOT ??= repoRoot

const args = process.argv.slice(2)
const argv = buildKernelBunArgv({
  bunPath: process.execPath,
  // Monorepo root owns node_modules resolution for @opentui/solid/preload.
  // PWD stays the caller's directory so the TUI still opens the right project.
  frameworkRoot: repoRoot,
  kernelEntry,
  args,
})

const child = Bun.spawn(argv, {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
})
process.exitCode = await child.exited
