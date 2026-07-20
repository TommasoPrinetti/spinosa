export interface ParsedArgs {
  positionals: string[]
  values: Map<string, string>
  flags: Set<string>
}

const valueFlags = new Set(["workspace", "file", "dir", "extensions", "cli", "launch", "channel", "version", "name"])
const booleanFlags = new Set(["yes", "dry-run", "force", "reinstall", "overwrite", "no-color", "json", "quiet"])

export function parseSpinosaCliArgs(args: string[]): ParsedArgs {
  const positionals: string[] = []
  const values = new Map<string, string>()
  const flags = new Set<string>()

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (!arg.startsWith("--")) {
      positionals.push(arg)
      continue
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2)
    if (!rawKey) throw new Error(`Invalid option: ${arg}`)
    if (valueFlags.has(rawKey)) {
      const nextValue = inlineValue ?? args[++index]
      if (!nextValue || nextValue.startsWith("--")) throw new Error(`--${rawKey} requires a value`)
      values.set(rawKey, nextValue)
    } else {
      if (inlineValue !== undefined) throw new Error(`--${rawKey} does not accept a value`)
      if (!booleanFlags.has(rawKey)) throw new Error(`Unknown option: --${rawKey}`)
      flags.add(rawKey)
    }
  }
  return { positionals, values, flags }
}
