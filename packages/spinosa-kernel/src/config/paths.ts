import path from "path"
import fs from "fs/promises"
import { Flag } from "@spinosa/kernel-core/flag/flag"
import { Global } from "@spinosa/kernel-core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@spinosa/kernel-core/fs-util"

const legacyName = ["open", "code"].join("")
const productName = "spinosa"
const migrationReport = ".spinosa-migration-report.json"

export type ProjectMigrationResult = {
  source: string
  target: string
  result: "migrated" | "conflict" | "absent"
}

async function exists(file: string) {
  return fs.stat(file).then(() => true).catch(() => false)
}

async function migratePath(source: string, target: string): Promise<ProjectMigrationResult> {
  if (!(await exists(source))) return { source, target, result: "absent" }
  if (await exists(target)) return { source, target, result: "conflict" }
  await fs.rename(source, target)
  return { source, target, result: "migrated" }
}

export async function migrateProjectPaths(directory: string, worktree?: string) {
  const stop = path.resolve(worktree ?? path.parse(path.resolve(directory)).root)
  let current = path.resolve(directory)
  const results: ProjectMigrationResult[] = []
  while (true) {
    results.push(
      await migratePath(path.join(current, `.${legacyName}`), path.join(current, `.${productName}`)),
      await migratePath(path.join(current, `${legacyName}.json`), path.join(current, `${productName}.json`)),
      await migratePath(path.join(current, `${legacyName}.jsonc`), path.join(current, `${productName}.jsonc`)),
    )
    if (current === stop) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  const conflicts = results.filter((result) => result.result === "conflict")
  if (conflicts.length > 0) {
    await fs.writeFile(
      path.join(path.resolve(directory), migrationReport),
      JSON.stringify({ version: 1, migratedAt: new Date().toISOString(), conflicts }, null, 2) + "\n",
    )
  }
  return results
}

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (name: string, directory: string, worktree?: string) {
  yield* Effect.tryPromise(() => migrateProjectPaths(directory, worktree)).pipe(Effect.orDie)
  const afs = yield* FSUtil.Service
  return (yield* afs.up({ targets: [`${name}.jsonc`, `${name}.json`], start: directory, stop: worktree })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  yield* Effect.tryPromise(() => migrateProjectPaths(directory, worktree)).pipe(Effect.orDie)
  const afs = yield* FSUtil.Service
  return unique([
    Global.Path.config,
    ...(!Flag.SPINOSA_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({ targets: [`.${productName}`], start: directory, stop: worktree })
      : []),
    ...(yield* afs.up({ targets: [`.${productName}`], start: Global.Path.home, stop: Global.Path.home })),
    ...(Flag.SPINOSA_CONFIG_DIR ? [Flag.SPINOSA_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}

export * as ConfigPaths from "./paths"
