import { run as runTui, type TuiInput } from "@spinosa/tui"
import { Global } from "@spinosa/kernel-core/global"
import { AppNodeBuilder } from "@spinosa/kernel-core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
