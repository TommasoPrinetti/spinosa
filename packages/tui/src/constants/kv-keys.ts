/**
 * Centralized KV key registry for the entire TUI.
 *
 * Every KV key used by the system is defined here as a string constant.
 * This prevents typos, enables IDE auto-complete, and makes all keys
 * auditable via a single file.
 *
 * Keys that already have local constants in other files are re-exported
 * here as the canonical source.
 */

export const KV = {
  // ── Workspace state ──────────────────────────────────────────
  /** Active spinosa workspace path. Set on openWorkspace(), cleared on generic mode. */
  ACTIVE_WORKSPACE_PATH: "spinosa_active_workspace_path" as const,
  /** Active spinosa workspace ID (spw_01_*). Set on openWorkspace(), cleared on generic mode. */
  ACTIVE_WORKSPACE_ID: "spinosa_active_workspace_id" as const,
  /** New: wrk_* ID bridged from server workspace system. */
  ACTIVE_WRK_WORKSPACE_ID: "spinosa_active_wrk_workspace_id" as const,
  /** Whether the TUI is in generic (non-workspace) mode. */
  GENERIC_MODE: "spinosa_generic_mode" as const,
  /** Last active session ID, used to restore picker context. */
  LAST_SESSION_ID: "spinosa_last_session_id" as const,
  /** Last goal artifact path, used for navigation. */
  LAST_GOAL_PATH: "spinosa_last_goal_path" as const,
  /** Previous route type stored before workspace picker navigation. */
  PICKER_PREVIOUS_ROUTE: "spinosa_picker_previous_route" as const,

  // ── Session list & filtering ─────────────────────────────────
  /** When false, sessions are listed project-wide instead of by directory. */
  SESSION_DIRECTORY_FILTER: "session_directory_filter_enabled" as const,

  // ── Session display ──────────────────────────────────────────
  /** Show/hide message timestamps in chat. */
  TIMESTAMPS: "timestamps" as const,
  /** Show/hide tool call details. */
  TOOL_DETAILS_VISIBILITY: "tool_details_visibility" as const,
  /** Show/hide assistant metadata. */
  ASSISTANT_METADATA_VISIBILITY: "assistant_metadata_visibility" as const,
  /** Show/hide scrollbar. */
  SCROLLBAR_VISIBLE: "scrollbar_visible" as const,
  /** Word-wrap mode in diffs ("word" | "none"). */
  DIFF_WRAP_MODE: "diff_wrap_mode" as const,
  /** Enable/disable animations globally. */
  ANIMATIONS_ENABLED: "animations_enabled" as const,
  /** Visibility of generic tool output blocks. */
  GENERIC_TOOL_OUTPUT_VISIBILITY: "generic_tool_output_visibility" as const,

  // ── Theme ────────────────────────────────────────────────────
  /** Theme mode lock state ("light" | "dark" | undefined). */
  THEME_MODE_LOCK: "theme_mode_lock" as const,
  /** Active theme mode when locked. */
  THEME_MODE: "theme_mode" as const,
  /** Active theme name. */
  THEME_NAME: "theme" as const,

  // ── Thinking ─────────────────────────────────────────────────
  /** Current thinking visibility mode ("show" | "hide"). */
  THINKING_MODE: "thinking_mode" as const,
  /** Legacy: boolean migration helper for old thinking_visibility. */
  THINKING_VISIBILITY_LEGACY: "thinking_visibility" as const,

  // ── Sharing ──────────────────────────────────────────────────
  /** User has consented to session sharing. */
  SHARE_CONSENT: "share_consent" as const,

  // ── Go upsell ────────────────────────────────────────────────
  /** Free-tier upsell: last shown timestamp. */
  UPS_LAST_SEEN: "go_upsell_last_seen_at" as const,
  /** Free-tier upsell: user permanently dismissed. */
  UPS_DONT_SHOW: "go_upsell_dont_show" as const,
  /** Rate-limit upsell: last shown timestamp. */
  UPS_RATE_LIMIT_LAST_SEEN: "go_upsell_account_rate_limit_last_seen_at" as const,
  /** Rate-limit upsell: user permanently dismissed. */
  UPS_RATE_LIMIT_DONT_SHOW: "go_upsell_account_rate_limit_dont_show" as const,

  // ── App toggles ──────────────────────────────────────────────
  /** Show/hide terminal title. */
  TERMINAL_TITLE: "terminal_title_enabled" as const,
  /** Enable/disable paste summarization. */
  PASTE_SUMMARY: "paste_summary_enabled" as const,
  /** Enable/disable file context in prompts. */
  FILE_CONTEXT: "file_context_enabled" as const,
  /** Last update version the user skipped. */
  SKIPPED_VERSION: "skipped_version" as const,

  // ── Plugins ──────────────────────────────────────────────────
  /** Map of plugin ID → enabled boolean. */
  PLUGIN_ENABLED: "plugin_enabled" as const,

  // ── Diff viewer ──────────────────────────────────────────────
  /** Show file tree in diff viewer sidebar. */
  DIFF_VIEWER_SHOW_FILE_TREE: "diff_viewer_show_file_tree" as const,
  /** Enable single-patch mode in diff viewer. */
  DIFF_VIEWER_SINGLE_PATCH: "diff_viewer_single_patch" as const,
  /** Diff viewer layout ("split" | "unified"). */
  DIFF_VIEWER_VIEW: "diff_viewer_view" as const,

  // ── Which-key ────────────────────────────────────────────────
  /** Which-key panel layout ("dock" | "overlay"). */
  WHICH_KEY_LAYOUT: "which_key_layout" as const,
  /** Auto-show pending key preview in which-key. */
  WHICH_KEY_PENDING_PREVIEW: "which_key_pending_preview" as const,

  // ── Feature plugins ──────────────────────────────────────────
  /** User hid tips on home screen. */
  TIPS_HIDDEN: "tips_hidden" as const,
  /** User dismissed "Getting Started" sidebar footer. */
  GETTING_STARTED_DISMISSED: "dismissed_getting_started" as const,
} as const

export type KVKey = (typeof KV)[keyof typeof KV]
