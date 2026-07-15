import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260622170816_reset_v2_session_state",
  up(tx) {
    return Effect.void
  },
} satisfies DatabaseMigration.Migration
