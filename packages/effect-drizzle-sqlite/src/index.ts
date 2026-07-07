import * as driver from "./effect-sqlite/driver"
import * as session from "./effect-sqlite/session"
import { migrate } from "./effect-sqlite/migrator"
import { EffectLogger } from "drizzle-orm/effect-core"

export { EffectLogger } from "drizzle-orm/effect-core"

export * from "./effect-sqlite/driver"
export * from "./effect-sqlite/session"
export { migrate } from "./effect-sqlite/migrator"

export const EffectDrizzleSqlite = {
  ...driver,
  ...session,
  migrate,
  EffectLogger,
}
