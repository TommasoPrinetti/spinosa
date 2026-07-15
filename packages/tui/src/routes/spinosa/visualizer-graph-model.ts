import type {
  GraphLayoutCall,
  GraphLayoutFile,
  GraphLayoutFileEvent,
  GraphLayoutModel,
} from "./visualizer-graph-layout";
import {
  normalizeWorkspaceFilePath,
  normalizeWorkspaceRelativePath,
  type FileGraphData,
} from "./visualizer-graph-data";
import type { ToolCallRecord } from "./visualizer-types";

export type VisualizerGraphScopeCoverage = {
  scope?: "selected-tree" | "latest-roots" | "loaded-calls";
  rootSessionID?: string;
  rootsAvailable?: number;
  rootsLoaded?: number;
  sessionsLoaded?: number;
  sessionsDiscovered?: number;
  messagesLoaded?: number;
  messagesScanned?: number;
};

export type VisualizerGraphStatus = {
  calls: number;
  errors: number;
  observedFiles: number;
  totalFiles: number;
  scope: string;
};

export type VisualizerGraphModel = GraphLayoutModel & {
  status: VisualizerGraphStatus;
};

export function buildVisualizerGraphModel(input: {
  calls: readonly ToolCallRecord[];
  fileGraph: FileGraphData;
  workspaceRoot: string;
  coverage: VisualizerGraphScopeCoverage;
}): VisualizerGraphModel {
  const files = safeFiles(input.fileGraph);
  const fileSet = new Set(
    files
      .map((file) => (typeof file.file === "string" ? file.file : undefined))
      .filter((file): file is string => !!file),
  );
  const callIDs = new Set(
    input.calls.flatMap((call) =>
      [call.id, call.callID].filter((id): id is string => !!id),
    ),
  );
  const events: GraphLayoutFileEvent[] = [];

  for (const event of input.fileGraph.events) {
    if (!callIDs.has(event.toolCallID)) continue;
    const file = normalizeWorkspaceFilePath(
      input.workspaceRoot,
      event.file,
      fileSet,
    );
    if (!file) continue;
    events.push({ file, toolCallID: event.toolCallID, kind: event.kind });
  }

  const calls = input.calls.map((call): GraphLayoutCall => {
    const targets: string[] = [];
    const seen = new Set<string>();
    for (const event of events) {
      if (event.toolCallID !== call.callID && event.toolCallID !== call.id)
        continue;
      const file =
        typeof event.file === "string" ? event.file : event.file.path;
      if (seen.has(file)) continue;
      seen.add(file);
      targets.push(file);
    }
    return {
      id: call.id,
      callID: call.callID,
      tool: call.tool,
      status: call.status,
      sessionID: call.sessionID,
      sessionTitle: call.sessionTitle,
      timeStart: call.timeStart,
      timeEnd: call.timeEnd,
      target: targets[0],
      targets,
      targetKind: targets.length > 0 ? "file" : undefined,
    };
  });
  const observedFiles = new Set(
    events.map((event) =>
      typeof event.file === "string" ? event.file : event.file.path,
    ),
  ).size;
  const status: VisualizerGraphStatus = {
    calls: calls.length,
    errors: calls.filter((call) => call.status === "error").length,
    observedFiles,
    totalFiles: files.length,
    scope: scopeText(input.coverage, calls),
  };

  return {
    calls,
    files,
    events,
    coverage: `${status.calls} calls · ${status.errors} errors · ${status.observedFiles}/${status.totalFiles} files observed · ${status.scope}`,
    status,
  };
}

function safeFiles(fileGraph: FileGraphData): GraphLayoutFile[] {
  const files = new Map<string, GraphLayoutFile>();
  for (const file of fileGraph.files) {
    const relative = normalizeWorkspaceRelativePath(file.file);
    if (!relative) continue;
    files.set(relative, {
      file: relative,
      reads: file.reads,
      searches: file.searches,
      grepMatches: file.grepMatches,
      discoveries: file.discoveries,
      writes: file.writes,
      edits: file.edits,
      patches: file.patches,
      mutations: file.mutations,
      accesses: file.accesses,
      sessions: file.sessions,
      lastAccessed: file.lastAccessed,
      heat: file.heat,
    });
  }
  return [...files.values()];
}

function scopeText(
  coverage: VisualizerGraphScopeCoverage,
  calls: readonly GraphLayoutCall[],
): string {
  const sessions =
    coverage.sessionsLoaded ??
    coverage.sessionsDiscovered ??
    new Set(calls.map((call) => call.sessionID).filter(Boolean)).size;
  const observedMessages = new Set(
    calls.map((call) => call.id.split(":")[0]).filter(Boolean),
  ).size;
  const messages =
    coverage.messagesScanned ?? coverage.messagesLoaded ?? observedMessages;

  if (
    coverage.scope === "latest-roots" ||
    coverage.rootsAvailable !== undefined
  ) {
    const loaded = coverage.rootsLoaded ?? 0;
    const available = coverage.rootsAvailable;
    const roots =
      available === undefined ? `${loaded}` : `${loaded} of ${available}`;
    return `Latest ${roots} roots · ${sessions} sessions · ${messages} messages scanned`;
  }
  if (
    coverage.scope === "selected-tree" ||
    coverage.rootSessionID !== undefined
  ) {
    return `Selected session tree · ${sessions} sessions · ${messages} messages`;
  }
  return `Loaded call scope · ${sessions} sessions · ${messages} tool-call records`;
}
