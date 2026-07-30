// Spinosa owns the product entrypoint. Development delegates process execution
// to the inherited kernel so Bun evaluates its JSX under its native workspace.
import { fileURLToPath } from "node:url"

const kernelDirectory = fileURLToPath(new URL("../../spinosa-kernel", import.meta.url))
const kernelEntry = fileURLToPath(new URL("../../spinosa-kernel/src/index.ts", import.meta.url))
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))

process.env.SPINOSA_PRODUCT = "1"
process.env.SPINOSA_TEMPLATE_ROOT ??= repoRoot
const child = Bun.spawn([process.execPath, "run", kernelEntry, ...process.argv.slice(2)], {
  cwd: kernelDirectory,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})
process.exitCode = await child.exited
