const [timeoutRaw, ...command] = Bun.argv.slice(2)
const timeoutSeconds = Number(timeoutRaw)

if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0 || command.length === 0) {
  console.error("Usage: bun run run-with-timeout.ts <seconds> <command> [args...]")
  process.exit(2)
}

const child = Bun.spawn(command, {
  cwd: process.cwd(),
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  detached: true,
})

const killGroup = (signal: NodeJS.Signals) => {
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // The child already exited.
    }
  }
}

let timedOut = false
let forceTimer: ReturnType<typeof setTimeout> | undefined
const timeout = setTimeout(() => {
  timedOut = true
  console.error(`spinosa: command timed out after ${timeoutSeconds}s`)
  killGroup("SIGTERM")
  forceTimer = setTimeout(() => killGroup("SIGKILL"), 5_000)
}, timeoutSeconds * 1_000)

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, () => killGroup(signal))
}

const exitCode = await child.exited
clearTimeout(timeout)
if (forceTimer) clearTimeout(forceTimer)
if (timedOut) killGroup("SIGKILL")
process.exit(timedOut ? 124 : exitCode)
