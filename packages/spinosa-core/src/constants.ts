export const MARKDOWN_EXTENSIONS = [
  "txt", "rtf", "textile", "wiki", "mediawiki", "dokuwiki", "pmwiki",
  "outliner", "workflowy", "dynalist", "yaml", "yml", "toml",
  "css", "js", "ts", "py", "rb", "sh", "log",
  "ini", "cfg", "conf", "tex", "bib", "org", "adoc", "rst",
  "tiddlywiki", "logseq", "roam", "obsidian",
]

export const NATIVE_EXTENSIONS = ["md"]

export const BINARY_COPYABLE_EXTENSIONS: string[] = []

export const MARKITDOWN_EXTENSIONS = [
  "docx", "pptx", "xlsx", "xls", "epub",
  "html", "htm", "msg", "zip", "json", "csv", "xml",
]

export const STRUCTURED_FALLBACK_EXTENSIONS = ["csv", "json", "xml"]

export const IMAGE_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "webp",
  "heic", "heif", "tif", "tiff", "bmp", "svg",
]

export const AUDIO_VIDEO_EXTENSIONS = [
  "mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv",
  "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "aiff",
]

export const SPINOSA_HOME = "~/.spinosa"
export const SPINOSA_METADATA_DIR = "~/.spinosa/metadata"
export const SPINOSA_REGISTRY = "workspaces.txt"
export const SPINOSA_CONFIG = "config.yaml"
export const FRAMEWORK_MARKER = ".spinosa/framework-files.tsv"
export const WORKSPACE_MARKER = ".spinosa/workspace"

export const SPINOSA_AGENT_FILES = [
  "spinosa-searcher.md",
  "spinosa-mapper.md",
  "spinosa-analyst.md",
  "spinosa-serendippo.md",
  "spinosa-writer.md",
  "spinosa-verifier.md",
  "spinosa-evaluator.md",
]

export function fileExt(path: string): string {
  const i = path.lastIndexOf(".")
  return i >= 0 ? path.slice(i + 1) : ""
}

export function extInList(ext: string, list: string[]): boolean {
  return list.includes(ext.toLowerCase())
}
