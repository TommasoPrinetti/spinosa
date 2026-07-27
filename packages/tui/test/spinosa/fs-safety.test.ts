import { describe, expect, test } from "bun:test"
import path from "node:path"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "../fixture/fixture"
import { safeCopy, safeCopyAsync } from "@spinosa/core/utils/fs"

describe("Spinosa file copy safety", () => {
  test("keeps destination when source copy fails", async () => {
    await using tmp = await tmpdir()
    const destination = path.join(tmp.path, "destination.txt")
    await Bun.write(destination, "original\n")

    expect(safeCopy(path.join(tmp.path, "missing.txt"), destination, { retries: 1 })).toBe(false)
    expect(await Bun.file(destination).text()).toBe("original\n")
  })

  test("never replaces a destination directory with a file", async () => {
    await using tmp = await tmpdir()
    const source = path.join(tmp.path, "source.txt")
    const destination = path.join(tmp.path, "destination")
    await Bun.write(source, "new\n")
    await mkdir(destination)

    expect(safeCopy(source, destination, { retries: 1 })).toBe(false)
    expect(existsSync(destination)).toBe(true)
  })

  test("async copy atomically replaces a file", async () => {
    await using tmp = await tmpdir()
    const source = path.join(tmp.path, "source.txt")
    const destination = path.join(tmp.path, "destination.txt")
    await Bun.write(source, "new\n")
    await Bun.write(destination, "old\n")

    expect(await safeCopyAsync(source, destination, { retries: 1 })).toBe(true)
    expect(await Bun.file(destination).text()).toBe("new\n")
  })
})
