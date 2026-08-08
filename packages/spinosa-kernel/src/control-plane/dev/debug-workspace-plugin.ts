import type { Plugin } from "@spinosa/plugin"
import { rename, writeFile } from "node:fs/promises"
import { randomInt } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"

const DEV_DATA_FILE = "/tmp/opencode-workspace-dev-data.json"
const DEV_DATA_TEMP_FILE = `${DEV_DATA_FILE}.tmp`

// The debug data file carries the workspace env (including SPINOSA_AUTH_CONTENT
// provider credentials). It must never be readable by other local users.
const DEV_DATA_MODE = 0o600

// Provider API keys and OAuth refresh tokens are deliberately NOT exported to
// the debug workspace env: the file is machine-local but multiple processes
// and users can read /tmp. Providers authenticate through the debug server's
// own auth instead.
const SENSITIVE_ENV_KEYS = new Set<string>(["SPINOSA_AUTH_CONTENT"])

function redactEnvironment(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !SENSITIVE_ENV_KEYS.has(key)),
  )
}

async function waitForHealth(port: number) {
  const url = `http://127.0.0.1:${port}/global/health`
  const started = Date.now()

  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {}

    await sleep(250)
  }

  throw new Error(`Timed out waiting for debug server health check at ${url}`)
}

let PORT: number | undefined

async function writeDebugData(port: number, id: string, env: Record<string, string | undefined>) {
  await writeFile(
    DEV_DATA_TEMP_FILE,
    JSON.stringify(
      {
        port,
        id,
        env: redactEnvironment(env),
      },
      null,
      2,
    ),
    { mode: DEV_DATA_MODE },
  )

  await rename(DEV_DATA_TEMP_FILE, DEV_DATA_FILE)
}

export const DebugWorkspacePlugin: Plugin = async ({ experimental_workspace }) => {
  experimental_workspace.register("debug", {
    name: "Debug",
    description: "Create a debugging server",
    configure(config) {
      return config
    },
    async create(config, env) {
      const port = randomInt(5000, 9001)
      PORT = port

      await writeDebugData(port, config.id, env)

      await waitForHealth(port)
    },
    async remove(_config) {},
    target(_config) {
      return {
        type: "remote",
        url: `http://localhost:${PORT!}/`,
      }
    },
  })

  return {}
}

export default DebugWorkspacePlugin
