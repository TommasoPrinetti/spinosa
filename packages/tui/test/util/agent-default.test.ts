import { expect, test } from "bun:test"
import { ORCHESTRATOR_AGENT_ID, resolveDefaultPrimaryAgent, resolveSubmitAgent } from "../../src/util/agent"

test("resolveDefaultPrimaryAgent prefers build when unset", () => {
  const agents = [
    { name: "spinosa-overseer" },
    { name: "build" },
    { name: "plan" },
    { name: "spinosa-writer" },
  ]
  expect(resolveDefaultPrimaryAgent(agents)?.name).toBe(ORCHESTRATOR_AGENT_ID)
  expect(resolveDefaultPrimaryAgent(agents, undefined)?.name).toBe("build")
})

test("resolveDefaultPrimaryAgent keeps an explicit selection", () => {
  const agents = [{ name: "build" }, { name: "plan" }, { name: "spinosa-overseer" }]
  expect(resolveDefaultPrimaryAgent(agents, "plan")?.name).toBe("plan")
})

test("resolveDefaultPrimaryAgent falls back to build when sticky agent is gone", () => {
  const agents = [{ name: "spinosa-writer" }, { name: "build" }, { name: "plan" }]
  expect(resolveDefaultPrimaryAgent(agents, "spinosa-overseer")?.name).toBe("build")
})

test("resolveDefaultPrimaryAgent falls back to first agent only if build missing", () => {
  const agents = [{ name: "spinosa-overseer" }, { name: "plan" }]
  expect(resolveDefaultPrimaryAgent(agents)?.name).toBe("spinosa-overseer")
})

test("resolveSubmitAgent honors forceAgent over sticky specialist", () => {
  const agents = [
    { name: "spinosa-overseer" },
    { name: "build" },
    { name: "plan" },
  ]
  expect(
    resolveSubmitAgent(agents, { current: "spinosa-overseer", forceAgent: ORCHESTRATOR_AGENT_ID })?.name,
  ).toBe("build")
})

test("resolveSubmitAgent uses orchestrator when sync list lags", () => {
  const agents = [{ name: "spinosa-overseer" }, { name: "plan" }]
  expect(resolveSubmitAgent(agents, { forceAgent: ORCHESTRATOR_AGENT_ID })?.name).toBe("build")
})
