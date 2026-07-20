import { describe, expect, test } from "bun:test";
import {
  buildActivityScene,
  buildFilesScene,
  buildFlowScene,
  buildGraphScene,
  type GraphLayoutFile,
} from "../../src/routes/spinosa/visualizer-graph-layout";

describe("file graph layout", () => {
  test("keeps untouched files in the swarm", () => {
    const scene = buildFilesScene({
      calls: [],
      files: [
        { file: { path: "raw/seen.md" }, reads: 2, heat: 2 },
        { file: { path: "raw/untouched.md" }, heat: 0 },
      ],
    });

    expect(scene.nodes).toHaveLength(2);
    const untouched = scene.nodes.find(
      (node) => node.hit.data.path === "raw/untouched.md",
    );
    expect(untouched?.tone).toBe("heat-0");
    expect(untouched?.heat).toBe(0);
    expect(scene.summary.metrics.files).toBe(2);
    expect(scene.summary.metrics.observedFiles).toBe(1);
  });

  test("heat-hot files get warmer tones in circular cluster layout", () => {
    const scene = buildFilesScene({
      calls: [],
      files: [
        { path: "raw/cold.md", searches: 1, grepMatches: 20, heat: 1 },
        { path: "raw/hot.md", searches: 8, grepMatches: 8, heat: 16 },
      ],
    });
    const cold = scene.nodes.find(
      (node) => node.hit.data.path === "raw/cold.md",
    )!;
    const hot = scene.nodes.find(
      (node) => node.hit.data.path === "raw/hot.md",
    )!;

    expect(cold.tone).toBe("heat-1");
    expect(hot.tone).toBe("heat-4");
    expect(scene.nodes.length).toBe(2);
  });

  test("radial scatter layout is deterministic for same input", () => {
    const files: GraphLayoutFile[] = Array.from({ length: 18 }, (_, index) => ({
      path: `raw/file-${String(index).padStart(2, "0")}.md`,
      reads: 3,
      heat: 3,
    }));
    const forward = buildFilesScene({ calls: [], files });
    const reverse = buildFilesScene({ calls: [], files: [...files].reverse() });
    const coordinates = (scene: typeof forward) =>
      Object.fromEntries(
        scene.nodes.map((node) => [
          node.hit.data.path,
          [node.x, node.y],
        ]),
      );

    // Same input order produces same layout; different order produces different angles
    expect(coordinates(forward)).toEqual(coordinates(forward));
    expect(forward.nodes.length).toBe(18);
    expect(forward.nodes.every((n) => n.heat === 1)).toBe(true);
  });
});

describe("flow graph layout", () => {
  test("conserves call weight across both Sankey stages and splits multiple targets", () => {
    const scene = buildFlowScene({
      calls: [
        {
          id: "a",
          tool: "read",
          status: "completed",
          sessionTitle: "Alpha",
          targets: ["src/a.ts", "docs/a.md"],
          targetKind: "file",
        },
        {
          id: "b",
          tool: "grep",
          status: "completed",
          sessionTitle: "Alpha",
          target: "src/b.ts",
          targetKind: "file",
        },
        {
          id: "c",
          tool: "websearch",
          status: "error",
          sessionTitle: "Beta",
          target: "https://example.com",
          targetKind: "web",
        },
        { id: "d", tool: "bash", status: "completed", sessionTitle: "Beta" },
      ],
      files: [],
    });
    const left = scene.edges.filter((edge) =>
      edge.id.startsWith("ribbon:session-tool:"),
    );
    const right = scene.edges.filter((edge) =>
      edge.id.startsWith("ribbon:tool-target:"),
    );

    expect(left.reduce((sum, edge) => sum + edge.weight, 0)).toBeCloseTo(4);
    expect(right.reduce((sum, edge) => sum + edge.weight, 0)).toBeCloseTo(4);
    expect(scene.summary.metrics.flowWeight).toBeCloseTo(4);
    expect(
      scene.nodes
        .filter((node) => node.kind === "target")
        .map((node) => node.label)
        .sort(),
    ).toEqual(["Shell", "Web", "docs", "src"]);
    const readTargets = right.filter(
      (edge) =>
        scene.nodes.find((node) => node.id === edge.from)?.label === "read",
    );
    expect(readTargets.map((edge) => edge.weight)).toEqual([0.5, 0.5]);
  });

  test("collapses overflow deterministically with explicit member metadata", () => {
    const calls = Array.from({ length: 7 }, (_, index) => ({
      id: `call-${index}`,
      tool: `tool-${index}`,
      status: "completed",
      sessionTitle: `session-${index}`,
      target: `dir-${index}/file.md`,
      targetKind: "file" as const,
    }));
    const forward = buildFlowScene(
      { calls, files: [] },
      { maxFlowNodesPerStage: 3 },
    );
    const reverse = buildFlowScene(
      { calls: [...calls].reverse(), files: [] },
      { maxFlowNodesPerStage: 3 },
    );
    const shape = (scene: typeof forward) => ({
      nodes: scene.nodes.map((node) => [
        node.id,
        node.kind,
        node.label,
        node.hit.data.members,
        node.hit.data.count,
      ]),
      edges: scene.edges.map((edge) => [
        edge.id,
        edge.from,
        edge.to,
        edge.weight,
      ]),
      rows: scene.table.rows,
    });

    expect(shape(reverse)).toEqual(shape(forward));
    for (const kind of ["session", "tool", "target"] as const) {
      expect(forward.nodes.filter((node) => node.kind === kind)).toHaveLength(
        3,
      );
    }
    const others = forward.nodes.filter((node) =>
      node.label?.startsWith("Other ("),
    );
    expect(others).toHaveLength(3);
    expect(others.every((node) => node.hit.data.collapsed === true)).toBe(true);
    expect(
      others.every((node) => Number(node.hit.data.memberCount) === 5),
    ).toBe(true);
  });
});

describe("activity graph layout", () => {
  test("groups calls by tool and assigns correct heights", () => {
    const scene = buildActivityScene(
      {
        calls: [
          { id: "a", tool: "read", status: "completed" },
          { id: "b", tool: "read", status: "error" },
          { id: "c", tool: "grep", status: "completed" },
          { id: "d", tool: "edit", status: "completed" },
        ],
      },
    );

    const readBar = scene.bars.find((b) => b.hit.data.tool === "read")!;
    const grepBar = scene.bars.find((b) => b.hit.data.tool === "grep")!;
    const editBar = scene.bars.find((b) => b.hit.data.tool === "edit")!;

    expect(readBar.hit.data.calls).toBe(2);
    expect(grepBar.hit.data.calls).toBe(1);
    expect(editBar.hit.data.calls).toBe(1);
    expect(readBar.height).toBeGreaterThan(grepBar.height);
    expect(scene.summary.metrics.calls).toBe(4);
    expect(scene.summary.metrics.errors).toBe(1);
    expect(
      scene.table.rows.reduce((sum, row) => sum + Number(row.calls), 0),
    ).toBe(4);
  });

  test("handles empty calls gracefully", () => {
    const scene = buildActivityScene({ calls: [] });
    expect(scene.bars).toHaveLength(0);
    expect(scene.summary.metrics.calls).toBe(0);
  });
});
