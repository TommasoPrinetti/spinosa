import { expect, test } from "bun:test"
import { sessionEpilogue } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123" })
  expect(epilogue).toContain("A session")
  expect(epilogue).toContain("opencode -s ses_123")
})

test("uses spinosa brand when in spinosa mode", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123", spinosa: true })
  expect(epilogue).toContain("spinosa -s ses_123")
})

test("appends --project when a directory is provided", () => {
  const epilogue = sessionEpilogue({
    title: "A session",
    sessionID: "ses_123",
    spinosa: true,
    projectDir: "/abs/workspace",
  })
  expect(epilogue).toContain("spinosa -s ses_123 --project /abs/workspace")
})
