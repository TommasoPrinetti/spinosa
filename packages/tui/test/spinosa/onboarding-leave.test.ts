import { describe, expect, test } from "bun:test"
import { shouldClearActiveOnOnboardingCancel } from "../../src/spinosa/onboarding-leave"

describe("shouldClearActiveOnOnboardingCancel", () => {
  test("resume incomplete clears active so Home is not workspace-ready", () => {
    expect(
      shouldClearActiveOnOnboardingCancel({
        isResume: true,
        activePath: "/ws/incomplete",
        setupStatus: "importing",
      }),
    ).toBe(true)
    expect(
      shouldClearActiveOnOnboardingCancel({
        isResume: true,
        activePath: "/ws/incomplete",
        setupStatus: "cli_started",
      }),
    ).toBe(true)
    expect(
      shouldClearActiveOnOnboardingCancel({
        isResume: true,
        activePath: "/ws/incomplete",
        setupStatus: undefined,
      }),
    ).toBe(true)
  })

  test("resume after workspace_started does not clear", () => {
    expect(
      shouldClearActiveOnOnboardingCancel({
        isResume: true,
        activePath: "/ws/ready",
        setupStatus: "workspace_started",
      }),
    ).toBe(false)
  })

  test("brand-new create cancel keeps a ready active workspace", () => {
    expect(
      shouldClearActiveOnOnboardingCancel({
        isResume: false,
        activePath: "/ws/ready",
        setupStatus: "workspace_started",
      }),
    ).toBe(false)
  })

  test("brand-new create cancel with no active stays clear", () => {
    expect(
      shouldClearActiveOnOnboardingCancel({
        isResume: false,
        activePath: undefined,
        setupStatus: undefined,
      }),
    ).toBe(false)
  })

  test("brand-new create cancel clears an incomplete active workspace", () => {
    expect(
      shouldClearActiveOnOnboardingCancel({
        isResume: false,
        activePath: "/ws/half",
        setupStatus: "not_started",
      }),
    ).toBe(true)
  })
})
