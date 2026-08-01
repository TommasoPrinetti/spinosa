import { describe, expect, test } from "bun:test"
import { SessionExecution } from "@spinosa/kernel-core/session/execution"
import { SessionExecutionLocal } from "@spinosa/kernel-core/session/execution/local"
import { SessionExecutionStatus } from "@spinosa/kernel-core/session/execution-status"
import { SessionV2 } from "@spinosa/kernel-core/session"
import { AppNodeBuilderV1 } from "../../src/effect/app-node-builder-v1"
import { SessionExecutionStatusBridge } from "../../src/session/execution-status-bridge"

describe("SessionExecutionStatusBridge", () => {
  test("replaces the global SessionExecutionStatus node without a tag mismatch", () => {
    expect(() =>
      AppNodeBuilderV1.build(SessionV2.node, [
        [SessionExecution.node, SessionExecutionLocal.node],
        [SessionExecutionStatus.node, SessionExecutionStatusBridge.node],
      ]),
    ).not.toThrow()
  })

  test("bridge node shares the global tag with SessionExecutionStatus.node", () => {
    expect(SessionExecutionStatusBridge.node.tag).toBe(SessionExecutionStatus.node.tag)
    expect(SessionExecutionStatusBridge.node.name).toBe(SessionExecutionStatus.node.name)
  })
})
