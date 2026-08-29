export * as CustomTools from "./custom"

import path from "path"
import { pathToFileURL } from "url"
import { ToolFailure } from "@spinosa/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { Global } from "../global"
import { Location } from "../location"
import { Glob } from "../util/glob"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

type PluginToolDefinition = {
  readonly description: string
  readonly args?: unknown
  readonly execute: (args: unknown, context: PluginToolContext) => Promise<unknown>
}

type PluginToolContext = {
  readonly sessionID: string
  readonly messageID: string
  readonly agent: string
  readonly directory: string
  readonly worktree: string
  readonly abort: AbortSignal
  readonly metadata: (input: { title?: string; metadata?: Record<string, unknown> }) => void
  readonly ask: (input: unknown) => Promise<void>
}

function isZodType(value: unknown): boolean {
  return typeof value === "object" && value !== null && "_zod" in (value as Record<string, unknown>)
}

function isPluginTool(value: unknown): value is PluginToolDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "description" in (value as Record<string, unknown>) &&
    "execute" in (value as Record<string, unknown>) &&
    typeof (value as Record<string, unknown>).execute === "function"
  )
}

function isJsonSchemaDefinition(value: unknown): boolean {
  return typeof value === "boolean" || (typeof value === "object" && value !== null && !Array.isArray(value))
}

function jsonSchemaToEffectSchema(def: unknown): any {
  if (typeof def !== "object" || def === null) return Schema.Unknown
  const obj = def as Record<string, unknown>
  const type = obj.type as string | undefined
  const description = typeof obj.description === "string" ? obj.description : undefined
  let schema: any
  switch (type) {
    case "string":
      schema = Schema.String
      break
    case "number":
    case "integer":
      schema = Schema.Number
      break
    case "boolean":
      schema = Schema.Boolean
      break
    case "array":
      schema = Schema.Array(Schema.Unknown)
      break
    case "object":
      schema = Schema.Unknown
      break
    default:
      schema = Schema.Unknown
      break
  }
  return description ? (schema as any).annotate({ description }) : schema
}

function unwrapZod(value: unknown): { readonly inner: unknown; readonly optional: boolean } {
  let current: unknown = value
  let optional = false
  while (isZodType(current)) {
    const def = (current as { _zod: { def: { type: string; innerType?: unknown } } })._zod.def
    const type = def.type
    if (type === "optional" || type === "nullable") {
      optional = true
      current = def.innerType as unknown
    } else if (type === "default") {
      current = def.innerType as unknown
    } else {
      break
    }
  }
  return { inner: current, optional }
}

function zodToEffectSchema(value: unknown): any {
  if (!isZodType(value)) return Schema.Unknown
  const raw = value as { _zod: { def: Record<string, unknown> }; description?: string }
  const def = raw._zod.def as Record<string, unknown>
  const type = def.type as string
  const description = typeof raw.description === "string" ? raw.description : undefined
  let schema: any
  switch (type) {
    case "string":
      schema = Schema.String
      break
    case "number":
      schema = Schema.Number
      break
    case "boolean":
      schema = Schema.Boolean
      break
    case "array": {
      const element = def.element as unknown
      const elementSchema = element ? zodToEffectSchema(element) : Schema.Unknown
      schema = Schema.Array(elementSchema)
      break
    }
    case "enum": {
      const entries = def.entries as Record<string, string> | undefined
      if (entries) {
        const values = Object.values(entries)
        if (values.length === 0) schema = Schema.String
        else if (values.length === 1) schema = Schema.Literal(values[0])
        else {
          const literals = values.map((v) => Schema.Literal(v)) as [any, ...any[]]
          schema = Schema.Union(...literals)
        }
      } else {
        schema = Schema.String
      }
      break
    }
    case "literal": {
      const values = def.values as unknown[] | undefined
      if (values && values.length === 1) schema = Schema.Literal(values[0] as string)
      else if (values && values.length > 1) {
        const lits = values.map((v) => Schema.Literal(v as string)) as [any, ...any[]]
        schema = Schema.Union(...lits)
      } else {
        schema = Schema.Unknown
      }
      break
    }
    case "object":
      schema = Schema.Unknown
      break
    case "union":
      schema = Schema.Unknown
      break
    default:
      schema = Schema.Unknown
      break
  }
  return description ? (schema as any).annotate({ description }) : schema
}

function argsToInputSchema(args: unknown): any {
  if (args == null || typeof args !== "object") return Schema.Struct({})
  const entries = Object.entries(args as Record<string, unknown>)
  if (entries.length === 0) return Schema.Struct({})
  const allZod = entries.every(([, v]) => isZodType(v))
  if (allZod) {
    const fields: Record<string, any> = {}
    for (const [key, value] of entries) {
      const { inner, optional } = unwrapZod(value)
      let schema = zodToEffectSchema(inner)
      const outerDesc = (value as { description?: string }).description
      if (outerDesc && typeof outerDesc === "string") {
        const hasDesc =
          (schema as unknown as { ast?: { annotations?: Record<string, unknown> } })?.ast?.annotations?.description !==
          undefined
        if (!hasDesc) schema = (schema as any).annotate({ description: outerDesc })
      }
      fields[key] = optional ? Schema.optional(schema) : schema
    }
    return Schema.Struct(fields as never)
  }
  const fields: Record<string, any> = {}
  for (const [key, def] of entries) {
    if (isZodType(def)) {
      const { inner, optional } = unwrapZod(def)
      let schema = zodToEffectSchema(inner)
      const outerDesc = (def as { description?: string }).description
      if (outerDesc && typeof outerDesc === "string") {
        const hasDesc =
          (schema as unknown as { ast?: { annotations?: Record<string, unknown> } })?.ast?.annotations?.description !==
          undefined
        if (!hasDesc) schema = (schema as any).annotate({ description: outerDesc })
      }
      fields[key] = optional ? Schema.optional(schema) : schema
    } else if (isJsonSchemaDefinition(def)) {
      fields[key] = jsonSchemaToEffectSchema(def)
    } else {
      fields[key] = Schema.Unknown
    }
  }
  return Schema.Struct(fields as never)
}

function makeCoreTool(
  _name: string,
  def: PluginToolDefinition,
  locationDir: string,
  worktree: string,
): Tool.AnyTool {
  const inputSchema: any = argsToInputSchema(def.args)
  const outputSchema: any = Schema.String

  return Tool.make({
    description: def.description ?? "",
    input: inputSchema,
    output: outputSchema,
    execute: (input: unknown, context: Tool.Context) =>
      Effect.gen(function* () {
        const pluginCtx: PluginToolContext = {
          sessionID: String(context.sessionID),
          messageID: String(context.assistantMessageID),
          agent: String(context.agent),
          directory: locationDir,
          worktree,
          abort: context.abort ?? new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
        const result = yield* Effect.tryPromise({
          try: () => def.execute(input as unknown, pluginCtx),
          catch: (cause) =>
            new ToolFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
        })
        if (typeof result === "string") return result
        if (result && typeof result === "object" && "output" in (result as Record<string, unknown>)) {
          const output = (result as Record<string, unknown>).output
          if (typeof output === "string") return output
          if (output != null) return String(output)
        }
        if (result == null) return ""
        return String(result)
      }).pipe(
        Effect.mapError((error) =>
          error instanceof ToolFailure ? error : new ToolFailure({ message: String(error) }),
        ),
      ),
  } as any)
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const location = yield* Location.Service
    const global = yield* Global.Service

    const locationDir = location.directory
    const worktree = location.project.directory ?? location.directory

    const projectToolsDirs = [
      path.join(locationDir, ".opencode", "tools"),
      path.join(locationDir, ".opencode", "tool"),
      path.join(locationDir, ".spinosa", "tools"),
      path.join(locationDir, ".spinosa", "tool"),
    ]
    const globalToolsDirs = [
      path.join(global.config, "tools"),
      path.join(global.config, "tool"),
      path.join(path.dirname(global.config), "opencode", "tools"),
      path.join(path.dirname(global.config), "opencode", "tool"),
    ]
    const dirs = [...new Set([...projectToolsDirs, ...globalToolsDirs])]

    const matches: string[] = []
    for (const dir of dirs) {
      try {
        const files = Glob.scanSync("*.{js,ts}", { cwd: dir, absolute: true })
        matches.push(...files)
      } catch (cause) {
        yield* Effect.logDebug(`custom-tools scan failed for ${dir}: ${String(cause)}`)
      }
    }

    if (matches.length === 0) return

    const uniqueMatches = [...new Set(matches)]
    const registrations: Record<string, Tool.AnyTool> = {}

    for (const match of uniqueMatches) {
      const namespace = path.basename(match, path.extname(match))
      const loaded = yield* Effect.tryPromise({
        try: () => import(pathToFileURL(match).href),
        catch: (cause) => cause,
      }).pipe(
        Effect.map((mod) => ({ ok: true as const, mod: mod as Record<string, unknown> })),
        Effect.catch(() => Effect.succeed({ ok: false as const })),
      )
      if (!loaded.ok) {
        yield* Effect.logWarning(`Skipping custom tool file (import failed): ${match}`)
        continue
      }
      const mod = loaded.mod

      for (const [id, def] of Object.entries(mod)) {
        if (!isPluginTool(def)) continue
        const toolName = id === "default" ? namespace : `${namespace}_${id}`
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(toolName)) {
          yield* Effect.logWarning(`Skipping custom tool with invalid name ${toolName} from ${match}`)
          continue
        }
        try {
          const coreTool = makeCoreTool(toolName, def, locationDir, worktree)
          registrations[toolName] = coreTool
        } catch (cause) {
          yield* Effect.logWarning(`Failed to convert custom tool ${toolName} from ${match}: ${String(cause)}`)
        }
      }
    }

    if (Object.keys(registrations).length === 0) return

    yield* tools.register(registrations).pipe(
      Effect.catchTag("Tool.RegistrationError", (error) =>
        Effect.logWarning(`Custom tool registration failed: ${error.message}`),
      ),
      Effect.orDie,
    )
  }),
)

export const node = makeLocationNode({
  name: "tool/custom",
  layer,
  deps: [ToolRegistry.node, Location.node, Global.node],
})
