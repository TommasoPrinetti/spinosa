export * from "./client.js"
export * from "./server.js"

import { createSpinosaClient } from "./client.js"
import { createSpinosaServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createOpencode(options?: ServerOptions) {
  const server = await createSpinosaServer({
    ...options,
  })

  const client = createSpinosaClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
