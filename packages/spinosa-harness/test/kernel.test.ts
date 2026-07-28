import { describe, expect, test } from "bun:test"
import { SpinosaKernelHarness } from "../src/kernel"

describe("SpinosaKernelHarness", () => {
  test("maps Spinosa workflow agents to the native kernel executor", async () => {
    const requests: Record<string, unknown>[] = []
    const harness = new SpinosaKernelHarness({
      session: {
        create: async () => ({ data: {} }),
        prompt: async (input) => {
          requests.push(input)
          return { data: {} }
        },
        abort: async () => ({ data: {} }),
        get: async () => ({ data: {} }),
      },
      global: { event: async () => ({ stream: (async function* () {})() }) },
      permission: { reply: async () => ({ data: {} }) },
    })

    await harness.executeAgent({
      sessionID: "ses_123",
      agent: "spinosa-searcher",
      prompt: "Assigned agent: spinosa-searcher",
      system: "Execute only the assigned phase.",
      synthetic: true,
      model: { providerID: "opencode", modelID: "north-mini-code-free" },
    })

    expect(requests).toEqual([
      {
        sessionID: "ses_123",
        agent: "build",
        model: { providerID: "opencode", modelID: "north-mini-code-free" },
        system: "Execute only the assigned phase.",
        parts: [{ type: "text", text: "Assigned agent: spinosa-searcher", synthetic: true }],
      },
    ])
  })

  test("keeps the kernel error message and reference", async () => {
    const harness = new SpinosaKernelHarness({
      session: {
        create: async () => ({ data: {} }),
        prompt: async () => ({ error: { message: "Agent not found", ref: "err_test" } }),
        abort: async () => ({ data: {} }),
        get: async () => ({ data: {} }),
      },
      global: { event: async () => ({ stream: (async function* () {})() }) },
      permission: { reply: async () => ({ data: {} }) },
    })

    await expect(
      harness.executeAgent({ sessionID: "ses_123", agent: "spinosa-searcher", prompt: "find evidence" }),
    ).rejects.toThrow('Spinosa kernel could not execute "spinosa-searcher" (kernel agent "build"): Agent not found [ref err_test]')
  })

  test("reads diagnostics from an SDK error payload", async () => {
    const harness = new SpinosaKernelHarness({
      session: {
        create: async () => ({ data: {} }),
        prompt: async () => ({ error: { data: { message: "Provider unavailable", ref: "err_sdk" } } }),
        abort: async () => ({ data: {} }),
        get: async () => ({ data: {} }),
      },
      global: { event: async () => ({ stream: (async function* () {})() }) },
      permission: { reply: async () => ({ data: {} }) },
    })

    await expect(
      harness.executeAgent({ sessionID: "ses_123", agent: "spinosa-searcher", prompt: "find evidence" }),
    ).rejects.toThrow('Provider unavailable [ref err_sdk]')
  })
})
