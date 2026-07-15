import { expect, test } from "bun:test";
import type { FileGraphData } from "../../src/routes/spinosa/visualizer-graph-data";
import { buildVisualizerGraphModel } from "../../src/routes/spinosa/visualizer-graph-model";
import type { ToolCallRecord } from "../../src/routes/spinosa/visualizer-types";

function call(
  input: Partial<ToolCallRecord> & Pick<ToolCallRecord, "id" | "tool">,
): ToolCallRecord {
  return {
    status: "completed",
    input: {},
    timeStart: 0,
    sessionTitle: "Session",
    part: {},
    ...input,
  };
}

const fileGraph: FileGraphData = {
  files: [
    {
      file: "src/a.ts",
      absolute: "/workspace/src/a.ts",
      reads: 1,
      searches: 0,
      grepMatches: 0,
      discoveries: 0,
      writes: 0,
      edits: 0,
      patches: 0,
      mutations: 0,
      accesses: 1,
      sessions: 1,
      heat: 1,
    },
    {
      file: "src/b.ts",
      absolute: "/workspace/src/b.ts",
      reads: 1,
      searches: 1,
      grepMatches: 2,
      discoveries: 0,
      writes: 0,
      edits: 0,
      patches: 0,
      mutations: 0,
      accesses: 2,
      sessions: 1,
      heat: 2,
    },
  ],
  events: [
    {
      file: "src/a.ts",
      kind: "read",
      source: "metadata",
      toolCallID: "call-kept",
    },
    {
      file: "/workspace/src/b.ts",
      kind: "search",
      source: "output",
      toolCallID: "call-kept",
    },
    {
      file: "src/b.ts",
      kind: "read",
      source: "input",
      toolCallID: "call-filtered",
    },
    {
      file: "/outside/private.txt",
      kind: "read",
      source: "input",
      toolCallID: "call-kept",
    },
  ],
  coverage: {
    totalToolCalls: 2,
    completedToolCalls: 2,
    errorToolCalls: 0,
    activeToolCalls: 0,
    attributedToolCalls: 2,
    unattributedToolCalls: 0,
    unsupportedToolCalls: 0,
    rejectedPaths: 1,
    truncatedSearchCalls: 0,
    approximateSearchScopes: 0,
    unattributedByTool: {},
  },
};

test("projects only filtered calls and attributable workspace events for Trace and Flow", () => {
  const model = buildVisualizerGraphModel({
    calls: [
      call({
        id: "part-kept",
        callID: "call-kept",
        messageID: "message-secret",
        sessionID: "session-1",
        tool: "read",
        timeStart: 10,
        timeEnd: 12,
        input: { token: "raw-secret", path: "/workspace/src/a.ts" },
        output: "raw-output-secret",
        metadata: { absolute: "/workspace/src/a.ts" },
      }),
    ],
    fileGraph,
    workspaceRoot: "/workspace",
    coverage: {
      scope: "latest-roots",
      rootsLoaded: 2,
      rootsAvailable: 5,
      sessionsLoaded: 3,
      messagesScanned: 8,
    },
  });

  expect(model.calls).toHaveLength(1);
  expect(model.calls[0]).toMatchObject({
    id: "part-kept",
    callID: "call-kept",
    sessionID: "session-1",
    timeStart: 10,
    timeEnd: 12,
    target: "src/a.ts",
    targets: ["src/a.ts", "src/b.ts"],
    targetKind: "file",
  });
  expect(model.events).toEqual([
    { file: "src/a.ts", toolCallID: "call-kept", kind: "read" },
    { file: "src/b.ts", toolCallID: "call-kept", kind: "search" },
  ]);
  expect(model.status).toEqual({
    calls: 1,
    errors: 0,
    observedFiles: 2,
    totalFiles: 2,
    scope: "Latest 2 of 5 roots · 3 sessions · 8 messages scanned",
  });
  expect(model.coverage).toContain("1 calls · 0 errors · 2/2 files observed");
});

test("never carries raw tool data or absolute paths into the layout model", () => {
  const model = buildVisualizerGraphModel({
    calls: [call({ id: "part", tool: "read", output: "raw-output-secret" })],
    fileGraph,
    workspaceRoot: "/workspace",
    coverage: { scope: "selected-tree", sessionsLoaded: 1, messagesLoaded: 2 },
  });
  const serialized = JSON.stringify(model);

  expect(serialized).not.toContain("raw-output-secret");
  expect(serialized).not.toContain("/workspace");
  expect(serialized).not.toContain("/outside");
  expect(model.status.scope).toBe(
    "Selected session tree · 1 sessions · 2 messages",
  );
});
