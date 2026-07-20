import { expect, test } from "bun:test"
import { copySource } from "../../src/spinosa-core/import/pipeline"
import { SpinosaCancellationError } from "../../src/spinosa-core/import/cancellation"

test("copySource rejects before scanning when its generation is cancelled", async () => {
  await expect(copySource("/not-read", "/not-written", { shouldAbort: () => true })).rejects.toBeInstanceOf(SpinosaCancellationError)
})
