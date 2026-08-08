import { readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { writeTextAtomic } from "../utils/fs"

/**
 * Worker payloads (file lists + options) are passed to child workers as a
 * single argv positional. Huge imports can serialize hundreds of thousands of
 * entries, blowing past POSIX exec arg size limits (E2BIG). Payloads under the
 * threshold ride on argv as before; anything larger is spilled to a temp file
 * that the worker reads and deletes.
 */
export const MAX_WORKER_ARGV_PAYLOAD = 48 * 1024

const PAYLOAD_FILE_PREFIX = "@file:"

export type WorkerPayloadArg = { arg: string; tempPath?: string }

export function encodeWorkerPayload(payload: unknown): WorkerPayloadArg {
  const json = JSON.stringify(payload)
  if (json.length <= MAX_WORKER_ARGV_PAYLOAD) return { arg: json }
  const tempPath = path.join(tmpdir(), `spinosa-worker-payload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  writeTextAtomic(tempPath, json)
  return { arg: `${PAYLOAD_FILE_PREFIX}${tempPath}`, tempPath }
}

export function decodeWorkerPayload(arg: string | undefined): unknown {
  if (!arg) return {}
  if (arg.startsWith(PAYLOAD_FILE_PREFIX)) {
    const tempPath = arg.slice(PAYLOAD_FILE_PREFIX.length)
    try {
      const parsed = JSON.parse(readFileSync(tempPath, "utf8")) as unknown
      rmSync(tempPath, { force: true })
      return parsed
    } catch {
      rmSync(tempPath, { force: true })
      return {}
    }
  }
  return JSON.parse(arg) as unknown
}

export function disposeWorkerPayload(tempPath: string | undefined): void {
  if (tempPath) rmSync(tempPath, { force: true })
}
