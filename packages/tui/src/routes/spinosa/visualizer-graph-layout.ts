export type GraphMode = "files" | "flow" | "activity";

export type GraphTone =
  | "panel"
  | "grid"
  | "muted"
  | "text"
  | "primary"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "heat-0"
  | "heat-1"
  | "heat-2"
  | "heat-3"
  | "heat-4";

export type GraphPoint = { x: number; y: number };
export type GraphBounds = GraphPoint & { width: number; height: number };
export type GraphValue = string | number | boolean | null;

export type GraphHit = {
  kind: "call" | "file" | "session" | "tool" | "target" | "flow" | "bucket";
  id: string;
  label: string;
  data: Record<string, GraphValue>;
};

export type GraphNode = {
  id: string;
  kind: "call" | "file" | "session" | "tool" | "target";
  shape: "rect" | "circle" | "pill";
  x: number;
  y: number;
  width: number;
  height: number;
  tone: GraphTone;
  rimTone?: GraphTone;
  heat?: number;
  label?: string;
  hit: GraphHit;
};

export type GraphEdge = {
  id: string;
  kind: "sequence" | "ribbon";
  from: string;
  to: string;
  points: GraphPoint[];
  width: number;
  tone: GraphTone;
  weight: number;
  opacity?: number;
  hit?: GraphHit;
};

export type GraphBar = {
  id: string;
  groupId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone: GraphTone;
  value: number;
  label?: string;
  hit: GraphHit;
};

export type GraphArea = {
  id: string;
  kind: "band" | "plot";
  points: GraphPoint[];
  tone: GraphTone;
  opacity: number;
  label?: string;
  hit?: GraphHit;
};

export type GraphLabel = {
  id: string;
  x: number;
  y: number;
  text: string;
  tone: GraphTone;
  align: "start" | "center" | "end";
  maxWidth?: number;
  importance: 0 | 1 | 2;
};

export type GraphAxis = {
  id: string;
  orientation: "x" | "y";
  start: GraphPoint;
  end: GraphPoint;
  tone: GraphTone;
  ticks: { value: number; position: number; label: string }[];
  label?: string;
};

export type GraphScene = {
  version: 1;
  mode: GraphMode;
  bounds: GraphBounds;
  plotBounds: GraphBounds;
  nodes: GraphNode[];
  edges: GraphEdge[];
  bars: GraphBar[];
  areas: GraphArea[];
  labels: GraphLabel[];
  axes: GraphAxis[];
  table: {
    columns: string[];
    rows: Record<string, GraphValue>[];
  };
  summary: {
    title: string;
    description: string;
    metrics: Record<string, string | number | boolean>;
    timing: "time" | "ordinal";
    coverage?: string;
  };
};

export type GraphLayoutCall = {
  id: string;
  callID?: string;
  tool: string;
  status: string;
  sessionID?: string;
  sessionId?: string;
  sessionTitle?: string;
  timeStart?: number;
  timeEnd?: number;
  start?: number;
  end?: number;
  durationMs?: number;
  target?: string | readonly string[];
  targets?: readonly (
    | string
    | { value: string; kind?: GraphLayoutCall["targetKind"] }
  )[];
  targetKind?: "file" | "web" | "shell" | "agent" | "external" | "unknown";
};

export type GraphLayoutFileEvent = {
  file: string | { path: string };
  toolCallID: string;
  kind?: string;
};

export type GraphLayoutFile = {
  id?: string;
  path?: string;
  file?: string | { path: string; absolute?: string; ignored?: boolean };
  directory?: string;
  reads?: number;
  searches?: number;
  grepMatches?: number;
  discoveries?: number;
  writes?: number;
  edits?: number;
  patches?: number;
  mutations?: number;
  accesses?: number;
  heat?: number;
  sessions?: number | readonly string[];
  lastAccessed?: number;
};

export type GraphLayoutModel = {
  calls: readonly GraphLayoutCall[];
  files: readonly GraphLayoutFile[];
  events?: readonly GraphLayoutFileEvent[];
  workspaceRoot?: string;
  coverage?: string;
};

export type GraphLayoutOptions = {
  maxFileLanes?: number;
  maxFlowNodesPerStage?: number;
  activityBins?: number;
};

const WORLD_BOUNDS: GraphBounds = { x: 0, y: 0, width: 1, height: 1 };
const FILE_PLOT: GraphBounds = { x: 0.13, y: 0.07, width: 0.83, height: 0.84 };
const FLOW_PLOT: GraphBounds = { x: 0.05, y: 0.06, width: 0.9, height: 0.86 };
const ACTIVITY_PLOT: GraphBounds = {
  x: 0.08,
  y: 0.07,
  width: 0.87,
  height: 0.83,
};
const TOOL_TONES: GraphTone[] = [
  "primary",
  "secondary",
  "success",
  "info",
  "accent",
  "primary",
  "secondary",
  "info",
];

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: unknown) {
  return Math.max(0, finite(value));
}

function lexical(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableId(prefix: string, value: string) {
  return `${prefix}:${stableHash(value).toString(36)}`;
}

function toolTone(tool: string): GraphTone {
  return TOOL_TONES[stableHash(tool) % TOOL_TONES.length]!;
}

function heatTone(heat: number, maxHeat: number): GraphTone {
  if (heat <= 0 || maxHeat <= 0) return "heat-0";
  const level = Math.ceil((Math.log1p(heat) / Math.log1p(maxHeat)) * 4);
  return `heat-${clamp(level, 1, 4)}` as GraphTone;
}

function filePath(file: GraphLayoutFile) {
  if (typeof file.path === "string") return file.path;
  if (typeof file.file === "string") return file.file;
  return file.file?.path ?? "";
}

export function safeRelativeGraphPath(input: string, root?: string) {
  const slash = (value: string) =>
    value
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/$/, "");
  let value = slash(input.trim());
  const base = root ? slash(root.trim()) : "";
  const windows = /^[A-Za-z]:\//.test(value);
  const absolute = value.startsWith("/") || windows;
  if (absolute && base) {
    const insensitive = windows || /^[A-Za-z]:\//.test(base);
    const candidate = insensitive ? value.toLowerCase() : value;
    const parent = insensitive ? base.toLowerCase() : base;
    if (candidate === parent) value = ".";
    else if (candidate.startsWith(`${parent}/`))
      value = value.slice(base.length + 1);
  }
  if (value.startsWith("/") || /^[A-Za-z]:\//.test(value)) {
    const name = value.split("/").filter(Boolean).at(-1) ?? "file";
    return `External/${name}`;
  }

  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/") || "(root)";
}

function directoryOf(path: string) {
  const separator = path.indexOf("/");
  return separator === -1 ? "Root" : path.slice(0, separator);
}

function sessionCount(value: GraphLayoutFile["sessions"]) {
  return Array.isArray(value) ? value.length : nonNegative(value);
}

type NormalizedFile = {
  id: string;
  path: string;
  directory: string;
  reads: number;
  searches: number;
  discoveries: number;
  mutations: number;
  accesses: number;
  heat: number;
  sessions: number;
  lastAccessed: number;
};

function normalizeFiles(model: GraphLayoutModel): NormalizedFile[] {
  return model.files
    .map((file) => {
      const path = safeRelativeGraphPath(filePath(file), model.workspaceRoot);
      const reads = nonNegative(file.reads);
      const searches = nonNegative(file.searches);
      const discoveries = nonNegative(file.discoveries);
      const mutations = Math.max(
        nonNegative(file.mutations),
        nonNegative(file.writes) +
          nonNegative(file.edits) +
          nonNegative(file.patches),
      );
      const heat = Math.max(nonNegative(file.heat), reads + searches);
      const accesses = Math.max(
        nonNegative(file.accesses),
        heat + discoveries + mutations,
      );
      return {
        id: file.id || stableId("file", path),
        path,
        directory: file.directory
          ? safeRelativeGraphPath(file.directory, model.workspaceRoot)
          : directoryOf(path),
        reads,
        searches,
        discoveries,
        mutations,
        accesses,
        heat,
        sessions: sessionCount(file.sessions),
        lastAccessed: nonNegative(file.lastAccessed),
      };
    })
    .sort(
      (left, right) =>
        lexical(left.path, right.path) || lexical(left.id, right.id),
    );
}

function laneMap(files: readonly NormalizedFile[], maximum: number) {
  const counts = new Map<string, number>();
  for (const file of files)
    counts.set(file.directory, (counts.get(file.directory) ?? 0) + 1);
  const ranked = [...counts].sort(
    (left, right) => right[1] - left[1] || lexical(left[0], right[0]),
  );
  const limit = Math.max(1, Math.floor(maximum));
  const kept = new Set(
    ranked.slice(0, limit > 1 ? limit - 1 : 1).map(([name]) => name),
  );
  const collapsed = ranked.length > kept.size;
  const nameOf = (file: NormalizedFile) =>
    kept.has(file.directory) || !collapsed
      ? file.directory
      : "Other directories";
  const names = [...new Set(files.map(nameOf))].sort(lexical);
  return { nameOf, names };
}

function alternatingOffset(index: number) {
  if (index === 0) return 0;
  const distance = Math.ceil(index / 2);
  return index % 2 === 1 ? distance : -distance;
}

function xTicks(maximum: number, xFor: (value: number) => number) {
  const values =
    maximum <= 1 ? [0, maximum] : [0, Math.round(maximum / 2), maximum];
  return [...new Set(values)].map((value) => ({
    value,
    position: xFor(value),
    label: String(value),
  }));
}

export function buildFilesScene(
  model: GraphLayoutModel,
  _options: GraphLayoutOptions = {},
): GraphScene {
  const files = normalizeFiles(model);
  const maxHeat = Math.max(1, ...files.map((file) => file.heat));

  const PLOT: GraphBounds = { x: 0.04, y: 0.04, width: 0.92, height: 0.92 };
  const cx = PLOT.x + PLOT.width / 2;
  const cy = PLOT.y + PLOT.height / 2;
  const maxR = Math.min(PLOT.width, PLOT.height) / 2.4;

  const nodes: GraphNode[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const heat = file.heat ?? 0;
    const angle = i * 2.399963; // golden angle
    const radius = heat > 0
      ? maxR * (1 - Math.log1p(heat) / Math.log1p(maxHeat))
      : maxR;
    const dot = 0.005;
    const x = cx + Math.cos(angle) * radius - dot;
    const y = cy + Math.sin(angle) * radius - dot;
    const id = file.id.startsWith("file:") ? file.id : `file:${file.id}`;

    nodes.push({
      id,
      kind: "file",
      shape: "circle",
      x,
      y,
      width: dot * 2,
      height: dot * 2,
      tone: heatTone(heat, maxHeat),
      rimTone: file.mutations > 0 ? "accent" : undefined,
      heat: maxHeat > 0 ? heat / maxHeat : 0,
      label: file.path,
      hit: {
        kind: "file",
        id,
        label: file.path,
        data: {
          path: file.path,
          directory: file.directory,
          heat,
          reads: file.reads,
          searches: file.searches,
          discoveries: file.discoveries,
          mutations: file.mutations,
          accesses: file.accesses,
          sessions: file.sessions,
          lastAccessed: file.lastAccessed || null,
        },
      },
    });
  }

  return {
    version: 1,
    mode: "files",
    bounds: WORLD_BOUNDS,
    plotBounds: PLOT,
    nodes,
    edges: [],
    bars: [],
    areas: [],
    labels: [],
    axes: [],
    table: {
      columns: [
        "path", "directory", "heat", "reads", "searches",
        "discoveries", "mutations", "accesses", "sessions", "lastAccessed",
      ],
      rows: files.map((file) => ({
        path: file.path,
        directory: file.directory,
        heat: file.heat,
        reads: file.reads,
        searches: file.searches,
        discoveries: file.discoveries,
        mutations: file.mutations,
        accesses: file.accesses,
        sessions: file.sessions,
        lastAccessed: file.lastAccessed || null,
      })),
    },
    summary: {
      title: "File activity heatmap",
      description:
        maxHeat > 0
          ? "Hot files cluster at center; colour intensity = attributable reads and searches."
          : "No attributable reads in this scope.",
      metrics: {
        files: files.length,
        observedFiles: files.filter((file) => file.heat > 0).length,
        mutatedFiles: files.filter((file) => file.mutations > 0).length,
        maxHeat,
      },
      timing: "ordinal",
      coverage: model.coverage,
    },
  };
}

type NormalizedCall = GraphLayoutCall & {
  index: number;
  session: string;
  startValue?: number;
  endValue?: number;
};

function normalizeCalls(calls: readonly GraphLayoutCall[]) {
  return calls.map((call, index): NormalizedCall => {
    const start = call.start ?? call.timeStart;
    const end = call.end ?? call.timeEnd;
    return {
      ...call,
      index,
      session:
        call.sessionTitle ||
        call.sessionID ||
        call.sessionId ||
        "Current session",
      startValue:
        typeof start === "number" && Number.isFinite(start) && start > 0
          ? start
          : undefined,
      endValue:
        typeof end === "number" && Number.isFinite(end) && end > 0
          ? end
          : undefined,
    };
  });
}

type FlowObservation = {
  session: string;
  tool: string;
  target: string;
  weight: number;
  errors: number;
};

type FlowGroup = {
  key: string;
  label: string;
  members: string[];
  weight: number;
};

function topLevelTarget(
  value: string,
  kind: GraphLayoutCall["targetKind"],
  root?: string,
) {
  if (kind === "web") return "Web";
  if (kind === "shell") return "Shell";
  if (kind === "agent") return "Agent";
  if (kind === "external") return "External";
  if (kind === "unknown") return "Unknown";
  if (/^https?:\/\//i.test(value)) return "Web";
  const relative = safeRelativeGraphPath(value, root);
  if (relative.startsWith("External/")) return "External";
  if (relative === "(root)") return "Root";
  return relative.split("/")[0] || "Unknown";
}

function inferredTarget(call: GraphLayoutCall) {
  const tool = call.tool.toLowerCase();
  if (tool === "webfetch" || tool === "websearch") return "Web";
  if (tool === "bash") return "Shell";
  if (tool === "task" || tool === "skill") return "Agent";
  return "Unknown";
}

function eventFile(event: GraphLayoutFileEvent) {
  return typeof event.file === "string" ? event.file : event.file.path;
}

function flowObservations(model: GraphLayoutModel) {
  const events = new Map<string, GraphLayoutFileEvent[]>();
  for (const event of model.events ?? []) {
    const group = events.get(event.toolCallID) ?? [];
    group.push(event);
    events.set(event.toolCallID, group);
  }

  const observations: FlowObservation[] = [];
  for (const call of normalizeCalls(model.calls)) {
    const linked = [
      ...new Set(
        [
          ...(events.get(call.callID ?? "") ?? []),
          ...(events.get(call.id) ?? []),
        ].map(eventFile),
      ),
    ].sort(lexical);
    const explicit = (call.targets ?? []).map((target) =>
      typeof target === "string"
        ? { value: target, kind: call.targetKind }
        : { value: target.value, kind: target.kind ?? call.targetKind },
    );
    if (explicit.length === 0) {
      const targets =
        typeof call.target === "string" ? [call.target] : (call.target ?? []);
      explicit.push(
        ...targets.map((value) => ({ value, kind: call.targetKind })),
      );
    }
    if (explicit.length === 0 && linked.length > 0)
      explicit.push(
        ...linked.map((value) => ({ value, kind: "file" as const })),
      );
    const targets = [
      ...new Set(
        explicit.map((target) =>
          topLevelTarget(target.value, target.kind, model.workspaceRoot),
        ),
      ),
    ].sort(lexical);
    if (targets.length === 0) targets.push(inferredTarget(call));
    const weight = 1 / targets.length;
    for (const target of targets) {
      observations.push({
        session: call.session,
        tool: call.tool || "Unknown",
        target,
        weight,
        errors: call.status === "error" ? weight : 0,
      });
    }
  }
  return observations.sort(
    (left, right) =>
      lexical(left.session, right.session) ||
      lexical(left.tool, right.tool) ||
      lexical(left.target, right.target),
  );
}

function stageGroups(
  values: readonly string[],
  weights: ReadonlyMap<string, number>,
  maximum: number,
  stage: string,
) {
  const ranked = [...new Set(values)]
    .map((label) => ({ label, weight: weights.get(label) ?? 0 }))
    .sort(
      (left, right) =>
        right.weight - left.weight || lexical(left.label, right.label),
    );
  const limit = Math.max(1, Math.floor(maximum));
  const keepCount =
    ranked.length > limit ? Math.max(0, limit - 1) : ranked.length;
  const kept = ranked.slice(0, keepCount);
  const overflow = ranked.slice(keepCount);
  const groups: FlowGroup[] = kept.map((entry) => ({
    key: entry.label,
    label: entry.label,
    members: [entry.label],
    weight: entry.weight,
  }));
  if (overflow.length > 0) {
    groups.push({
      key: `__other_${stage}__`,
      label: `Other (${overflow.length})`,
      members: overflow.map((entry) => entry.label).sort(lexical),
      weight: overflow.reduce((sum, entry) => sum + entry.weight, 0),
    });
  }
  const keyByMember = new Map<string, string>();
  for (const group of groups)
    for (const member of group.members) keyByMember.set(member, group.key);
  return { groups, keyByMember };
}

function weightsBy(
  observations: readonly FlowObservation[],
  field: "session" | "tool" | "target",
) {
  const result = new Map<string, number>();
  for (const observation of observations)
    result.set(
      observation[field],
      (result.get(observation[field]) ?? 0) + observation.weight,
    );
  return result;
}

function flowNodeID(stage: "session" | "tool" | "target", key: string) {
  return `flow:${stage}:${stableHash(key).toString(36)}`;
}

function buildFlowStage(
  stage: "session" | "tool" | "target",
  groups: readonly FlowGroup[],
  x: number,
  usableHeight: number,
  totalWeight: number,
  gap: number,
) {
  const used = usableHeight + Math.max(0, groups.length - 1) * gap;
  let cursor = FLOW_PLOT.y + (FLOW_PLOT.height - used) / 2;
  return groups.map((group): GraphNode => {
    const height =
      totalWeight > 0 ? (group.weight / totalWeight) * usableHeight : 0;
    const id = flowNodeID(stage, group.key);
    const node: GraphNode = {
      id,
      kind: stage,
      shape: "rect",
      x,
      y: cursor,
      width: 0.025,
      height,
      tone:
        stage === "tool"
          ? toolTone(group.members[0] ?? group.label)
          : stage === "session"
            ? "primary"
            : "info",
      label: group.label,
      hit: {
        kind: stage,
        id,
        label: group.label,
        data: {
          count: group.weight,
          memberCount: group.members.length,
          members: group.members.join(", "),
          collapsed: group.members.length > 1,
        },
      },
    };
    cursor += height + gap;
    return node;
  });
}

type CollapsedFlow = FlowObservation & {
  sessionKey: string;
  toolKey: string;
  targetKey: string;
};

function aggregateFlowLinks(
  observations: readonly CollapsedFlow[],
  from: "sessionKey" | "toolKey",
  to: "toolKey" | "targetKey",
) {
  const links = new Map<
    string,
    { from: string; to: string; weight: number; errors: number; tool: string }
  >();
  for (const observation of observations) {
    const key = `${observation[from]}\0${observation[to]}`;
    const previous = links.get(key) ?? {
      from: observation[from],
      to: observation[to],
      weight: 0,
      errors: 0,
      tool: observation.tool,
    };
    previous.weight += observation.weight;
    previous.errors += observation.errors;
    if (lexical(observation.tool, previous.tool) < 0)
      previous.tool = observation.tool;
    links.set(key, previous);
  }
  return [...links.values()].sort(
    (left, right) =>
      lexical(left.from, right.from) || lexical(left.to, right.to),
  );
}

function buildFlowEdges(
  stage: "session-tool" | "tool-target",
  links: ReturnType<typeof aggregateFlowLinks>,
  fromNodes: ReadonlyMap<string, GraphNode>,
  toNodes: ReadonlyMap<string, GraphNode>,
  usableHeight: number,
  totalWeight: number,
) {
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  let lastTool = "";
  let lastTone: GraphTone | undefined;
  const edges: GraphEdge[] = [];
  for (const link of links) {
    const source = fromNodes.get(link.from)!;
    const target = toNodes.get(link.to)!;
    const width =
      totalWeight > 0 ? (link.weight / totalWeight) * usableHeight : 0;
    const sourceOffset = outgoing.get(link.from) ?? 0;
    const targetOffset = incoming.get(link.to) ?? 0;
    const sourceY = source.y + sourceOffset + width / 2;
    const targetY = target.y + targetOffset + width / 2;
    outgoing.set(link.from, sourceOffset + width);
    incoming.set(link.to, targetOffset + width);
    const start = { x: source.x + source.width, y: sourceY };
    const end = { x: target.x, y: targetY };
    const middle = (start.x + end.x) / 2;
    const id = `ribbon:${stage}:${stableHash(`${link.from}\0${link.to}`).toString(36)}`;

    let tone = toolTone(link.tool);
    // Avoid consecutive edges with the same tone
    if (link.tool === lastTool && tone === lastTone) {
      const shifted = TOOL_TONES[(TOOL_TONES.indexOf(tone) + 1) % TOOL_TONES.length]!;
      tone = shifted;
    }
    lastTool = link.tool;
    lastTone = tone;

    edges.push({
      id,
      kind: "ribbon",
      from: source.id,
      to: target.id,
      points: [
        start,
        { x: middle, y: sourceY },
        { x: middle, y: targetY },
        end,
      ],
      width,
      tone,
      weight: link.weight,
      opacity: 0.75,
      hit: {
        kind: "flow",
        id,
        label: `${source.label} → ${target.label}`,
        data: {
          from: source.label ?? link.from,
          to: target.label ?? link.to,
          count: link.weight,
          errors: link.errors,
        },
      },
    });
  }
  return edges;
}

export function buildFlowScene(
  model: GraphLayoutModel,
  options: GraphLayoutOptions = {},
): GraphScene {
  const observations = flowObservations(model);
  const totalWeight = observations.reduce(
    (sum, observation) => sum + observation.weight,
    0,
  );
  const maximum = options.maxFlowNodesPerStage ?? 8;
  const sessionWeights = weightsBy(observations, "session");
  const toolWeights = weightsBy(observations, "tool");
  const targetWeights = weightsBy(observations, "target");
  const sessions = stageGroups(
    observations.map((item) => item.session),
    sessionWeights,
    maximum,
    "session",
  );
  const tools = stageGroups(
    observations.map((item) => item.tool),
    toolWeights,
    maximum,
    "tool",
  );
  const targets = stageGroups(
    observations.map((item) => item.target),
    targetWeights,
    maximum,
    "target",
  );
  const maxNodes = Math.max(
    sessions.groups.length,
    tools.groups.length,
    targets.groups.length,
    1,
  );
  const gap = 0.012;
  const usableHeight = Math.max(0, FLOW_PLOT.height - (maxNodes - 1) * gap);
  const sessionNodes = buildFlowStage(
    "session",
    sessions.groups,
    FLOW_PLOT.x,
    usableHeight,
    totalWeight,
    gap,
  );
  const toolNodes = buildFlowStage(
    "tool",
    tools.groups,
    FLOW_PLOT.x + FLOW_PLOT.width / 2 - 0.0125,
    usableHeight,
    totalWeight,
    gap,
  );
  const targetNodes = buildFlowStage(
    "target",
    targets.groups,
    FLOW_PLOT.x + FLOW_PLOT.width - 0.025,
    usableHeight,
    totalWeight,
    gap,
  );
  const collapsed: CollapsedFlow[] = observations.map((item) => ({
    ...item,
    sessionKey: sessions.keyByMember.get(item.session)!,
    toolKey: tools.keyByMember.get(item.tool)!,
    targetKey: targets.keyByMember.get(item.target)!,
  }));
  const sessionByKey = new Map(
    sessions.groups.map((group, index) => [group.key, sessionNodes[index]!]),
  );
  const toolByKey = new Map(
    tools.groups.map((group, index) => [group.key, toolNodes[index]!]),
  );
  const targetByKey = new Map(
    targets.groups.map((group, index) => [group.key, targetNodes[index]!]),
  );
  const leftLinks = aggregateFlowLinks(collapsed, "sessionKey", "toolKey");
  const rightLinks = aggregateFlowLinks(collapsed, "toolKey", "targetKey");
  const edges = [
    ...buildFlowEdges(
      "session-tool",
      leftLinks,
      sessionByKey,
      toolByKey,
      usableHeight,
      totalWeight,
    ),
    ...buildFlowEdges(
      "tool-target",
      rightLinks,
      toolByKey,
      targetByKey,
      usableHeight,
      totalWeight,
    ),
  ];
  const tableRows = new Map<string, Record<string, GraphValue>>();
  for (const item of collapsed) {
    const session = sessionByKey.get(item.sessionKey)!.label!;
    const tool = toolByKey.get(item.toolKey)!.label!;
    const target = targetByKey.get(item.targetKey)!.label!;
    const key = `${session}\0${tool}\0${target}`;
    const previous = tableRows.get(key);
    tableRows.set(key, {
      session,
      tool,
      target,
      weight: finite(previous?.weight) + item.weight,
      errors: finite(previous?.errors) + item.errors,
    });
  }

  return {
    version: 1,
    mode: "flow",
    bounds: WORLD_BOUNDS,
    plotBounds: FLOW_PLOT,
    nodes: [...sessionNodes, ...toolNodes, ...targetNodes],
    edges,
    bars: [],
    areas: [],
    labels: [
      {
        id: "flow-label:sessions",
        x: FLOW_PLOT.x,
        y: 0.025,
        text: "Sessions",
        tone: "muted",
        align: "start",
        importance: 2,
      },
      {
        id: "flow-label:tools",
        x: 0.5,
        y: 0.025,
        text: "Tools",
        tone: "muted",
        align: "center",
        importance: 2,
      },
      {
        id: "flow-label:targets",
        x: FLOW_PLOT.x + FLOW_PLOT.width,
        y: 0.025,
        text: "Targets",
        tone: "muted",
        align: "end",
        importance: 2,
      },
    ],
    axes: [],
    table: {
      columns: ["session", "tool", "target", "weight", "errors"],
      rows: [...tableRows.values()].sort(
        (left, right) =>
          lexical(String(left.session), String(right.session)) ||
          lexical(String(left.tool), String(right.tool)) ||
          lexical(String(left.target), String(right.target)),
      ),
    },
    summary: {
      title: "Session to target flow",
      description:
        "Ribbon width is conserved call weight; multi-target calls split evenly across targets.",
      metrics: {
        calls: model.calls.length,
        flowWeight: totalWeight,
        sessions: sessionWeights.size,
        tools: toolWeights.size,
        targets: targetWeights.size,
        errors: model.calls.filter((call) => call.status === "error").length,
        collapsedNodes: [
          ...sessions.groups,
          ...tools.groups,
          ...targets.groups,
        ].filter((group) => group.members.length > 1).length,
      },
      timing: "ordinal",
      coverage: model.coverage,
    },
  };
}

type ActivityBucket = {
  index: number;
  start: number;
  end: number;
  calls: NormalizedCall[];
};

export function buildActivityScene(
  model: Pick<GraphLayoutModel, "calls" | "coverage">,
  _options: GraphLayoutOptions = {},
): GraphScene {
  const source = normalizeCalls(model.calls);

  const byTool = new Map<string, NormalizedCall[]>();
  for (const call of source) {
    const group = byTool.get(call.tool) ?? [];
    group.push(call);
    byTool.set(call.tool, group);
  }

  const sorted = [...byTool.entries()].sort((a, b) => b[1].length - a[1].length || lexical(a[0], b[0]));
  const maxCount = Math.max(1, ...sorted.map(([, calls]) => calls.length));

  const BAR = { x: 0.06, y: 0.06, width: 0.9, height: 0.88 };
  const bars: GraphBar[] = [];
  const labels: GraphLabel[] = [];
  const rows: Record<string, GraphValue>[] = [];
  const gap = 0.02;
  const colW = sorted.length > 0 ? (BAR.width - gap * (sorted.length + 1)) / sorted.length : 1;

  for (let i = 0; i < sorted.length; i++) {
    const [tool, calls] = sorted[i]!;
    const errors = calls.filter((c) => c.status === "error").length;
    const height = (calls.length / maxCount) * BAR.height;
    const x = BAR.x + gap + i * (colW + gap);
    const y = BAR.y + BAR.height - height;

    bars.push({
      id: `tool-bar:${stableHash(tool).toString(36)}`,
      groupId: "tool-bars",
      x,
      y,
      width: colW,
      height,
      tone: toolTone(tool),
      value: calls.length,
      label: tool,
      hit: {
        kind: "tool",
        id: `tool-bar:${stableHash(tool).toString(36)}`,
        label: `${tool} · ${calls.length}`,
        data: {
          tool,
          calls: calls.length,
          errors,
        },
      },
    });

    labels.push({
      id: `tool-label:${stableHash(tool).toString(36)}`,
      x: x + colW / 2,
      y: BAR.y + BAR.height + 0.01,
      text: tool,
      tone: "muted",
      align: "center",
      maxWidth: colW * 1.5,
      importance: 1,
    });

    rows.push({ tool, calls: calls.length, errors });
  }

  return {
    version: 1,
    mode: "activity",
    bounds: WORLD_BOUNDS,
    plotBounds: BAR,
    nodes: [],
    edges: [],
    bars,
    areas: [],
    labels,
    axes: [],
    table: {
      columns: ["tool", "calls", "errors"],
      rows,
    },
    summary: {
      title: "Tool call counts",
      description: "Each bar is one tool; height = total calls.",
      metrics: {
        calls: source.length,
        tools: sorted.length,
        errors: source.filter((call) => call.status === "error").length,
      },
      timing: "ordinal",
      coverage: model.coverage,
    },
  };
}

export function buildGraphScene(
  mode: GraphMode,
  model: GraphLayoutModel,
  options: GraphLayoutOptions = {},
) {
  switch (mode) {
    case "files":
      return buildFilesScene(model, options);
    case "flow":
      return buildFlowScene(model, options);
    case "activity":
      return buildActivityScene(model, options);
  }
}
