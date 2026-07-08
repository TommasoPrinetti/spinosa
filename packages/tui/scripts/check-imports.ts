#!/usr/bin/env bun
// Check that Node.js builtins used via dot-access are properly imported.
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const WS = path.resolve(SCRIPT_DIR, "..")
const PKG_DIR = path.resolve(WS, "..")

const NODE_BUILTINS: Record<string, true> = {
  assert: true, async_hooks: true, buffer: true, child_process: true,
  cluster: true, console: true, constants: true, crypto: true, dgram: true,
  diagnostics_channel: true, dns: true, domain: true, events: true, fs: true,
  "fs/promises": true, http: true, http2: true, https: true, inspector: true,
  module: true, net: true, os: true, path: true, "path/posix": true,
  "path/win32": true, perf_hooks: true, process: true, punycode: true,
  querystring: true, readline: true, repl: true, stream: true,
  "stream/promises": true, string_decoder: true, timers: true,
  "timers/promises": true, tls: true, trace_events: true, tty: true, url: true,
  util: true, v8: true, vm: true, wasi: true, worker_threads: true, zlib: true,
}

interface V { file: string; line: number; builtin: string; usage: string }
// Check if `name` is declared locally on any preceding line (shadows a builtin module)
function isLocal(lines: string[], upTo: number, name: string): boolean {
  const re = new RegExp(`\\b(const|let|var|function)\\s+${name}\\b|\\b${name}\\s*[:=]`)
  for (let i = 0; i < upTo; i++) if (re.test(lines[i]!)) return true
  return false
}

const importRe = /from\s+["'](?:node:)?([a-zA-Z_/][\w/]*)["']/
const dotRe = /\b([a-zA-Z_$][\w$]*)\.([a-zA-Z_$][\w$]*)/g

const dirs = ["tui", "spinosa-core"].flatMap(p => { const d = path.join(PKG_DIR, p, "src"); return existsSync(d) ? [d] : [] })

const violations: V[] = []
for (const root of dirs) {
  for (const rel of new Bun.Glob("**/*.{ts,tsx,mts,cts}").scanSync(root)) {
    const file = path.join(root, rel)
    if (file.endsWith(".d.ts")) continue
    try {
      const lines = readFileSync(file, "utf-8").split("\n")
      const imported = new Set<string>()
      for (const l of lines) { const m = l.match(importRe); if (m && m[1]! in NODE_BUILTINS) imported.add(m[1]!) }
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!
        if (l.includes("import ")) continue
        let m: RegExpExecArray | null
        while ((m = dotRe.exec(l)) !== null) {
          const obj = m[1]!
          const pre = m.index > 0 ? l[m.index - 1] : undefined
          if (pre && /[.\w]/.test(pre)) continue
          if (obj === "url" || obj === "crypto" || obj === "console" || obj === "process" || obj === "buffer" || obj === "module" || obj === "events") continue
          if (obj in NODE_BUILTINS && !imported.has(obj) && !isLocal(lines, i, obj)) violations.push({ file, line: i + 1, builtin: obj, usage: `\`${obj}.${m[2]}\`` })
        }
      }
    } catch (err) { console.warn(`  \u26a0 Error checking ${rel}: ${err}`) }
  }
}

if (violations.length === 0) { console.log("\u2713 All Node.js builtin imports are accounted for."); process.exit(0) }
console.log(`\u2717 ${violations.length} unimported Node.js builtin usage(s):\n`)
for (const v of violations) { console.log(`  ${path.relative(WS, v.file)}:${v.line}  ${v.usage} \u2014 missing import for "${v.builtin}"`) }
console.log(); process.exit(1)
