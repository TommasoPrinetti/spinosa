import { describe, expect, test } from "bun:test"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import {
  aggregateFileUsage,
  extractFileAccessEvents,
  normalizeWorkspaceFilePath,
  normalizeWorkspaceRelativePath,
  workspaceFileSet,
  type WorkspaceFile,
} from "../../src/routes/spinosa/visualizer-graph-data"
import type { ToolCallRecord } from "../../src/routes/spinosa/visualizer-types"

const ROOT = "/workspace"

function workspaceFile(relative: string): WorkspaceFile {
  return { path: relative, absolute: `${ROOT}/${relative}` }
}

function completedCall(
  tool: string,
  input: Record<string, unknown>,
  options: { output?: string; metadata?: Record<string, unknown>; id?: string; time?: number } = {},
): ToolCallRecord {
  const id = options.id ?? `prt_${tool}`
  const state: Extract<ToolPart["state"], { status: "completed" }> = {
    status: "completed",
    input,
    output: options.output ?? "",
    title: tool,
    metadata: options.metadata ?? {},
    time: { start: options.time ?? 10, end: (options.time ?? 10) + 1 },
  }
  const part: ToolPart = {
    id,
    sessionID: "ses_root",
    messageID: `msg_${id}`,
    type: "tool",
    callID: `call_${id}`,
    tool,
    state,
  }
  return {
    id,
    callID: part.callID,
    messageID: part.messageID,
    sessionID: part.sessionID,
    tool,
    status: state.status,
    input,
    output: state.output,
    title: state.title,
    metadata: state.metadata,
    timeStart: state.time.start,
    timeEnd: state.time.end,
    sessionTitle: "Root",
    part,
  }
}

describe("workspace path normalization", () => {
  const files = [workspaceFile("src/a.ts"), workspaceFile("notes/read me.md")]
  const set = workspaceFileSet(files)

  test("accepts only enumerated files contained by the workspace", () => {
    expect(normalizeWorkspaceFilePath(ROOT, "src/a.ts", set)).toBe("src/a.ts")
    expect(normalizeWorkspaceFilePath(ROOT, "/workspace/notes/read me.md", set)).toBe("notes/read me.md")
    expect(normalizeWorkspaceFilePath(ROOT, String.raw`src\a.ts`, set)).toBe("src/a.ts")
    expect(normalizeWorkspaceFilePath(ROOT, "../outside.ts", set)).toBeUndefined()
    expect(normalizeWorkspaceFilePath(ROOT, "/workspace-evil/src/a.ts", set)).toBeUndefined()
    expect(normalizeWorkspaceFilePath(ROOT, "src/missing.ts", set)).toBeUndefined()
    expect(normalizeWorkspaceFilePath(ROOT, "src/a.ts\0secret", set)).toBeUndefined()
  })

  test("normalizes portable relative paths and rejects traversal", () => {
    expect(normalizeWorkspaceRelativePath("./src\\a.ts")).toBe("src/a.ts")
    expect(normalizeWorkspaceRelativePath("a/../../outside.ts")).toBeUndefined()
    expect(normalizeWorkspaceRelativePath("/absolute.ts")).toBeUndefined()
  })
})

describe("file access extraction", () => {
  test("prefers structured reads and deduplicates implicitly loaded files", () => {
    const files = [workspaceFile("src/a.ts"), workspaceFile("AGENTS.md")]
    const result = extractFileAccessEvents(
      completedCall("read", { filePath: "/workspace/wrong.ts" }, {
        metadata: {
          display: { type: "file", path: "/workspace/src/a.ts" },
          loaded: ["/workspace/AGENTS.md", "/workspace/AGENTS.md"],
        },
      }),
      ROOT,
      workspaceFileSet(files),
    )

    expect(result.events.map((event) => [event.file, event.kind, event.source])).toEqual([
      ["src/a.ts", "read", "metadata"],
      ["AGENTS.md", "implicit_read", "metadata"],
    ])
    expect(result.rejectedPaths).toBe(0)
  })

  test("does not turn a structured directory read into a file read", () => {
    const files = [workspaceFile("src/a.ts")]
    const result = extractFileAccessEvents(
      completedCall("read", { filePath: "/workspace/src/a.ts" }, {
        metadata: { display: { type: "directory", path: "/workspace/src" } },
      }),
      ROOT,
      workspaceFileSet(files),
    )
    expect(result.events).toEqual([])
  })

  test("counts grep access once per file while retaining match counts", () => {
    const files = [workspaceFile("src/a.ts"), workspaceFile("docs/a:b.md")]
    const output = [
      "Found 3 matches (more matches available)",
      "/workspace/src/a.ts:",
      "  Line 2: first",
      "  Line 9: second",
      "",
      "/workspace/docs/a:b.md:",
      "  Line 3: third",
    ].join("\n")
    const result = extractFileAccessEvents(
      completedCall("grep", { pattern: "term" }, { output }),
      ROOT,
      workspaceFileSet(files),
    )

    expect(result.events.map((event) => [event.file, event.matches])).toEqual([
      ["src/a.ts", 2],
      ["docs/a:b.md", 1],
    ])
    expect(result.approximateSearchScope).toBe(true)
    expect(result.truncatedSearch).toBe(true)
  })

  test("attributes a direct no-match grep to its file", () => {
    const files = [workspaceFile("src/a.ts")]
    const result = extractFileAccessEvents(
      completedCall("grep", { pattern: "missing", path: "src/a.ts" }, { output: "No files found" }),
      ROOT,
      workspaceFileSet(files),
    )
    expect(result.events.map((event) => [event.file, event.kind, event.matches])).toEqual([
      ["src/a.ts", "search", 0],
    ])
    expect(result.approximateSearchScope).toBe(false)
  })
})

test("aggregation preserves untouched files and separates heat, discovery, and mutation", () => {
  const files = [
    workspaceFile("src/a.ts"),
    workspaceFile("docs/b.md"),
    workspaceFile("new.ts"),
    workspaceFile("moved.ts"),
    workspaceFile("untouched.md"),
  ]
  const calls = [
    completedCall("read", { filePath: "/workspace/src/a.ts" }, { id: "prt_read", time: 20 }),
    completedCall("grep", { pattern: "x" }, {
      id: "prt_grep",
      time: 30,
      output: "/workspace/src/a.ts:\n  Line 1: x\n  Line 2: x",
    }),
    completedCall("glob", { pattern: "**/*" }, {
      id: "prt_glob",
      output: "/workspace/src/a.ts\n/workspace/docs/b.md",
    }),
    completedCall("write", { filePath: "/workspace/new.ts", content: "x" }, { id: "prt_write" }),
    completedCall("edit", { filePath: "/workspace/docs/b.md" }, {
      id: "prt_edit",
      metadata: { filediff: { file: "/workspace/docs/b.md" } },
    }),
    completedCall("apply_patch", { patchText: "ignored fallback" }, {
      id: "prt_patch",
      metadata: {
        files: [
          { filePath: "/workspace/src/a.ts", relativePath: "src/a.ts" },
          { filePath: "/workspace/docs/b.md", movePath: "/workspace/moved.ts", relativePath: "moved.ts" },
        ],
      },
    }),
    completedCall("bash", { command: "cat /workspace/src/a.ts" }, { id: "prt_bash" }),
  ]

  const result = aggregateFileUsage(ROOT, files, calls)
  const byFile = Object.fromEntries(result.files.map((file) => [file.file, file]))

  expect(byFile["src/a.ts"]).toMatchObject({
    reads: 1,
    searches: 1,
    grepMatches: 2,
    discoveries: 1,
    patches: 1,
    heat: 2,
    lastAccessed: 30,
  })
  expect(byFile["docs/b.md"]).toMatchObject({ discoveries: 1, edits: 1, patches: 1, heat: 0 })
  expect(byFile["new.ts"]).toMatchObject({ writes: 1, mutations: 1, heat: 0 })
  expect(byFile["moved.ts"]).toMatchObject({ patches: 1, mutations: 1, heat: 0 })
  expect(byFile["untouched.md"]).toMatchObject({ accesses: 0, sessions: 0, heat: 0 })
  expect(result.coverage).toMatchObject({
    totalToolCalls: 7,
    attributedToolCalls: 6,
    unattributedToolCalls: 1,
    unsupportedToolCalls: 0,
    approximateSearchScopes: 1,
    unattributedByTool: { bash: 1 },
  })
})

test("apply_patch falls back to patch headers and rejects external targets", () => {
  const files = [workspaceFile("src/a.ts"), workspaceFile("new.ts")]
  const call = completedCall("apply_patch", {
    patchText: [
      "*** Begin Patch",
      "*** Update File: src/a.ts",
      "*** Add File: new.ts",
      "*** Delete File: ../outside.ts",
      "*** End Patch",
    ].join("\n"),
  })
  const result = extractFileAccessEvents(call, ROOT, workspaceFileSet(files))
  expect(result.events.map((event) => event.file)).toEqual(["src/a.ts", "new.ts"])
  expect(result.rejectedPaths).toBe(1)
})
