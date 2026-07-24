import { createResource, createMemo, createSignal, onMount, Show } from "solid-js"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { homedir } from "node:os"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"
import { useBindings } from "../../keymap"
import { useToast } from "../../ui/toast"

export function DialogMdViewer(props: { filePath: string; workspaceRoot?: string }) {
  const dialog = useDialog()
  const toast = useToast()
  const { theme, syntax } = useTheme()
  const [exportState, setExportState] = createSignal<"idle" | "busy" | "done">("idle")

  onMount(() => dialog.setSize("xlarge"))

  const [content] = createResource(() => props.filePath, (filepath) =>
    readFile(filepath, "utf-8"),
  )

  const displayPath = createMemo(() => {
    if (!props.workspaceRoot) return props.filePath
    const rel = path.relative(props.workspaceRoot, props.filePath)
    return rel.startsWith("..") ? props.filePath : rel
  })

  const exportPath = createMemo(() => {
    const rel = displayPath()
    const filename = path.basename(rel)
    return path.join(homedir(), "Downloads", filename)
  })

  const handleExport = async () => {
    if (exportState() !== "idle") return
    const md = content()
    if (!md) return
    setExportState("busy")
    try {
      await writeFile(exportPath(), md)
      setExportState("done")
      setTimeout(() => setExportState("idle"), 3000)
      toast.show({ variant: "success", message: `Saved to ~/Downloads/${path.basename(exportPath())}` })
    } catch (e) {
      setExportState("idle")
      toast.show({ variant: "error", message: `Export failed: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const exportLabel = createMemo(() => {
    switch (exportState()) {
      case "busy": return "Exporting..."
      case "done": return "Exported!"
      default: return "[e] Export to Downloads"
    }
  })

  const exportColor = createMemo(() => {
    switch (exportState()) {
      case "busy": return theme.warning
      case "done": return theme.success
      default: return theme.primary
    }
  })

  useBindings(() => ({
    bindings: [
      { key: "escape", cmd: () => dialog.clear() },
      { key: "return", cmd: () => dialog.clear() },
      { key: "e", cmd: () => void handleExport() },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} paddingTop={1}
      gap={0} flexDirection="column" minHeight={0}>
      <box flexDirection="row" justifyContent="space-between" flexShrink={0} paddingBottom={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {displayPath()}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box height={1} border={["top"]} borderColor={theme.border} flexShrink={0} />
      <scrollbox flexGrow={2} minHeight={0} paddingTop={1} paddingBottom={1}>
        <Show when={!content.loading && content() !== undefined}
          fallback={<text fg={theme.textMuted}>Loading...</text>}>
          <box paddingLeft={1}>
            <markdown
              content={content()!}
              syntaxStyle={syntax()}
              streaming={false}
              internalBlockMode="top-level"
              tableOptions={{ style: "grid" }}
              fg={theme.markdownText}
              bg={theme.background}
            />
          </box>
        </Show>
      </scrollbox>
      <box flexDirection="row" justifyContent="space-between" flexShrink={0} paddingTop={1} paddingBottom={1}>
        <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
          esc return close
        </text>
        <box
          onMouseUp={() => void handleExport()}
          paddingLeft={2} paddingRight={2}
          backgroundColor={exportColor()}
        >
          <text fg={theme.selectedListItemText}>{exportLabel()}</text>
        </box>
      </box>
    </box>
  )
}
