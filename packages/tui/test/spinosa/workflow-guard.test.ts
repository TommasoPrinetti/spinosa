import { expect, test } from "bun:test"
import { createWorkflowGuard } from "../../src/routes/spinosa/wizard-ui"

test("createWorkflowGuard invalidates prior runs when bumped", () => {
  const guard = createWorkflowGuard()
  const first = guard.bump()
  expect(guard.active(first)).toBe(true)

  guard.bump()
  expect(guard.active(first)).toBe(false)

  const second = guard.bump()
  expect(guard.active(second)).toBe(true)
})