import {
  safeRelativeGraphPath,
  type GraphScene,
  type GraphTone,
  type GraphValue,
} from "./visualizer-graph-layout";

export type GraphExportFormat = "svg" | "csv" | "json";

export type GraphExportOptions = {
  width?: number;
  height?: number;
  palette?: Partial<Record<GraphTone, string>>;
};

export const GRAPH_EXPORT_PALETTE: Record<GraphTone, string> = {
  panel: "#111318",
  grid: "#343941",
  muted: "#7f8794",
  text: "#edf0f5",
  primary: "#f0ad7f",
  secondary: "#78a9ff",
  accent: "#a98bed",
  success: "#77cf8a",
  warning: "#eab05f",
  error: "#e46c76",
  info: "#57bdc9",
  "heat-0": "#2a2e36",
  "heat-1": "#31545b",
  "heat-2": "#3a7a80",
  "heat-3": "#b07c45",
  "heat-4": "#e6aa5c",
};

const PRIVATE_KEY =
  /^(?:absolute|absolutePath|workspaceRoot|raw|rawOutput|output)$/i;

function safeExportString(value: string) {
  if (/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value))
    return safeRelativeGraphPath(value);
  return value;
}

function safeScene(scene: GraphScene): GraphScene {
  const safe = JSON.parse(
    JSON.stringify(scene, (key, value) => {
      if (PRIVATE_KEY.test(key)) return undefined;
      return typeof value === "string" ? safeExportString(value) : value;
    }),
  ) as GraphScene;
  safe.table.columns = safe.table.columns.filter(
    (column) => !PRIVATE_KEY.test(column),
  );
  return safe;
}

function xml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function dimension(value: number | undefined, fallback: number) {
  return Math.round(
    Math.max(320, Math.min(4096, finite(value ?? fallback, fallback))),
  );
}

function number(value: number) {
  const fixed = finite(value, 0).toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed.replace(/0$/, "");
}

function resolvedPalette(overrides: GraphExportOptions["palette"]) {
  const palette = { ...GRAPH_EXPORT_PALETTE };
  for (const [tone, value] of Object.entries(overrides ?? {}) as [
    GraphTone,
    string,
  ][]) {
    if (/^#[0-9a-f]{6}$/i.test(value)) palette[tone] = value;
  }
  return palette;
}

export function exportGraphSvg(
  sceneInput: GraphScene,
  options: GraphExportOptions = {},
) {
  const scene = safeScene(sceneInput);
  const width = dimension(options.width, 1200);
  const height = dimension(options.height, 720);
  const palette = resolvedPalette(options.palette);
  const bounds = scene.bounds;
  const scaleX = width / Math.max(Number.EPSILON, bounds.width);
  const scaleY = height / Math.max(Number.EPSILON, bounds.height);
  const x = (value: number) => (value - bounds.x) * scaleX;
  const y = (value: number) => (value - bounds.y) * scaleY;
  const w = (value: number) => value * scaleX;
  const h = (value: number) => value * scaleY;
  const color = (tone: GraphTone) => palette[tone] ?? palette.muted;
  const titleID = `graph-title-${scene.mode}`;
  const descriptionID = `graph-description-${scene.mode}`;
  const output: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleID} ${descriptionID}">`,
    `<title id="${titleID}">${xml(scene.summary.title)}</title>`,
    `<desc id="${descriptionID}">${xml(scene.summary.description)}</desc>`,
    `<rect width="${width}" height="${height}" fill="${color("panel")}"/>`,
  ];

  for (const area of scene.areas) {
    const points = area.points
      .map((point) => `${number(x(point.x))},${number(y(point.y))}`)
      .join(" ");
    output.push(
      `<polygon data-id="${xml(area.id)}" points="${points}" fill="${color(area.tone)}" opacity="${number(area.opacity)}"/>`,
    );
  }

  for (const axis of scene.axes) {
    output.push(
      `<line x1="${number(x(axis.start.x))}" y1="${number(y(axis.start.y))}" x2="${number(x(axis.end.x))}" y2="${number(y(axis.end.y))}" stroke="${color(axis.tone)}" stroke-width="1"/>`,
    );
    for (const tick of axis.ticks) {
      if (axis.orientation === "x") {
        const tickX = x(tick.position);
        const tickY = y(axis.start.y);
        output.push(
          `<line x1="${number(tickX)}" y1="${number(tickY)}" x2="${number(tickX)}" y2="${number(tickY + 5)}" stroke="${color(axis.tone)}"/>`,
        );
        output.push(
          `<text x="${number(tickX)}" y="${number(tickY + 18)}" text-anchor="middle" fill="${color("muted")}" font-size="11">${xml(tick.label)}</text>`,
        );
      } else {
        const tickX = x(axis.start.x);
        const tickY = y(tick.position);
        output.push(
          `<line x1="${number(tickX - 5)}" y1="${number(tickY)}" x2="${number(tickX)}" y2="${number(tickY)}" stroke="${color(axis.tone)}"/>`,
        );
        output.push(
          `<text x="${number(tickX - 8)}" y="${number(tickY + 4)}" text-anchor="end" fill="${color("muted")}" font-size="11">${xml(tick.label)}</text>`,
        );
      }
    }
    if (axis.label) {
      output.push(
        `<text x="${number((x(axis.start.x) + x(axis.end.x)) / 2)}" y="${number(Math.max(y(axis.start.y), y(axis.end.y)) + 36)}" text-anchor="middle" fill="${color("muted")}" font-size="12">${xml(axis.label)}</text>`,
      );
    }
  }

  for (const edge of scene.edges) {
    if (edge.points.length < 2) continue;
    const start = edge.points[0]!;
    const path =
      edge.points.length === 4
        ? `M ${number(x(start.x))} ${number(y(start.y))} C ${number(x(edge.points[1]!.x))} ${number(y(edge.points[1]!.y))}, ${number(x(edge.points[2]!.x))} ${number(y(edge.points[2]!.y))}, ${number(x(edge.points[3]!.x))} ${number(y(edge.points[3]!.y))}`
        : `M ${number(x(start.x))} ${number(y(start.y))} ${edge.points
            .slice(1)
            .map((point) => `L ${number(x(point.x))} ${number(y(point.y))}`)
            .join(" ")}`;
    output.push(
      `<path data-id="${xml(edge.id)}" d="${path}" fill="none" stroke="${color(edge.tone)}" stroke-width="${number(Math.max(1, h(edge.width)))}" stroke-linecap="round" opacity="${number(edge.opacity ?? 1)}"><title>${xml(edge.hit?.label ?? edge.id)}</title></path>`,
    );
  }

  for (const bar of scene.bars) {
    output.push(
      `<rect data-id="${xml(bar.id)}" x="${number(x(bar.x))}" y="${number(y(bar.y))}" width="${number(Math.max(0, w(bar.width)))}" height="${number(Math.max(0, h(bar.height)))}" fill="${color(bar.tone)}"><title>${xml(bar.hit.label)}</title></rect>`,
    );
  }

  for (const node of scene.nodes) {
    const fill = color(node.tone);
    const stroke = node.rimTone ? color(node.rimTone) : fill;
    const strokeWidth = node.rimTone ? 2 : 0;
    const title = `<title>${xml(node.hit.label)}</title>`;
    if (node.shape === "circle") {
      output.push(
        `<ellipse data-id="${xml(node.id)}" cx="${number(x(node.x + node.width / 2))}" cy="${number(y(node.y + node.height / 2))}" rx="${number(Math.max(0.5, w(node.width) / 2))}" ry="${number(Math.max(0.5, h(node.height) / 2))}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}">${title}</ellipse>`,
      );
    } else {
      const radius =
        node.shape === "pill" ? Math.min(w(node.width), h(node.height)) / 2 : 1;
      output.push(
        `<rect data-id="${xml(node.id)}" x="${number(x(node.x))}" y="${number(y(node.y))}" width="${number(Math.max(0, w(node.width)))}" height="${number(Math.max(0, h(node.height)))}" rx="${number(radius)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}">${title}</rect>`,
      );
    }
    if (
      node.label &&
      (node.kind === "session" ||
        node.kind === "tool" ||
        node.kind === "target")
    ) {
      const anchor =
        node.kind === "target"
          ? "end"
          : node.kind === "tool"
            ? "middle"
            : "start";
      const labelX =
        node.kind === "target"
          ? x(node.x) - 5
          : node.kind === "tool"
            ? x(node.x + node.width / 2)
            : x(node.x + node.width) + 5;
      const labelY = y(node.y + node.height / 2) + 4;
      output.push(
        `<text x="${number(labelX)}" y="${number(labelY)}" text-anchor="${anchor}" fill="${color("text")}" font-size="11">${xml(node.label)}</text>`,
      );
    }
  }

  for (const label of scene.labels) {
    const anchor =
      label.align === "start"
        ? "start"
        : label.align === "end"
          ? "end"
          : "middle";
    const size = label.importance === 2 ? 13 : label.importance === 1 ? 11 : 10;
    output.push(
      `<text data-id="${xml(label.id)}" x="${number(x(label.x))}" y="${number(y(label.y))}" text-anchor="${anchor}" fill="${color(label.tone)}" font-size="${size}">${xml(label.text)}</text>`,
    );
  }

  output.push("</svg>");
  return output.join("\n");
}

function csvCell(value: GraphValue | undefined) {
  if (value === null || value === undefined) return "";
  const string = safeExportString(String(value));
  return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function exportGraphCsv(sceneInput: GraphScene) {
  const scene = safeScene(sceneInput);
  const columns = scene.table.columns.filter(
    (column) => !PRIVATE_KEY.test(column),
  );
  const rows = [columns.map(csvCell).join(",")];
  for (const row of scene.table.rows)
    rows.push(columns.map((column) => csvCell(row[column])).join(","));
  return `${rows.join("\r\n")}\r\n`;
}

export function exportGraphJson(sceneInput: GraphScene) {
  return `${JSON.stringify({ format: "spinosa-graph", version: 1, scene: safeScene(sceneInput) }, null, 2)}\n`;
}

export function exportGraphScene(
  scene: GraphScene,
  format: GraphExportFormat,
  options: GraphExportOptions = {},
) {
  if (format === "svg") return exportGraphSvg(scene, options);
  if (format === "csv") return exportGraphCsv(scene);
  return exportGraphJson(scene);
}
