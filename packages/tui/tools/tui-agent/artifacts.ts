import path from "node:path";
import type { CapturedFrame } from "@opentui/core";
import type { TestRendererSetup } from "@opentui/core/testing";
import type { AdapterInspection, LayoutDiagnostic, StepResult } from "./types";

export function normalizeFrame(frame: string) {
  const lines = frame.split("\n").map((line) => line.trimEnd());
  while (lines.at(-1) === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

export async function captureArtifacts(input: {
  setup: TestRendererSetup;
  directory: string;
  index: number;
  label: string;
  action: string;
  durationMs: number;
  inspection?: AdapterInspection;
}): Promise<StepResult> {
  const stem = `${String(input.index).padStart(3, "0")}-${slug(input.label)}`;
  const framePath = path.join(input.directory, `${stem}.txt`);
  const spansPath = path.join(input.directory, `${stem}.spans.json`);
  const svgPath = path.join(input.directory, `${stem}.svg`);
  const treePath = path.join(input.directory, `${stem}.tree.json`);
  const statePath = path.join(input.directory, `${stem}.state.json`);
  const spans = input.setup.captureSpans();
  const state = captureState(input.setup, input.inspection);
  await Promise.all([
    Bun.write(framePath, normalizeFrame(input.setup.captureCharFrame())),
    Bun.write(spansPath, `${JSON.stringify(serializeFrame(spans), null, 2)}\n`),
    Bun.write(svgPath, frameToSvg(spans)),
    Bun.write(
      treePath,
      `${JSON.stringify(captureTree(input.setup), null, 2)}\n`,
    ),
    Bun.write(statePath, `${JSON.stringify(state, null, 2)}\n`),
  ]);
  return {
    index: input.index,
    action: input.action,
    label: input.label,
    durationMs: input.durationMs,
    frame: framePath,
    spans: spansPath,
    svg: svgPath,
    tree: treePath,
    state: statePath,
    diagnostics: state.diagnostics,
  };
}

export function captureState(
  setup: TestRendererSetup,
  inspection?: AdapterInspection,
) {
  const focused = setup.renderer.currentFocusedRenderable;
  const editor = setup.renderer.currentFocusedEditor;
  return {
    terminal: {
      width: setup.renderer.width,
      height: setup.renderer.height,
      cursor: setup.captureSpans().cursor,
    },
    focus: {
      renderable: focused
        ? {
            id: focused.id,
            type: focused.constructor.name,
            bounds: bounds(focused),
          }
        : null,
      editor: editor
        ? {
            id: editor.id,
            type: editor.constructor.name,
            bounds: bounds(editor),
          }
        : null,
    },
    adapter: inspection ?? null,
    renderer: {
      frameId: setup.renderer.frameId,
      scheduler: setup.renderer.getSchedulerState(),
      native: setup.getNativeStats(),
    },
    diagnostics: {
      layout: analyzeLayout(setup),
    },
  };
}

function analyzeLayout(setup: TestRendererSetup): LayoutDiagnostic[] {
  const viewport = {
    width: setup.renderer.width,
    height: setup.renderer.height,
  };
  const focused = setup.renderer.currentFocusedRenderable;
  const issues: LayoutDiagnostic[] = [];
  function visit(node: any, parentOverflows: boolean) {
    if (node.visible !== true) return;
    const nodeBounds = "screenX" in node ? bounds(node) : undefined;
    let overflows = false;
    if (
      nodeBounds &&
      node !== setup.renderer.root &&
      nodeBounds.width > 0 &&
      nodeBounds.height > 0
    ) {
      const overflow = {
        left: Math.max(0, -nodeBounds.x),
        top: Math.max(0, -nodeBounds.y),
        right: Math.max(0, nodeBounds.x + nodeBounds.width - viewport.width),
        bottom: Math.max(0, nodeBounds.y + nodeBounds.height - viewport.height),
      };
      const overflowCells =
        overflow.left + overflow.top + overflow.right + overflow.bottom;
      overflows = overflowCells > 0;
      const meaningful =
        !parentOverflows ||
        node.focusable ||
        node === focused ||
        node.constructor?.name === "ASCIIFontRenderable";
      if (overflows && meaningful) {
        const fullyOffscreen =
          nodeBounds.x >= viewport.width ||
          nodeBounds.y >= viewport.height ||
          nodeBounds.x + nodeBounds.width <= 0 ||
          nodeBounds.y + nodeBounds.height <= 0;
        issues.push({
          code: fullyOffscreen ? "fully-offscreen" : "viewport-overflow",
          severity: node === focused || node.focusable ? "error" : "warning",
          id: node.id,
          type: node.constructor?.name ?? "Unknown",
          bounds: nodeBounds,
          overflow,
          clippedFraction: Number(
            Math.min(
              1,
              overflowCells / (nodeBounds.width + nodeBounds.height),
            ).toFixed(3),
          ),
        });
      }
    }
    if (
      node.focusable &&
      nodeBounds &&
      (nodeBounds.width <= 0 || nodeBounds.height <= 0)
    ) {
      issues.push({
        code: "zero-size-focus-target",
        severity: "error",
        id: node.id,
        type: node.constructor?.name ?? "Unknown",
        bounds: nodeBounds,
      });
    }
    const children =
      typeof node.getChildren === "function" ? node.getChildren() : [];
    for (const child of children) visit(child, parentOverflows || overflows);
  }
  visit(setup.renderer.root, false);
  return issues.slice(0, 50);
}

export function serializeFrame(frame: CapturedFrame) {
  return {
    cols: frame.cols,
    rows: frame.rows,
    cursor: frame.cursor,
    lines: frame.lines.map((line) => ({
      spans: line.spans.map((span) => ({
        text: span.text,
        width: span.width,
        attributes: span.attributes,
        fg: span.fg.toInts(),
        bg: span.bg.toInts(),
      })),
    })),
  };
}

export function frameToSvg(frame: CapturedFrame) {
  const cellWidth = 9;
  const cellHeight = 18;
  const width = frame.cols * cellWidth;
  const height = frame.rows * cellHeight;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#111418"/>`,
    `<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14" xml:space="preserve">`,
  ];
  frame.lines.forEach((line, row) => {
    let column = 0;
    for (const span of line.spans) {
      const [fr, fg, fb, fa] = span.fg.toInts();
      const [br, bg, bb, ba] = span.bg.toInts();
      if (ba > 0) {
        parts.push(
          `<rect x="${column * cellWidth}" y="${row * cellHeight}" width="${span.width * cellWidth}" height="${cellHeight}" fill="rgb(${br},${bg},${bb})" fill-opacity="${ba / 255}"/>`,
        );
      }
      if (span.text) {
        const style = [
          span.attributes & 1 ? "font-weight:bold" : "",
          span.attributes & 4 ? "font-style:italic" : "",
          span.attributes & 8 ? "text-decoration:underline" : "",
        ]
          .filter(Boolean)
          .join(";");
        parts.push(
          `<text x="${column * cellWidth}" y="${row * cellHeight + 14}" fill="rgb(${fr},${fg},${fb})" fill-opacity="${fa / 255}"${style ? ` style="${style}"` : ""}>${escapeXml(span.text)}</text>`,
        );
      }
      column += span.width;
    }
  });
  const [cursorX, cursorY] = frame.cursor;
  parts.push(
    `<rect x="${cursorX * cellWidth}" y="${cursorY * cellHeight}" width="${cellWidth}" height="${cellHeight}" fill="none" stroke="#ffcc00" stroke-width="1"/>`,
    "</g>",
    "</svg>",
    "",
  );
  return parts.join("\n");
}

function captureTree(setup: TestRendererSetup) {
  const focused = setup.renderer.currentFocusedRenderable;
  let count = 0;
  function visit(node: any): unknown {
    count++;
    if (count > 2_000) return { truncated: true };
    const children =
      typeof node.getChildren === "function" ? node.getChildren() : [];
    return {
      id: node.id,
      type: node.constructor?.name ?? "Unknown",
      visible: node.visible,
      focused: node === focused || node.focused === true,
      focusable: node.focusable,
      bounds:
        "screenX" in node
          ? {
              x: node.screenX,
              y: node.screenY,
              width: node.width,
              height: node.height,
            }
          : undefined,
      children: children.map(visit),
    };
  }
  return {
    focused: focused
      ? { id: focused.id, type: focused.constructor?.name }
      : null,
    root: visit(setup.renderer.root),
  };
}

function bounds(node: {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
}) {
  return {
    x: node.screenX,
    y: node.screenY,
    width: node.width,
    height: node.height,
  };
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "frame"
  );
}
