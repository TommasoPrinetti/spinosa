export * as ConfigAgent from "./agent"

import path from "path"
import { Exit, Schema } from "effect"
import { Glob } from "@spinosa/kernel-core/util/glob"
import { ConfigAgentV1 } from "@spinosa/kernel-core/v1/config/agent"
import { configEntryNameFromPath } from "./entry-name"
import * as ConfigMarkdown from "./markdown"
import { ConfigParse } from "./parse"

export async function load(dir: string) {
  const result: Record<string, ConfigAgentV1.Info> = {}
  const sources = dir.endsWith(`${path.sep}.spinosa`)
    ? [
        { cwd: path.dirname(dir), pattern: ".opencode/{agent,agents}/**/*.md", prefixes: [".opencode/agent/", ".opencode/agents/"] },
        { cwd: dir, pattern: "{agent,agents}/**/*.md", prefixes: ["agent/", "agents/"] },
      ]
    : [{ cwd: dir, pattern: "{agent,agents}/**/*.md", prefixes: ["agent/", "agents/"] }]

  for (const source of sources) {
    for (const item of await Glob.scan(source.pattern, {
      cwd: source.cwd,
      absolute: true,
      dot: true,
      symlink: true,
    })) {
      const md = await ConfigMarkdown.parse(item).catch(() => undefined)
      if (!md) continue

      const name = configEntryNameFromPath(path.relative(source.cwd, item), source.prefixes)
      const config = {
        name,
        ...md.data,
        prompt: md.content.trim(),
      }
      result[config.name] = ConfigParse.schema(ConfigAgentV1.Info, config, item)
    }
  }
  return result
}

export async function loadMode(dir: string) {
  const result: Record<string, ConfigAgentV1.Info> = {}
  for (const item of await Glob.scan("{mode,modes}/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(() => undefined)
    if (!md) continue

    const config = {
      name: configEntryNameFromPath(path.relative(dir, item), ["mode/", "modes/"]),
      ...md.data,
      prompt: md.content.trim(),
    }
    const parsed = Schema.decodeUnknownExit(ConfigAgentV1.Info)(config, { errors: "all", propertyOrder: "original" })
    if (Exit.isSuccess(parsed)) {
      result[config.name] = {
        ...parsed.value,
        mode: "primary" as const,
      }
    }
  }
  return result
}
