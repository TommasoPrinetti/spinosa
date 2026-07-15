import { describe, expect, test } from "bun:test";
import type { Part, ToolPart } from "@opencode-ai/sdk/v2";
import { aggregateFileUsage } from "../../src/routes/spinosa/visualizer-graph-data";
import {
  TOOL_CALL_PAGE_SIZE,
  VisualizerGraphLoadError,
  loadPagedSessionToolCalls,
  loadSelectedSessionTree,
  loadSessionClosure,
  loadWorkspaceFileInventory,
  type VisualizerGraphClient,
  type VisualizerSDKResponse,
  type VisualizerSessionMessage,
} from "../../src/routes/spinosa/visualizer-graph-loader";

function response<T>(data: T, cursor?: string): VisualizerSDKResponse<T> {
  return {
    data,
    response: {
      headers: {
        get(name) {
          return name.toLowerCase() === "x-next-cursor"
            ? (cursor ?? null)
            : null;
        },
      },
    },
  };
}

function toolMessage(
  id: string,
  start: number,
  metadata: Record<string, unknown> = {},
): VisualizerSessionMessage {
  const state: Extract<ToolPart["state"], { status: "completed" }> = {
    status: "completed",
    input: { filePath: `src/${id}.ts` },
    output: id,
    title: `Read ${id}`,
    metadata,
    time: { start, end: start + 1 },
  };
  const part: ToolPart = {
    id: `part-${id}`,
    callID: `call-${id}`,
    messageID: `message-${id}`,
    sessionID: "root",
    type: "tool",
    tool: "read",
    state,
  };
  return {
    info: {
      id: part.messageID,
      sessionID: part.sessionID,
      time: { created: start - 1 },
    },
    parts: [part as Part],
  };
}

function clientWithMessages(
  messages: VisualizerGraphClient["session"]["messages"],
): Pick<VisualizerGraphClient, "session"> {
  return {
    session: {
      messages,
      children: async () => response([]),
    },
  };
}

describe("paged session tool-call loading", () => {
  test("uses 200-item cursors and returns calls in chronological order", async () => {
    const requests: Array<{ limit: number; before?: string }> = [];
    const client = clientWithMessages(async (input) => {
      requests.push({ limit: input.limit, before: input.before });
      if (!input.before) return response([toolMessage("new", 30)], "older");
      return response([toolMessage("old", 10)]);
    });

    const loaded = await loadPagedSessionToolCalls(
      client,
      { id: "root", title: "Root session" },
      {
        directory: "/workspace",
      },
    );

    expect(requests).toEqual([
      { limit: TOOL_CALL_PAGE_SIZE, before: undefined },
      { limit: TOOL_CALL_PAGE_SIZE, before: "older" },
    ]);
    expect(loaded.toolCalls.map((call) => call.id)).toEqual([
      "part-old",
      "part-new",
    ]);
    expect(loaded.coverage).toEqual({
      sessionID: "root",
      pagesLoaded: 2,
      cursorsFollowed: 1,
      messagesLoaded: 2,
      toolCallsLoaded: 2,
    });
  });

  test("preserves session IDs, titles, state metadata, and the original tool part", async () => {
    const message = toolMessage("metadata", 20, {
      filepath: "/workspace/src/metadata.ts",
      loaded: ["AGENTS.md"],
    });
    const client = clientWithMessages(async () => response([message]));

    const loaded = await loadPagedSessionToolCalls(client, {
      id: "root",
      title: "Trace me",
      parentID: "parent",
    });
    const call = loaded.toolCalls[0]!;

    expect(call).toMatchObject({
      callID: "call-metadata",
      messageID: "message-metadata",
      sessionID: "root",
      parentSessionID: "parent",
      sessionTitle: "Trace me",
      metadata: {
        filepath: "/workspace/src/metadata.ts",
        loaded: ["AGENTS.md"],
      },
    });
    expect(call.part).toBe(message.parts[0] as ToolPart);
  });

  test("rejects repeated cursors with partial coverage instead of returning an incomplete load", async () => {
    const client = clientWithMessages(async () => response([], "repeat"));

    try {
      await loadPagedSessionToolCalls(client, { id: "root", title: "Root" });
      throw new Error("expected repeated cursor rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(VisualizerGraphLoadError);
      expect(error).toMatchObject({
        stage: "messages",
        coverage: {
          sessionID: "root",
          pagesLoaded: 2,
          cursorsFollowed: 1,
          messagesLoaded: 0,
          toolCallsLoaded: 0,
        },
      });
    }
  });
});

test("session closure expands breadths in parallel and deduplicates descendants and cycles", async () => {
  const graph: Record<
    string,
    Array<{ id: string; title: string; parentID?: string }>
  > = {
    root: [
      { id: "a", title: "A", parentID: "root" },
      { id: "b", title: "B", parentID: "root" },
      { id: "a", title: "A duplicate", parentID: "root" },
    ],
    a: [{ id: "root", title: "Cycle" }],
    b: [{ id: "leaf", title: "Leaf", parentID: "b" }],
    leaf: [],
  };
  let active = 0;
  let maxActive = 0;
  const expanded: string[] = [];
  const client = clientWithMessages(async () => response([]));
  client.session.children = async ({ sessionID }) => {
    expanded.push(sessionID);
    active++;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active--;
    return response(graph[sessionID] ?? []);
  };

  const loaded = await loadSessionClosure(client, [
    { id: "root", title: "Root" },
  ]);

  expect(loaded.sessions.map((session) => session.id)).toEqual([
    "root",
    "a",
    "b",
    "leaf",
  ]);
  expect(expanded).toEqual(["root", "a", "b", "leaf"]);
  expect(maxActive).toBe(2);
  expect(loaded.coverage).toEqual({
    requestedRoots: 1,
    sessionsDiscovered: 4,
    sessionsExpanded: 4,
    levelsLoaded: 3,
  });
});

test("selected session-tree loading carries descendant identity and metadata into chronological calls", async () => {
  const client = clientWithMessages(async ({ sessionID }) => {
    const message = toolMessage(sessionID, sessionID === "root" ? 20 : 10, {
      session: sessionID,
    });
    const part = message.parts[0] as ToolPart;
    part.sessionID = sessionID;
    part.messageID = `message-${sessionID}`;
    return response([message]);
  });
  client.session.children = async ({ sessionID }) =>
    response(
      sessionID === "root"
        ? [{ id: "child", title: "Child", parentID: "root" }]
        : [],
    );

  const loaded = await loadSelectedSessionTree(client, {
    id: "root",
    title: "Root",
  });

  expect(
    loaded.toolCalls.map((call) => [
      call.sessionID,
      call.parentSessionID,
      call.sessionTitle,
    ]),
  ).toEqual([
    ["child", "root", "Child"],
    ["root", undefined, "Root"],
  ]);
  expect(loaded.toolCalls[0]?.metadata).toEqual({ session: "child" });
  expect(loaded.coverage).toMatchObject({
    sessionsDiscovered: 2,
    sessionsLoaded: 2,
    toolCallsLoaded: 2,
  });
});

test("workspace inventory skips ignored, heavy, unsafe, and non-file entries while retaining untouched files", async () => {
  const lists: string[] = [];
  const nodes: Record<string, unknown[]> = {
    ".": [
      {
        name: "src",
        path: "src/",
        absolute: "/workspace/src",
        type: "directory",
        ignored: false,
      },
      {
        name: "node_modules",
        path: "node_modules/",
        absolute: "/workspace/node_modules",
        type: "directory",
        ignored: false,
      },
      {
        name: "ignored",
        path: "ignored/",
        absolute: "/workspace/ignored",
        type: "directory",
        ignored: true,
      },
      {
        name: "README.md",
        path: "README.md",
        absolute: "/workspace/README.md",
        type: "file",
        ignored: false,
      },
      {
        name: "outside",
        path: "../outside",
        absolute: "/outside",
        type: "directory",
        ignored: false,
      },
      {
        name: "link",
        path: "link",
        absolute: "/workspace/link",
        type: "symlink",
        ignored: false,
      },
    ],
    src: [
      {
        name: "used.ts",
        path: "src/used.ts",
        absolute: "/workspace/src/used.ts",
        type: "file",
        ignored: false,
      },
      {
        name: "untouched.ts",
        path: "src/untouched.ts",
        absolute: "/workspace/src/untouched.ts",
        type: "file",
        ignored: false,
      },
      {
        name: "escape",
        path: "src/../escape",
        absolute: "/workspace/escape",
        type: "directory",
        ignored: false,
      },
    ],
  };
  const client: Pick<VisualizerGraphClient, "file"> = {
    file: {
      list: async ({ path }) => {
        lists.push(path);
        return response(nodes[path] as never[]);
      },
    },
  };

  const loaded = await loadWorkspaceFileInventory(client, "/workspace");
  const usage = aggregateFileUsage("/workspace", loaded.files, []);

  expect(lists).toEqual([".", "src"]);
  expect(loaded.files.map((file) => file.path)).toEqual([
    "README.md",
    "src/untouched.ts",
    "src/used.ts",
  ]);
  expect(
    usage.files.find((file) => file.file === "src/untouched.ts"),
  ).toMatchObject({ accesses: 0, heat: 0 });
  expect(loaded.coverage).toEqual({
    directoriesVisited: 2,
    filesFound: 3,
    ignoredEntries: 1,
    heavyDirectoriesSkipped: 1,
    unsafeEntries: 2,
    nonFileEntries: 1,
  });
});

test("SDK failures reject with the inventory completed before the failure", async () => {
  const client: Pick<VisualizerGraphClient, "file"> = {
    file: {
      list: async ({ path }) => {
        if (path === ".") {
          return response([
            {
              name: "src",
              path: "src/",
              absolute: "/workspace/src",
              type: "directory",
              ignored: false,
            },
            {
              name: "README.md",
              path: "README.md",
              absolute: "/workspace/README.md",
              type: "file",
              ignored: false,
            },
          ]);
        }
        return {
          error: new Error("list failed"),
          response: { headers: { get: () => null } },
        };
      },
    },
  };

  try {
    await loadWorkspaceFileInventory(client, "/workspace");
    throw new Error("expected inventory rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(VisualizerGraphLoadError);
    expect(error).toMatchObject({
      stage: "files",
      coverage: {
        directoriesVisited: 1,
        filesFound: 1,
        ignoredEntries: 0,
        heavyDirectoriesSkipped: 0,
        unsafeEntries: 0,
        nonFileEntries: 0,
      },
    });
  }
});
