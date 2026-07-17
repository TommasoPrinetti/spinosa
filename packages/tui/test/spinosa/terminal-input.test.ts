import { describe, expect, test } from "bun:test"
import { Readable, Writable } from "node:stream"
import { confirmTerminal } from "../../src/spinosa-cli/terminal"

function output() {
  let value = ""
  return {
    stream: new Writable({ write(chunk, _encoding, done) { value += chunk.toString(); done() } }),
    value: () => value,
  }
}

describe("terminal input", () => {
  test("accepts affirmative line input without raw TTY mode", async () => {
    const written = output()
    expect(await confirmTerminal("Continue?", false, {
      input: Readable.from(["yes\n"]),
      output: written.stream,
    })).toBe(true)
    expect(written.value()).toContain("Continue? [y/N]")
  })

  test("honors defaults and explicit negative answers", async () => {
    expect(await confirmTerminal("Continue?", true, {
      input: Readable.from(["\n"]),
      output: output().stream,
    })).toBe(true)
    expect(await confirmTerminal("Continue?", true, {
      input: Readable.from(["no\n"]),
      output: output().stream,
    })).toBe(false)
  })
})
