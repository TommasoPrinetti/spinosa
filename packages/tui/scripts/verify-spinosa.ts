#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { formatVerifyReport, runSpinosaMaturityChecks } from "../src/spinosa/verify"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" })
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

async function main() {
  console.log("== Spinosa TUI verification ==\n")

  const tests = run("bun", ["test", "--isolate", "test/spinosa/"])
  console.log("--- bun test test/spinosa/ ---")
  if (tests.stdout) process.stdout.write(tests.stdout)
  if (tests.stderr) process.stderr.write(tests.stderr)
  console.log(`exit: ${tests.status ?? "unknown"}\n`)

  const typecheck = run("bun", ["run", "typecheck:spinosa"])
  console.log("--- bun run typecheck:spinosa ---")
  if (typecheck.stdout) process.stdout.write(typecheck.stdout)
  if (typecheck.stderr) process.stderr.write(typecheck.stderr)
  console.log(`exit: ${typecheck.status ?? "unknown"}\n`)

  const report = await runSpinosaMaturityChecks()
  console.log("--- maturity checks ---")
  console.log(formatVerifyReport(report))

  const ok = tests.ok && typecheck.ok && report.failed === 0
  process.exit(ok ? 0 : 1)
}

void main()
