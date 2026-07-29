export type RegistryVersionLookup = (name: string, version: string) => Promise<string | undefined>

export async function assertPlatformPackagesPublished(
  packageNames: string[],
  version: string,
  lookup: RegistryVersionLookup,
  options: {
    attempts?: number
    retryDelayMs?: number
    sleep?: (milliseconds: number) => Promise<void>
  } = {},
) {
  const attempts = options.attempts ?? 1
  const retryDelayMs = options.retryDelayMs ?? 0
  const sleep = options.sleep ?? Bun.sleep
  let failures: string[] = []

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const results = await Promise.all(
      packageNames.map(async (name) => {
        try {
          const actual = await lookup(name, version)
          if (actual === version) return
          return actual
            ? `${name}@${version} resolved to ${actual}`
            : `${name}@${version} is unavailable`
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return `${name}@${version} lookup failed: ${message}`
        }
      }),
    )
    failures = results.filter((result): result is string => Boolean(result))
    if (!failures.length) return
    if (attempt < attempts) await sleep(retryDelayMs)
  }

  throw new Error(`Platform packages are not ready on npm:\n- ${failures.join("\n- ")}`)
}
