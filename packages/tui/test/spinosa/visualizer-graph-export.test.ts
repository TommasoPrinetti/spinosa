import { describe, expect, test } from "bun:test";
import {
  GRAPH_EXPORT_PALETTE,
  exportGraphCsv,
  exportGraphJson,
  exportGraphScene,
  exportGraphSvg,
} from "../../src/routes/spinosa/visualizer-graph-export";
import {
  buildFilesScene,
  buildFlowScene,
} from "../../src/routes/spinosa/visualizer-graph-layout";

describe("SVG graph export", () => {
  test("exports the full scene with escaped XML text", () => {
    const scene = buildFlowScene({
      calls: [
        {
          id: 'call<&"',
          tool: 'read<&"',
          status: "completed",
          sessionTitle: 'Research & <review> "one"',
          target: 'docs/<a&b>".md',
          targetKind: "file",
        },
      ],
      files: [],
    });
    scene.summary.title = 'Trace & <flow> "report"';
    const svg = exportGraphSvg(scene, { width: 900, height: 600 });

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
      true,
    );
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("Trace &amp; &lt;flow&gt; &quot;report&quot;");
    expect(svg).toContain("Research &amp; &lt;review&gt; &quot;one&quot;");
    expect(svg).not.toContain("Research & <review>");
    expect(svg).toContain("<path");
    expect(GRAPH_EXPORT_PALETTE["heat-4"]).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("CSV graph export", () => {
  test("uses RFC 4180 quoting and strips private columns and absolute paths", () => {
    const scene = buildFilesScene({
      calls: [],
      files: [{ path: "placeholder.md" }],
    });
    scene.table = {
      columns: ["path", "label", "count", "absolute", "output"],
      rows: [
        {
          path: 'docs/a,b"c\n.md',
          label: "line one\nline two",
          count: 2,
          absolute: "/Users/person/workspace/docs/a.md",
          output: "private tool output",
        },
        { path: "/Users/person/workspace/secret.md", label: "plain", count: 1 },
      ],
    };

    const csv = exportGraphCsv(scene);
    expect(csv).toStartWith("path,label,count\r\n");
    expect(csv).toContain('"docs/a,b""c\n.md","line one\nline two",2\r\n');
    expect(csv).toContain("External/secret.md,plain,1\r\n");
    expect(csv).not.toContain("absolute");
    expect(csv).not.toContain("private tool output");
    expect(csv).not.toContain("/Users/");
  });
});

describe("JSON graph export", () => {
  test("is versioned and recursively omits raw output and absolute roots", () => {
    const scene = buildFilesScene({
      files: [{
        file: { path: "raw/private.md" },
        reads: 3,
        searches: 1,
        heat: 4,
      }, {
        file: { path: "raw/sub/doc.md" },
        reads: 0,
        searches: 0,
        heat: 0,
      }],
      calls: [],
    });
    scene.table.columns.push("absolute", "output");
    scene.table.rows[0]!.absolute = "/Users/person/workspace";
    scene.table.rows[0]!.output = "super-secret raw output";
    scene.nodes[0]!.hit.data.absolute = "/Users/person/workspace/private.txt";
    scene.nodes[0]!.hit.data.output = "super-secret nested output";
    scene.summary.metrics.rawOutput = "super-secret summary output";

    const json = exportGraphScene(scene, "json");
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe("spinosa-graph");
    expect(parsed.version).toBe(1);
    expect(parsed.scene.version).toBe(1);
    expect(parsed.scene.table.columns).not.toContain("absolute");
    expect(parsed.scene.table.columns).not.toContain("output");
    expect(json).not.toContain("super-secret");
    expect(json).not.toContain("/Users/person");
    expect(parsed.scene.table.rows[0]?.path).toBe("raw/private.md");
    expect(parsed.scene.nodes[0]?.hit?.data?.reads).toBe(3);
    expect(exportGraphJson(scene)).toBe(json);
  });
});
