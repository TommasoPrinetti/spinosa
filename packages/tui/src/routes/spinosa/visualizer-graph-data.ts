import path from "node:path"
import type { ToolCallRecord } from "./visualizer-types"

export type WorkspaceFile = {
  path: string
  absolute: string
}

export type FileAccessKind = "read" | "implicit_read" | "search" | "discover" | "write" | "edit" | "patch"
export type FileAccessSource = "input" | "metadata" | "output"

export type FileAccessEvent = {
  file: string
  kind: FileAccessKind
  source: FileAccessSource
  toolCallID: string
  sessionID?: string
  messageID?: string
  time?: number
  matches?: number
}

export type FileUsage = {
  file: string
  absolute: string
  reads: number
  searches: number
  grepMatches: number
  discoveries: number
  writes: number
  edits: number
  patches: number
  mutations: number
  accesses: number
  sessions: number
  lastAccessed?: number
  heat: number
}

export type FileGraphCoverage = {
  totalToolCalls: number
  completedToolCalls: number
  errorToolCalls: number
  activeToolCalls: number
  attributedToolCalls: number
  unattributedToolCalls: number
  unsupportedToolCalls: number
  rejectedPaths: number
  truncatedSearchCalls: number
  approximateSearchScopes: number
  unattributedByTool: Record<string, number>
}

export type FileGraphData = {
  files: FileUsage[]
  events: FileAccessEvent[]
  coverage: FileGraphCoverage
}

export type FileAccessExtraction = {
  events: FileAccessEvent[]
  rejectedPaths: number
  truncatedSearch: boolean
  approximateSearchScope: boolean
  supported: boolean
}

const SUPPORTED_TOOLS = new Set(["read", "grep", "glob", "write", "edit", "apply_patch", "bash"])
const SOURCE_PRIORITY: Record<FileAccessSource, number> = { input: 0, output: 1, metadata: 2 }

export function normalizeWorkspaceRelativePath(value: string): string | undefined {
  const normalized = path.posix.normalize(value.trim().replaceAll("\\", "/")).replace(/^\.\//, "")
  if (!normalized || normalized === "." || normalized === "..") return
  if (path.posix.isAbsolute(normalized) || normalized.startsWith("../")) return
  return normalized
}

export function workspaceFileSet(files: readonly WorkspaceFile[]): Set<string> {
  return new Set(files.map((file) => normalizeWorkspaceRelativePath(file.path)).filter((file): file is string => !!file))
}

export function normalizeWorkspaceFilePath(
  workspaceRoot: string,
  candidate: string,
  files: ReadonlySet<string>,
): string | undefined {
  const raw = candidate.trim()
  if (!raw || raw.includes("\0")) return
  if (path.sep === "/" && (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\"))) return

  const root = path.resolve(workspaceRoot)
  const local = path.sep === "/" ? raw.replaceAll("\\", "/") : raw.replaceAll("/", "\\")
  const absolute = path.isAbsolute(local) ? path.normalize(local) : path.resolve(root, local)
  const relative = path.relative(root, absolute)
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return

  const normalized = normalizeWorkspaceRelativePath(relative)
  return normalized && files.has(normalized) ? normalized : undefined
}

export function extractFileAccessEvents(
  call: ToolCallRecord,
  workspaceRoot: string,
  files: ReadonlySet<string>,
): FileAccessExtraction {
  const tool = call.tool.toLowerCase()
  const supported = SUPPORTED_TOOLS.has(tool)
  if (call.status !== "completed") {
    return { events: [], rejectedPaths: 0, truncatedSearch: false, approximateSearchScope: false, supported }
  }

  const metadata = call.metadata ?? stateMetadata(call)
  const output = call.output ?? completedOutput(call)
  const part = toolPart(call)
  const events = new Map<string, FileAccessEvent>()
  let rejectedPaths = 0
  let truncatedSearch = false
  let approximateSearchScope = false

  const add = (candidate: unknown, kind: FileAccessKind, source: FileAccessSource, matches?: number) => {
    if (typeof candidate !== "string" || !candidate.trim()) return
    const file = normalizeWorkspaceFilePath(workspaceRoot, candidate, files)
    if (!file) {
      rejectedPaths++
      return
    }
    const key = `${kind}\0${file}`
    const previous = events.get(key)
    if (previous) {
      if ((matches ?? 0) > (previous.matches ?? 0)) previous.matches = matches
      if (SOURCE_PRIORITY[source] > SOURCE_PRIORITY[previous.source]) previous.source = source
      return
    }
    events.set(key, {
      file,
      kind,
      source,
      toolCallID: call.callID ?? part?.callID ?? call.id,
      sessionID: call.sessionID ?? part?.sessionID,
      messageID: call.messageID ?? part?.messageID,
      time: call.timeStart || undefined,
      ...(matches === undefined ? {} : { matches }),
    })
  }

  if (tool === "read") {
    const display = recordValue(metadata?.display)
    if (display?.type !== "directory") {
      const structured = stringValue(display?.path)
      add(structured ?? directPath(call.input), "read", structured ? "metadata" : "input")
    }
    for (const loaded of stringArray(metadata?.loaded)) add(loaded, "implicit_read", "metadata")
  } else if (tool === "grep") {
    const direct = directPath(call.input)
    const directFile = direct ? normalizeWorkspaceFilePath(workspaceRoot, direct, files) : undefined
    if (directFile) add(direct, "search", "input", 0)
    else approximateSearchScope = true

    for (const match of parseGrepOutput(output ?? "")) add(match.path, "search", "output", match.matches)
    truncatedSearch = metadata?.truncated === true || /more matches available|results truncated/i.test(output ?? "")
  } else if (tool === "glob") {
    for (const candidate of parseGlobOutput(output ?? "")) add(candidate, "discover", "output")
  } else if (tool === "write" || tool === "edit") {
    const filediff = recordValue(metadata?.filediff)
    const structured = stringValue(metadata?.filepath) ?? stringValue(filediff?.file)
    add(structured ?? directPath(call.input), tool, structured ? "metadata" : "input")
  } else if (tool === "apply_patch") {
    const structured = arrayValue(metadata?.files)
    if (structured.length > 0) {
      for (const value of structured) {
        const file = recordValue(value)
        add(file?.filePath, "patch", "metadata")
        add(file?.relativePath, "patch", "metadata")
        add(file?.movePath, "patch", "metadata")
      }
    } else {
      for (const candidate of parsePatchPaths(stringValue(call.input.patchText) ?? "")) add(candidate, "patch", "input")
    }
  }

  return {
    events: [...events.values()],
    rejectedPaths,
    truncatedSearch,
    approximateSearchScope,
    supported,
  }
}

export function aggregateFileUsage(
  workspaceRoot: string,
  files: readonly WorkspaceFile[],
  calls: readonly ToolCallRecord[],
): FileGraphData {
  const fileSet = workspaceFileSet(files)
  const events: FileAccessEvent[] = []
  const coverage: FileGraphCoverage = {
    totalToolCalls: calls.length,
    completedToolCalls: 0,
    errorToolCalls: 0,
    activeToolCalls: 0,
    attributedToolCalls: 0,
    unattributedToolCalls: 0,
    unsupportedToolCalls: 0,
    rejectedPaths: 0,
    truncatedSearchCalls: 0,
    approximateSearchScopes: 0,
    unattributedByTool: {},
  }

  for (const call of calls) {
    if (call.status === "completed") coverage.completedToolCalls++
    else if (call.status === "error") coverage.errorToolCalls++
    else coverage.activeToolCalls++

    const extracted = extractFileAccessEvents(call, workspaceRoot, fileSet)
    coverage.rejectedPaths += extracted.rejectedPaths
    if (extracted.truncatedSearch) coverage.truncatedSearchCalls++
    if (extracted.approximateSearchScope) coverage.approximateSearchScopes++
    if (call.status !== "completed") continue

    if (extracted.events.length > 0) coverage.attributedToolCalls++
    else {
      coverage.unattributedToolCalls++
      coverage.unattributedByTool[call.tool] = (coverage.unattributedByTool[call.tool] ?? 0) + 1
    }
    if (!extracted.supported) coverage.unsupportedToolCalls++
    events.push(...extracted.events)
  }

  const usage = new Map<string, FileUsage & { sessionIDs: Set<string> }>()
  for (const file of files) {
    const normalized = normalizeWorkspaceRelativePath(file.path)
    if (!normalized || !fileSet.has(normalized) || usage.has(normalized)) continue
    usage.set(normalized, {
      file: normalized,
      absolute: file.absolute,
      reads: 0,
      searches: 0,
      grepMatches: 0,
      discoveries: 0,
      writes: 0,
      edits: 0,
      patches: 0,
      mutations: 0,
      accesses: 0,
      sessions: 0,
      heat: 0,
      sessionIDs: new Set(),
    })
  }

  for (const event of events) {
    const item = usage.get(event.file)
    if (!item) continue
    item.accesses++
    if (event.kind === "read" || event.kind === "implicit_read") item.reads++
    if (event.kind === "search") {
      item.searches++
      item.grepMatches += event.matches ?? 0
    }
    if (event.kind === "discover") item.discoveries++
    if (event.kind === "write") item.writes++
    if (event.kind === "edit") item.edits++
    if (event.kind === "patch") item.patches++
    if (event.kind === "write" || event.kind === "edit" || event.kind === "patch") item.mutations++
    if (event.sessionID) item.sessionIDs.add(event.sessionID)
    if (event.time !== undefined) item.lastAccessed = Math.max(item.lastAccessed ?? 0, event.time)
  }

  return {
    files: [...usage.values()]
      .map(({ sessionIDs, ...item }) => ({ ...item, sessions: sessionIDs.size, heat: item.reads + item.searches }))
      .sort((a, b) => a.file.localeCompare(b.file)),
    events,
    coverage,
  }
}

function stateMetadata(call: ToolCallRecord): Record<string, unknown> | undefined {
  const state = toolPart(call)?.state
  return state && "metadata" in state ? state.metadata : undefined
}

function completedOutput(call: ToolCallRecord): string | undefined {
  const state = toolPart(call)?.state
  return state?.status === "completed" ? state.output : undefined
}

function toolPart(call: ToolCallRecord) {
  return call.part.type === "tool" ? call.part : undefined
}

function directPath(input: Record<string, unknown>): string | undefined {
  return stringValue(input.filePath) ?? stringValue(input.file_path) ?? stringValue(input.filepath) ?? stringValue(input.path)
}

function parseGrepOutput(output: string): Array<{ path: string; matches: number }> {
  const found = new Map<string, number>()
  const lines = output.split(/\r?\n/)
  let current: string | undefined
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ""
    const next = lines[index + 1] ?? ""
    if (!/^\s/.test(line) && line.endsWith(":") && /^\s+Line\s+\d+:/.test(next)) {
      current = line.slice(0, -1)
      found.set(current, found.get(current) ?? 0)
      continue
    }
    if (current && /^\s+Line\s+\d+:/.test(line)) found.set(current, (found.get(current) ?? 0) + 1)
    else if (line.trim() !== "") current = undefined
  }
  return [...found].map(([entryPath, matches]) => ({ path: entryPath, matches }))
}

function parseGlobOutput(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !!line && line !== "No files found" && !line.startsWith("("))
}

function parsePatchPaths(patchText: string): string[] {
  const paths: string[] = []
  for (const line of patchText.split(/\r?\n/)) {
    const match = line.match(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/) ?? line.match(/^\*\*\* Move to:\s*(.+)$/)
    if (match?.[1]) paths.push(match[1])
  }
  return paths
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}
