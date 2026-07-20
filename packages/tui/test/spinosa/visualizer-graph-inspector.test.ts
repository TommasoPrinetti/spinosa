import { expect, test } from "bun:test"
import type { GraphHit, GraphScene } from "../../src/routes/spinosa/visualizer-graph-layout"
import {
  formatGraphInspectorDetails,
  formatGraphSummaryMetrics,
  graphInspectorStatus,
} from "../../src/routes/spinosa/visualizer-graph-inspector"

const scene: GraphScene = {
  version: 1,
  mode: "files",
  bounds: { x: 0, y: 0, width: 1, height: 1 },
  plotBounds: { x: 0, y: 0, width: 1, height: 1 },
  nodes: [],
  edges: [],
  bars: [],
  areas: [],
  labels: [],
  axes: [],
  table: { columns: [], rows: [] },
  summary: {
    title: "Files",
    description: "Workspace files",
    metrics: { files: 4, absolutePath: "/private/work", rawOutput: "secret" },
    timing: "ordinal",
  },
}

test("inspector prioritizes safe aggregate fields and drops raw or absolute values", () => {
  const hit = {
    kind: "file",
    id: "file:notes",
    label: "notes.md",
    data: {
      mutations: 2,
      path: "docs/notes.md",
      reads: 7,
      absolute: "/private/work/docs/notes.md",
      rawOutput: "secret",
      target: "/private/work/other.md",
    },
  } satisfies GraphHit

  expect(formatGraphInspectorDetails(hit)).toEqual([
    { key: "path", label: "path", value: "docs/notes.md" },
    { key: "reads", label: "reads", value: "7" },
    { key: "mutations", label: "mutations", value: "2" },
  ])
  expect(graphInspectorStatus(scene, hit)).toBe("FILE")
  expect(formatGraphSummaryMetrics(scene)).toEqual([{ key: "files", label: "files", value: "4" }])
})
