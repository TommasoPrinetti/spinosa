# shellcheck shell=bash
# Workspace files, summaries, registry, and workspace selection.

SPINOSA_METADATA_DIR="${SPINOSA_HOME}/metadata"
SPINOSA_CONFIG="${SPINOSA_METADATA_DIR}/config.yaml"
SPINOSA_CACHE="${SPINOSA_METADATA_DIR}/workspace_cache.txt"
SPINOSA_REGISTRY="${SPINOSA_METADATA_DIR}/workspaces.txt"
SPINOSA_VERSION_CACHE="${SPINOSA_METADATA_DIR}/version_check_cache"
DEFAULT_SCAN_ROOTS=("$HOME")

write_setup_files() {
  local root="$1" project_title="$2" source_path="$3" preferred_cli="$4"
  local context="$root/system/context.md" config="$root/system/configuration.md"
  local agents="$root/AGENTS.md" claude="$root/CLAUDE.md"

  mkdir -p "$(dirname "$context")" "$(dirname "$config")"
  cat > "$context" << CONTEXT_EOF
---
type: information
agent: setup_cli
description:
  - Project blueprint filled during onboarding and startup.
  - Agents read this to understand scope, active corpus, evidence rules, and researcher preferences.
created: $TODAY
updated: $TODAY
setup_status: cli_started
connects_to:
  - AGENTS.md
  - system/configuration.md
  - system/startup.md
  - logs/user_requests.md
---

# Information

## Project
- Title: ${project_title:-[project name]}
- Description: not provided during fast setup; infer from the raw corpus during startup

## Project Artifacts
- none provided during fast setup

## Sources
- Active corpus: raw/
- Main source types: [inferred during startup from the raw corpus]
- Expected incoming sources: [inferred during startup]

## Research Vocabulary
- Key actors / institutions / places: [inferred during startup]
- Key concepts: [inferred during startup]
- Sensitizing concepts, not evidence: [inferred during startup]
- Theoretical frames, not forced labels: [inferred during startup]

## Method And Evidence
- Methods: [inferred during startup]
- Claims require source paths.
- L2 clues require Verifier checking before reporting.
- External sources must stay labeled external unless moved into \`raw/\`.
- External source policy: no (default; ask only if external access is needed)

## Outputs
- Start with navigation maps in maps/ and evidence-grounded answers unless the researcher requests another output.

## Blind Spots
- [identified during startup]

## Researcher Preferences
[stated or inferred during startup]

## Preferred LLM CLI
$preferred_cli
CONTEXT_EOF

  cat > "$config" << CONFIG_EOF
---
type: project_configuration
agent: setup_cli
description:
  - Operating profile for the current Spinosa project or framework template.
  - Agents read this first to learn source policy, protected paths, and setup status.
created: $TODAY
updated: $TODAY
setup_status: cli_started
---

# Configuration

Agents read this before major work.

\`\`\`yaml
workspace_type: research_framework
research_mode: evolving_complex_corpus
active_corpus_path: raw/
source_mode: imported_raw_corpus

source_policy: internal_first
active_corpus_policy: raw_only_after_onboarding
external_sources_allowed: no

claim_standard: source_link_required
l2_policy: verifier_required

protected_paths:
  - raw/
  - context.md

stale_after_days: 30
preferred_llm_cli: "$preferred_cli"
\`\`\`

## Notes
- This file was initialized by \`spinosa new\`.
- The CLI collected: source folder and preferred LLM CLI. It seeded the initial workspace label from the source folder name. It imported accepted files into raw/. Office documents, structured data, and text-based PDFs were converted to Markdown. Scanned PDFs and images were processed via RapidOCR OCR. Selected audio and video files were copied unchanged. AGENTS.md control files were skipped.
- After onboarding, normal source-grounded work starts from raw/.
- During startup, project description and helpful artifact URLs are optional. If absent, the LLM CLI agent records them as not provided, keeps external_sources_allowed at its default \`no\`, and infers working scope from the raw corpus.
- When setup_status reaches workspace_started, the startup workflow has built the master dictionary, generated YAML headers, created multi-level navigation maps in maps/, and passed validation.
- This file never grants permission to edit \`raw/\`.
CONFIG_EOF

  if [[ "$preferred_cli" == "Claude Code" && -f "$agents" ]]; then
    cp "$agents" "$claude"
  fi

  mkdir -p "$root/.obsidian/snippets"
  cat > "$root/.obsidian/appearance.json" << 'APPEARANCE_EOF'
{
  "cssSnippets": [
    "spinosa"
  ]
}
APPEARANCE_EOF

}


write_onboarding_summary() {
  local root="$1" project_title="$2" source_path="$3" preferred_cli="$4" handoff_action="$5" handoff_result="$6"
  local summary_path="$root/.spinosa/onboarding-summary.md"
  local ocr_mode="not_applicable"
  if [[ "${SCAN_OCR_CONVERTIBLE_COUNT:-0}" -gt 0 ]]; then
    if [[ "${COPY_OCR_CONVERTED_COUNT:-0}" -gt 0 ]]; then
      ocr_mode="rapidocr_structured"
    elif [[ "${COPY_OCR_SKIPPED_COUNT:-0}" -gt 0 ]]; then
      ocr_mode="ocr_skipped"
    elif rapidocr_ocr_available; then
      ocr_mode="rapidocr_available"
    else
      ocr_mode="rapidocr_not_bundled"
    fi
  fi
  local markitdown_mode="not_applicable"
  if [[ "${SCAN_MARKITDOWN_COUNT:-0}" -gt 0 ]]; then
    if [[ "${COPY_MARKITDOWN_CONVERTED_COUNT:-0}" -gt 0 ]]; then
      markitdown_mode="markitdown_converted"
    elif [[ "${COPY_MARKITDOWN_SKIPPED_COUNT:-0}" -gt 0 ]]; then
      markitdown_mode="markitdown_skipped"
    elif markitdown_available; then
      markitdown_mode="markitdown_available"
    else
      markitdown_mode="markitdown_not_bundled"
    fi
  fi

  cat > "$summary_path" << SUMMARY_EOF
---
type: onboarding_summary
created: $TODAY
updated: $TODAY
---

# Onboarding Summary

## Workspace
- Initial workspace label: ${project_title}
- Workspace: ${root}
- Active corpus: raw/

## Scan Summary
- Text-based files to rename to Markdown: ${SCAN_MARKDOWN_COUNT} ($(format_bytes "$SCAN_MARKDOWN_BYTES"))
- Office docs/HTML/EPUB/text PDFs via MarkItDown: ${SCAN_MARKITDOWN_COUNT:-0} ($(format_bytes "${SCAN_MARKITDOWN_BYTES:-0}"))
- Native-readable files to copy unchanged: ${SCAN_NATIVE_COUNT} ($(format_bytes "$SCAN_NATIVE_BYTES"))
- Scanned PDFs and images available for OCR: ${SCAN_OCR_CONVERTIBLE_COUNT:-0} ($(format_bytes "${SCAN_OCR_CONVERTIBLE_BYTES:-0}"))
- Videos (optional): ${SCAN_VIDEO_COUNT} ($(format_bytes "$SCAN_VIDEO_BYTES"))
- Audio (optional): ${SCAN_AUDIO_COUNT} ($(format_bytes "$SCAN_AUDIO_BYTES"))
- Unsupported or unknown files: ${SCAN_UNKNOWN_COUNT} ($(format_bytes "$SCAN_UNKNOWN_BYTES"))
- Ignored files: ${SCAN_IGNORED_COUNT}

## Workspace Import Result
- Selected import candidates: ${COPY_TOTAL_COUNT:-0}
- Selected extension batches: $(selected_import_extensions_label)
- Files imported into workspace: ${COPY_IMPORTED_COUNT:-0}
- Files copied directly into workspace: ${COPY_COPIED_COUNT:-0}
- Files skipped during direct copy: ${COPY_SKIPPED_COUNT:-0}
- MarkItDown converted: ${COPY_MARKITDOWN_CONVERTED_COUNT:-0}
- MarkItDown skipped: ${COPY_MARKITDOWN_SKIPPED_COUNT:-0}
- MarkItDown mode: ${markitdown_mode}
- OCR (RapidOCR) converted: ${COPY_OCR_CONVERTED_COUNT:-0}
- OCR (RapidOCR) skipped: ${COPY_OCR_SKIPPED_COUNT:-0}
- OCR mode: ${ocr_mode}

## Handoff
- Preferred CLI: ${preferred_cli}
- Handoff action: ${handoff_action}
- Handoff result: ${handoff_result}
SUMMARY_EOF

  tree_sep
  tree_row_last "Onboarding summary" "written" "${BOLD}$summary_path${RESET}"
}


startup_prompt_text() {
  local project_title="$1" root="$2" source_path="$3" preferred_cli="$4"
  local prompt_template="${FRAMEWORK_ROOT}/.bin/startup-prompt.md"

  # Read the self-contained startup prompt template
  cat "$prompt_template" 2>/dev/null || true

  # Append workspace-specific metadata
  cat << PROMPT_EOF

## Workspace Metadata

- **Project title:** ${project_title}
- **Workspace root:** ${root}
- **Preferred CLI:** ${preferred_cli}
- **Onboarding summary:** .spinosa/onboarding-summary.md

## Corpus Boundary

- Treat raw/ as the only source corpus.
- Do not inspect, validate, mention, or rely on the original import folder.
- Do not edit raw/ file bodies.
- External sources are disabled unless the user explicitly asks for them.
PROMPT_EOF
}


prompt_add_text() {
  local root="$1" preferred_cli="$2"
  local raw_count
  raw_count="$(find "$root/raw" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"
  cat << PROMPT_EOF
Workspace: ${root}

New source files have been added to this Spinosa workspace.

The CLI has already imported and converted the new files into raw/.

The raw/ corpus now contains approximately ${raw_count} Markdown files.

Read these files first, in this order:
1. AGENTS.md
2. system/configuration.md
3. system/context.md
4. .bin/startup-prompt.md (for extraction format and map structure reference)
5. system/dictionary.md
6. system/workspace_index.md
7. .spinosa/add-summary.md

Tasks to perform:

1. Detect new files in raw/ that are not yet in maps/ or system/dictionary.md.
2. Group the new files into batches of 20-25.
3. Spawn a spinosa-mapper sub-agent per batch to extract:
   - Dictionary terms (names, places, organizations, domain terms, concepts)
   - Content signatures (one-paragraph summary, key passages with line refs, concept signals, connections)
4. Merge all extraction results into agent_reports/extraction_checkpoint.md.
5. Update system/dictionary.md with new terms from the new files.
6. Update navigation maps in maps/ to include the new files:
   - Update maps/corpus_overview.md with new structural groups if needed.
   - Update or create group maps for any new natural groups.
   - Update theme maps with cross-cutting concepts from the new files.
7. Update system/workspace_index.md to reflect the expanded corpus.
8. Run spinosa-verifier on new content to truth-check claims and passages.
9. Run .bin/check-startup.sh to validate workspace integrity.

Corpus boundary:
- Treat raw/ as the only source corpus.
- Do not edit raw/ file bodies.
- External sources are disabled unless the user explicitly asks for them.

Preferred LLM CLI: ${preferred_cli}

Finished means:
- Every new file has been accounted for in dictionary, maps, and index.
- system/workspace_index.md records updated coverage, maps, and gaps.
- agent_reports/ contains an add report with validation and retrieval-test results.

Do not re-index files that are already mapped. Only process additions.
PROMPT_EOF
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: add
# ═══════════════════════════════════════════════════════════════════════════
# Flow: select workspace -> get source file/folder -> run pipeline -> generate re-mapper prompt

ensure_global_metadata() {
  mkdir -p "$SPINOSA_METADATA_DIR"
  local name legacy current
  for name in config.yaml workspace_cache.txt workspaces.txt version_check_cache; do
    legacy="${SPINOSA_HOME}/${name}"
    current="${SPINOSA_METADATA_DIR}/${name}"
    if [[ -f "$legacy" && ! -f "$current" ]]; then
      mv "$legacy" "$current" 2>/dev/null || cp "$legacy" "$current" 2>/dev/null || true
    fi
  done
}

# Load config from ~/.spinosa/config.yaml

load_config() {
  ensure_global_metadata
  SCAN_ROOTS=("${DEFAULT_SCAN_ROOTS[@]}")
  local in_scan_roots=0
  
  [[ -f "$SPINOSA_CONFIG" ]] || return 0
  
  while IFS= read -r line; do
    if [[ "$line" == scan_roots:* ]]; then
      # Configured roots replace defaults; fallback below restores defaults if empty.
      SCAN_ROOTS=()
      in_scan_roots=1
    elif [[ "$line" == "  - "* ]]; then
      [[ "$in_scan_roots" -eq 1 ]] || continue
      local root="${line#  - }"
      root="${root//\"/}"
      root="${root//\~/$HOME}"
      SCAN_ROOTS+=("$root")
    elif [[ "$line" != " "* ]]; then
      in_scan_roots=0
    fi
  done < "$SPINOSA_CONFIG"
  
  # Set defaults if not found
  [[ ${#SCAN_ROOTS[@]} -eq 0 ]] && SCAN_ROOTS=("${DEFAULT_SCAN_ROOTS[@]}") || true
}

# Scan workspaces and return paths

scan_workspaces() {
  local roots=("$@")
  local seen=()
  
  # Handle empty roots array
  [[ ${#roots[@]} -gt 0 ]] || return 0
  
  for root in "${roots[@]}"; do
    [[ -d "$root" ]] || continue
    while IFS= read -r -d '' ws_file; do
      local ws_dir
      ws_dir="$(cd "$(dirname "$(dirname "$ws_file")")" && pwd)"
      local already_seen=0
      for s in "${seen[@]}"; do
        [[ "$s" == "$ws_dir" ]] && { already_seen=1; break; }
      done
      [[ "$already_seen" == "0" ]] || continue
      seen+=("$ws_dir")
      printf '%s\n' "$ws_dir"
    done < <(find "$root" -maxdepth 5 -name "workspace" -path "*/.spinosa/workspace" -print0 2>/dev/null)
  done
}

# Update cache with discovered workspaces

update_cache() {
  local workspaces=("$@")
  
  ensure_global_metadata
  
  {
    for ws in "${workspaces[@]}"; do
      local project
      project="$(grep 'project_name:' "$ws/.spinosa/workspace" 2>/dev/null | sed 's/project_name: *//' | head -1)"
      echo "$ws|$project"
    done
  } > "$SPINOSA_CACHE"
}


discover_registered_workspaces() {
  load_config

  # Try registry first (instant)
  if load_registry; then
    return 0
  fi

  # Cache fallback covers installs before registry migration. Scanning happens
  # only from explicit "Find other workspaces" action.
  if [[ -f "$SPINOSA_CACHE" ]]; then
    awk -F '|' '{ if ($1 != "") print $0 }' "$SPINOSA_CACHE"
    return 0
  fi

  return 1
}


registry_escape() {
  local value="$1"
  value="${value//%/%25}"
  value="${value//|/%7C}"
  printf '%s' "$value"
}


registry_unescape() {
  local value="$1"
  value="${value//%7C/|}"
  value="${value//%25/%}"
  printf '%s' "$value"
}

# Load workspaces from persistent registry

load_registry() {
  ensure_global_metadata
  local registry="$SPINOSA_REGISTRY"
  [[ -f "$registry" ]] || return 1
  
  local found=0 tmp raw_path raw_project created path project
  tmp="${registry}.tmp.$$"
  : > "$tmp" 2>/dev/null || tmp=""
  while IFS='|' read -r raw_path raw_project created; do
    path="$(registry_unescape "$raw_path")"
    project="$(registry_unescape "${raw_project:-}")"
    [[ -f "$path/.spinosa/workspace" ]] || continue
    printf '%s|%s\n' "$path" "$project"
    if [[ -n "$tmp" ]]; then
      printf '%s|%s|%s\n' "$raw_path" "${raw_project:-}" "${created:-$TODAY}" >> "$tmp"
    fi
    found=1
  done < "$registry"
  if [[ -n "$tmp" ]]; then
    mv "$tmp" "$registry" 2>/dev/null || rm -f "$tmp" 2>/dev/null || true
  fi
  
  [[ $found -eq 1 ]]
}

# Register a workspace in the persistent registry

register_workspace() {
  local path="$1"
  local project="${2:-}"
  local registry="$SPINOSA_REGISTRY"
  local encoded_path encoded_project
  encoded_path="$(registry_escape "$path")"
  encoded_project="$(registry_escape "$project")"
  
  ensure_global_metadata
  
  # Remove if already exists
  if [[ -f "$registry" ]]; then
    awk -F '|' -v p="$encoded_path" '$1 != p' "$registry" > "${registry}.tmp"
    mv "${registry}.tmp" "$registry"
  fi

  # Add new entry
  echo "${encoded_path}|${encoded_project}|$(date +%Y-%m-%d)" >> "$registry"
}

# Update registry with discovered workspaces

update_registry() {
  local workspaces=("$@")
  local registry="$SPINOSA_REGISTRY"
  
  ensure_global_metadata
  touch "$registry"
  
  for ws in "${workspaces[@]}"; do
    validate_workspace "$ws" || continue
    local project
    project="$(grep 'project_name:' "$ws/.spinosa/workspace" 2>/dev/null | sed 's/project_name: *//' | head -1)"
    local encoded_ws encoded_project
    encoded_ws="$(registry_escape "$ws")"
    encoded_project="$(registry_escape "$project")"
    # Only add if not already in registry
    if ! awk -F '|' -v p="$encoded_ws" '$1 == p { found=1 } END { exit found ? 0 : 1 }' "$registry" 2>/dev/null; then
      echo "${encoded_ws}|${encoded_project}|$(date +%Y-%m-%d)" >> "$registry"
    fi
  done
}



validate_workspace() {
  local path="$1"
  [[ -d "$path" ]] || return 1
  [[ -f "$path/.spinosa/workspace" ]] || return 1
  return 0
}

# Prompt for workspace path with escape option

prompt_workspace_or_cancel() {
  local hint="(Enter workspace path, Esc to go back)"
  while true; do
    local manual_path
    manual_path="$(prompt_input "Workspace path" "" "$hint")"
    # Esc → cancel
    [[ "$manual_path" != $'\e'* ]] || return 1
    [[ -n "$manual_path" ]] || continue
    manual_path="$(expand_home "$manual_path")"
    if ! validate_workspace "$manual_path"; then
      printf '%s\n' "${R}Not a valid Spinosa workspace: $manual_path${RESET}" >&2
      continue
    fi
    echo "$manual_path"
    return 0
  done
}

# Main helper - returns workspace path or prompts for selection

require_workspace() {
  local provided_path="${1:-}"

  # Check if CWD is already a workspace
  if [[ -f ".spinosa/workspace" ]]; then
    pwd
    return 0
  fi

  # If path provided, validate it
  if [[ -n "$provided_path" ]]; then
    provided_path="$(expand_home "$provided_path")"
    if validate_workspace "$provided_path"; then
      echo "$provided_path"
      return 0
    else
      die "Not a valid Spinosa workspace: $provided_path"
    fi
  fi
  
  # Not in a workspace - discover and prompt
  local discovered=()
  local workspace_data
  
  spinner_start "Loading registered workspaces"
  workspace_data="$(discover_registered_workspaces 2>/dev/null || true)"
  spinner_stop
  
  if [[ -z "$workspace_data" ]]; then
    printf '\n%s\n' "${Y}Not in a Spinosa workspace.${RESET}" >&2
    prompt_workspace_or_cancel || return 1
    return 0
  fi
  
  # Parse discovered workspaces
  while IFS='|' read -r ws_path project; do
    [[ -n "$ws_path" ]] && discovered+=("$ws_path|$project")
  done <<< "$workspace_data"
  
  if [[ ${#discovered[@]} -eq 0 ]]; then
    # No valid workspaces - prompt for path
    prompt_workspace_or_cancel || return 1
    return 0
  fi
  
  # Build options for selection
  local options=()
  for entry in "${discovered[@]}"; do
    local ws_path="${entry%%|*}"
    local project="${entry#*|}"
    local ws_name
    ws_name="$(basename "$ws_path")"
    
    if [[ -n "$project" ]]; then
      options+=("$(option_spec "$ws_path" "$ws_name" "$project")")
    else
      options+=("$(option_spec "$ws_path" "$ws_path" "")")
    fi
  done
  options+=("$(option_spec "__scan__" "Find other workspaces" "scan directories for workspaces")")
  options+=("$(option_spec "__enter__" "Enter path manually" "type a workspace path")")
  
  local choice
  choice="$(prompt_choose "Select a workspace" "${options[@]}")" || return 1
  
  if [[ "$choice" == "__scan__" ]]; then
    spinner_start "Scanning for workspaces"
    local scanned=()
    while IFS= read -r ws; do
      [[ -n "$ws" ]] && scanned+=("$ws")
    done < <(scan_workspaces "${SCAN_ROOTS[@]}")
    spinner_stop
    
    local new_count=0
    for ws in "${scanned[@]}"; do
      if ! awk -F '|' -v p="$(registry_escape "$ws")" '$1 == p { found=1 } END { exit found ? 0 : 1 }' "$SPINOSA_REGISTRY" 2>/dev/null; then
        new_count=$((new_count + 1))
      fi
    done
    
    update_registry "${scanned[@]}"
    
    if [[ $new_count -gt 0 ]]; then
      ok "Found ${new_count} new workspace(s), registry updated"
    else
      info "No new workspaces found"
    fi
    
    # Re-prompt with updated list
    exec "$0" "${ORIGINAL_ARGS[@]}"
  elif [[ "$choice" == "__enter__" ]]; then
    local manual_path
    manual_path="$(prompt_input "Workspace path")"
    [[ -n "$manual_path" ]] || die "Path is required"
    manual_path="$(expand_home "$manual_path")"
    if ! validate_workspace "$manual_path"; then
      die "Not a valid Spinosa workspace: $manual_path"
    fi
    echo "$manual_path"
  else
    echo "$choice"
  fi
}





# Fetch release notes from GitHub API
