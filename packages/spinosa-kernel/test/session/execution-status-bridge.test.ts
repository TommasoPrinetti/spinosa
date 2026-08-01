import { describe, expect, test } from "bun:test"
import { SessionExecution } from "@spinosa/kernel-core/session/execution"
import { SessionExecutionLocal } from "@spinosa/kernel-core/session/execution/local"
import { SessionExecutionStatus } from "@spinosa/kernel-core/session/execution-status"
import { SessionStore } from "@spinosa/kernel-core/session/store"
import { SessionV2 } from "@spinosa/kernel-core/session"
import { AppNodeBuilderV1 } from "../../src/effect/app-node-builder-v1"
import { InstanceStore } from "../../src/project/instance-store"
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

  test("bridge depends on SessionStore and InstanceStore so V2 wake can bind InstanceRef", () => {
    const deps = SessionExecutionStatusBridge.node.dependencies
    const names = deps.map((dep) => dep.name)
    expect(names).toContain(SessionStore.node.name)
    expect(names).toContain(InstanceStore.node.name)
  })
})
