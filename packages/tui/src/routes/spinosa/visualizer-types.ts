export type VisualizerMode = "timeline" | "types" | "sessions"

export type ToolCallRecord = {
  id: string
  tool: string
  status: string
  input: Record<string, unknown>
  output?: string
  error?: string
  title?: string
  timeStart: number
  timeEnd?: number
  sessionTitle: string
  part: any
}

export type CanvasViewProps = {
  toolCalls: ToolCallRecord[]
  theme: any
  dialog: any
}
