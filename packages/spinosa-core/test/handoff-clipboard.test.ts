import { describe, expect, test } from "bun:test"
import { handoffCopyCommand } from "../src/handoff/runner"

describe("handoffCopyCommand", () => {
  test("prefers wl-copy on Wayland Linux", () => {
    expect(handoffCopyCommand("linux", true, (name) => name === "wl-copy")).toEqual(["wl-copy"])
  })

  test("uses pbcopy on Darwin", () => {
    expect(handoffCopyCommand("darwin", false, (name) => name === "pbcopy")).toEqual(["pbcopy"])
  })

  test("falls back through X11 clipboard commands", () => {
    expect(handoffCopyCommand("linux", true, (name) => name === "xclip")).toEqual([
      "xclip",
      "-selection",
      "clipboard",
    ])
    expect(handoffCopyCommand("linux", false, (name) => name === "xsel")).toEqual([
      "xsel",
      "--clipboard",
      "--input",
    ])
  })

  test("prefers wl-copy over xclip when Wayland and both exist", () => {
    expect(
      handoffCopyCommand("linux", true, (name) => name === "wl-copy" || name === "xclip"),
    ).toEqual(["wl-copy"])
  })

  test("does not prefer wl-copy without Wayland even if present", () => {
    expect(
      handoffCopyCommand("linux", false, (name) => name === "wl-copy" || name === "xclip"),
    ).toEqual(["xclip", "-selection", "clipboard"])
  })

  test("returns undefined when native clipboard is unavailable", () => {
    expect(handoffCopyCommand("linux", false, () => false)).toBeUndefined()
  })
})
