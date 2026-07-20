import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260622202450_simplify_session_input",
  up(tx) {
    return Effect.void
  },
} satisfies DatabaseMigration.Migration
