export * as SessionRunner from "./index"

import type { LLMError } from "@spinosa/llm"
import { Context, Effect } from "effect"
import { SessionSchema } from "../schema"
import type { ContextSnapshotDecodeError, MessageDecodeError } from "../error"
import { SessionRunnerModel } from "./model"
import type { SystemContext } from "../../system-context/index"
import type { ToolOutputStore } from "../../tool-output-store"

export type RunError =
  | LLMError
  | SessionRunnerModel.Error
  | MessageDecodeError
  | ContextSnapshotDecodeError
  | SystemContext.InitializationBlocked
  | ToolOutputStore.Error

/** Runs one local continuation from already-recorded Session history. */
export interface Interface {
  /** Drains eligible durable work. Explicit runs perform one provider attempt even when no work is eligible. */
  readonly run: (input: {
    readonly sessionID: SessionSchema.ID
    readonly force: boolean
  }) => Effect.Effect<void, RunError>
  /**
   * Force one AI compaction for `/compact` (manual). Returns false when there is
   * nothing useful to summarize (empty context / model limits).
   */
  readonly compact: (sessionID: SessionSchema.ID) => Effect.Effect<boolean, RunError>
}

export class Service extends Context.Service<Service, Interface>()("@spinosa/v2/SessionRunner") {}
