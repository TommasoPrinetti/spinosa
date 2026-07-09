#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPINOSA_LOG_COMPONENT="check-startup"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"

# ── ANSI colors (zero dependencies) ──────────────────────────────────────────
if [[ "${NO_COLOR:-}" == "1" ]] || [[ ! -t 1 ]]; then
  R="" G="" Y="" BOLD="" RESET=""
else
  R=$'\033[31m' G=$'\033[32m' Y=$'\033[33m' BOLD=$'\033[1m' RESET=$'\033[0m'
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failures=()
warnings=()

# ── helpers ──────────────────────────────────────────────────────────────────
read_file() {
  local path="$ROOT/$1"
  if [[ ! -f "$path" ]]; then
    failures+=("Missing $1")
    echo ""
    return
  fi
  cat "$path"
}

# ── read required files ─────────────────────────────────────────────────────
required_files=(
  "AGENTS.md"
  "system/configuration.md"
  "system/context.md"
)

for file in "${required_files[@]}"; do
  read_file "$file" > /dev/null
done

config="$(read_file "system/configuration.md")"
blueprint="$(read_file "system/context.md")"
startup_text="${config}
${blueprint}"

config_status="$(echo "$config" | sed -n 's/^setup_status: *//p' | head -1)"
context_status="$(echo "$blueprint" | sed -n 's/^setup_status: *//p' | head -1)"
is_template_repo=false
if echo "$config" | grep -q "workspace_type: research_framework" && \
   [[ "$config_status" == "not_started" ]] && [[ "$context_status" == "not_started" ]]; then
  is_template_repo=true
fi

if [[ "$is_template_repo" == "true" ]]; then
  if ! echo "$config" | grep -q 'active_corpus_path: raw/'; then
    failures+=("Template configuration must set active_corpus_path: raw/.")
  fi
  if ! echo "$blueprint" | grep -q '\[filled by startup\]'; then
    failures+=("Template context must keep startup placeholders.")
  fi
  if ! echo "$config" | grep -qE "external_sources_allowed: *(yes|no)"; then
    failures+=("external_sources_allowed is missing or invalid.")
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf '%s\n' "${BOLD}${R}Startup check failed:${RESET}"
    for f in "${failures[@]}"; do
      printf '  %s %s\n' "${R}✗${RESET}" "$f"
    done
    exit 1
  fi

  printf '%s\n' "${G}${BOLD}Startup check passed.${RESET}"
  printf '  %s Framework template mode: onboarding/startup placeholders are expected.\n' "${Y}⚠${RESET}"
  exit 0
fi

# ── check for leftover placeholders ─────────────────────────────────────────
for marker in "[path]" "[project name]"; do
  if [[ "$startup_text" == *"$marker"* ]]; then
    failures+=("Required placeholder remains: $marker")
  fi
done

# ── check setup_status ──────────────────────────────────────────────────────
if [[ "$startup_text" == *"setup_status: cli_started"* ]]; then
  warnings+=("setup_status is cli_started; startup indexing has not completed yet.")
elif [[ "$startup_text" != *"setup_status: workspace_started"* ]]; then
  warnings+=("setup_status: workspace_started was not found.")
fi

# ── check for stale fast-setup markers ──────────────────────────────────────
if echo "$startup_text" | grep -qE "To be discovered|Not specified during fast setup"; then
  warnings+=("Legacy fast-setup markers remain in blueprint/config.")
fi

# ── check active raw corpus ─────────────────────────────────────────────────
active_corpus_path="$(echo "$config" | sed -n 's/.*active_corpus_path: *["'\'']*\([^"'\'']*\)["'\'']*.*/\1/p' | head -1)"
[[ -z "$active_corpus_path" ]] && active_corpus_path="raw/"
if [[ "$active_corpus_path" != "raw/" && "$active_corpus_path" != "raw" ]]; then
  failures+=("active_corpus_path must be raw/: $active_corpus_path")
fi
if [[ ! -d "$ROOT/raw" ]]; then
  failures+=("Active corpus directory does not exist: raw/")
fi

# ── check external policy ───────────────────────────────────────────────────
if ! echo "$config" | grep -qE "external_sources_allowed: *(yes|no)"; then
  failures+=("external_sources_allowed is missing or invalid.")
fi

# ── validate generated raw_copy and map frontmatter ─────────────────────────
raw_dir="$ROOT/raw"
maps_dir="$ROOT/maps"

frontmatter_value() {
  local file="$1" key="$2"
  awk '
    /^---$/ { marks++; next }
    marks == 1 { print }
    marks == 2 { exit }
  ' "$file" | sed -n "s/^${key}: *//p" | head -1 | sed 's/^"//; s/"$//'
}

has_frontmatter_key() {
  local file="$1" key="$2"
  awk '
    /^---$/ { marks++; next }
    marks == 1 { print }
    marks == 2 { exit }
  ' "$file" | grep -qE "^${key}:"
}

validate_generated_provenance() {
  local file="$1"
  if ! has_frontmatter_key "$file" "created"; then
    failures+=("Missing created in ${file#"$ROOT/"}")
  fi
}

validate_array_field() {
  local file="$1" key="$2"
  local value
  value="$(frontmatter_value "$file" "$key")"
  [[ -z "$value" ]] && return
  if [[ "$value" != \[* ]]; then
    failures+=("Field $key must be a YAML array in ${file#"$ROOT/"}")
  fi
}

validate_string_field() {
  local file="$1" key="$2"
  if ! has_frontmatter_key "$file" "$key"; then
    return
  fi
  local value
  value="$(frontmatter_value "$file" "$key")"
  if [[ "$value" == \[* ]]; then
    failures+=("Field $key must be a string, not an array in ${file#"$ROOT/"}")
  fi
}

resolve_wikilinks() {
  local file="$1"
  local link target candidate resolved

  while IFS= read -r link; do
    target="${link#\[\[}"
    target="${target%\]\]}"
    target="${target%%|*}"
    target="${target%%#*}"
    [[ -z "$target" ]] && continue
    [[ "$target" == http:* || "$target" == https:* ]] && continue

    resolved="no"
    for candidate in \
      "$ROOT/raw/${target}.md" \
      "$ROOT/raw/${target}" \
      "$maps_dir/${target}.md" \
      "$maps_dir/${target}" \
      "$ROOT/${target}.md" \
      "$ROOT/${target}"; do
      if [[ -f "$candidate" ]]; then
        resolved="yes"
        break
      fi
    done

    if [[ "$resolved" != "yes" ]]; then
      failures+=("Broken wikilink in ${file#"$ROOT/"}: [[$target]]")
    fi
  done < <(grep -o '\[\[[^]]\+\]\]' "$file" 2>/dev/null || true)
}

validate_key_passage_line_refs() {
  local file="$1"
  local in_key_section=false
  local line raw_link missing_ref

  while IFS= read -r line; do
    if [[ "$line" =~ ^###[[:space:]] || "$line" =~ ^##[[:space:]] ]]; then
      if [[ "$line" =~ [Kk]ey[[:space:]-]?[Pp]assages || "$line" =~ [Rr]ecurring[[:space:]-]?[Cc]oncepts || "$line" =~ [Ee]vidence ]]; then
        in_key_section=true
      else
        in_key_section=false
      fi
    fi

    [[ "$line" != *"[[raw/"* ]] && continue
    [[ "$in_key_section" != "true" && "$line" != *"->"* ]] && continue

    missing_ref=false
    while IFS= read -r raw_link; do
      [[ -z "$raw_link" ]] && continue
      if [[ ! "$line" =~ \]\][[:space:]]+L[0-9]+(-L[0-9]+)?\b ]]; then
        missing_ref=true
      fi
    done < <(grep -o '\[\[raw/[^]]\+\]\]' <<< "$line" || true)

    if [[ "$missing_ref" == "true" ]]; then
      failures+=("Key-passage raw wikilink lacks line reference in ${file#"$ROOT/"}: ${line:0:160}")
    fi
  done < "$file"
}

warn_optional_startup_gaps() {
  local speaker_hits worksheet_hits
  speaker_hits="$(grep -RIl --exclude='.DS_Store' --exclude='._*' 'SPEAKER_[0-9][0-9]' "$raw_dir" 2>/dev/null || true)"
  if [[ -n "$speaker_hits" ]] && ! grep -RIq --exclude='.DS_Store' --exclude='._*' 'speaker_mapping_status: *verified' "$raw_dir" "$maps_dir" 2>/dev/null; then
    warnings+=("Speaker labels found without verified speaker_mapping_status metadata; transcript speaker mapping remains unverified.")
  fi

  worksheet_hits="$(grep -RIl --exclude='.DS_Store' --exclude='._*' -E 'source_type: *(participant_worksheet|transcript_for_worksheet)|^exercise:' "$raw_dir" 2>/dev/null || true)"
  if [[ -n "$worksheet_hits" && ! -f "$ROOT/system/exercise_inventory.md" && ! -f "$ROOT/maps/exercise_inventory.md" ]]; then
    warnings+=("Participant worksheet or exercise sources found, but optional exercise inventory is missing.")
  fi
}

if [[ -d "$raw_dir" ]]; then
  while IFS= read -r -d '' file; do
    name="$(basename "$file")"
    [[ "$name" == ".gitkeep" ]] && continue
    [[ "${file#$raw_dir/}" == "AGENTS.md" ]] && continue
    first_line="$(sed -n '1p' "$file")"
    if [[ "$first_line" != "---" ]]; then
      failures+=("Missing YAML frontmatter in ${file#"$ROOT/"}")
      continue
    fi

    file_type="$(frontmatter_value "$file" "type")"
    case "$file_type" in
      raw_copy)
        validate_generated_provenance "$file"
        validate_string_field "$file" "summary"
        for key in people places organizations topics explicit_source_terms canonical_aliases uncertain_terms machine_artifacts metadata_uncertainty related_sources; do
          validate_array_field "$file" "$key"
        done
        ;;
      source_pointer)
        validate_generated_provenance "$file"
        for key in media_type extension size_bytes; do
          if ! has_frontmatter_key "$file" "$key"; then
            failures+=("Missing $key in ${file#"$ROOT/"}")
          fi
        done
        ;;
      raw_folder_index)
        warnings+=("Legacy raw folder index found; maps are authoritative: ${file#"$ROOT/"}")
        ;;
      "")
        failures+=("Missing type in ${file#"$ROOT/"}")
        ;;
      *)
        warnings+=("Unhandled raw_copy type in ${file#"$ROOT/"}: $file_type")
        ;;
    esac
  done < <(find "$raw_dir" -type f -name "*.md" -not -name ".DS_Store" -not -name "._*" -print0 2>/dev/null)
fi

if [[ "$startup_text" == *"setup_status: workspace_started"* ]]; then
  if [[ ! -d "$maps_dir" ]]; then
    failures+=("Missing maps directory: maps")
  else
    has_overview=false
    for map_file in "$maps_dir"/*.md; do
      map_basename="$(basename "$map_file")"
      [[ "$map_basename" == "AGENTS.md" || "$map_basename" == "map_template.md" || "$map_basename" == ".gitkeep" ]] && continue
      has_overview=true
      break
    done
    if [[ "$has_overview" == "false" ]]; then
      failures+=("No structural overview map found at maps/ root")
    fi

    has_groups=false
    for dir in "$maps_dir"/*/; do
      [[ ! -d "$dir" ]] && continue
      dir_name="$(basename "$dir")"
      [[ "$dir_name" == ".gitkeep" ]] && continue
      has_groups=true
      break
    done
    if [[ "$has_groups" == "false" ]]; then
      failures+=("No group map subdirectories found under maps/")
    fi

    while IFS= read -r -d '' map_file; do
      map_basename="${map_file#$maps_dir/}"
      [[ "$map_basename" == "AGENTS.md" || "$map_basename" == "map_template.md" || "$map_basename" == ".gitkeep" ]] && continue

      first_line="$(sed -n '1p' "$map_file")"
      if [[ "$first_line" != "---" ]]; then
        failures+=("Missing YAML frontmatter in ${map_file#$ROOT/}")
        continue
      fi

      validate_generated_provenance "$map_file"
      if ! grep -q '\[\[' "$map_file"; then
        failures+=("Navigation map has no wikilinks: ${map_file#$ROOT/}")
      else
        resolve_wikilinks "$map_file"
        validate_key_passage_line_refs "$map_file"
      fi
    done < <(find "$maps_dir" -type f -name "*.md" -not -name ".DS_Store" -not -name "._*" -print0 2>/dev/null)
  fi

  warn_optional_startup_gaps
fi

# ── check granted_tools in agent definitions ──────────────────────────────────
validate_granted_tools() {
  local agents_dir="$1"
  local agent_file script_path

  while IFS= read -r -d '' agent_file; do
    agent_basename="$(basename "$agent_file")"
    [[ "$agent_basename" == ".gitkeep" ]] && continue

    frontmatter="$(awk 'BEGIN{count=0} count<2{print; if(/^---/) count++}' "$agent_file")"

    if ! grep -q '^granted_tools:' <<< "$frontmatter"; then
      warnings+=("Agent definition $agent_basename has no granted_tools section")
      continue
    fi

    while IFS= read -r script_line; do
      script_line="$(echo "$script_line" | xargs)"
      script_path="${script_line#script: }"
      script_path="${script_path#script:}"
      script_path="$(echo "$script_path" | xargs)"
      if [[ ! -f "$script_path" && ! -f "$ROOT/$script_path" ]]; then
        failures+=("granted_tools script not found: $script_path (declared in $agent_basename)")
      fi
    done < <(grep '^[[:space:]]*script:' <<< "$frontmatter" || true)
  done < <(find "$agents_dir" -type f -name "*.md" -not -name ".DS_Store" -not -name "._*" -print0 2>/dev/null)
}

if [[ -d "$ROOT/.agents/agents" ]]; then
  validate_granted_tools "$ROOT/.agents/agents"
fi

# ── check workspace_index.md and dictionary.md ───────────────────────────────
if [[ "$startup_text" == *"setup_status: workspace_started"* ]]; then
  for required_file in "system/workspace_index.md" "system/dictionary.md"; do
    if [[ ! -f "$ROOT/$required_file" ]]; then
      failures+=("Missing required file: $required_file")
    else
      file_content="$(read_file "$required_file")"
      if [[ -z "$file_content" ]]; then
        failures+=("Empty required file: $required_file")
      fi
    fi
  done
fi

# ── output ───────────────────────────────────────────────────────────────────
if [[ ${#failures[@]} -gt 0 ]]; then
  printf '%s\n' "${BOLD}${R}Startup check failed:${RESET}"
  for f in "${failures[@]}"; do
    printf '  %s %s\n' "${R}✗${RESET}" "$f"
  done
  if [[ ${#warnings[@]} -gt 0 ]]; then
    printf '\n%s\n' "${BOLD}${Y}Warnings:${RESET}"
    for w in "${warnings[@]}"; do
      printf '  %s %s\n' "${Y}⚠${RESET}" "$w"
    done
  fi
  exit 1
fi

printf '%s\n' "${G}${BOLD}Startup check passed.${RESET}"
if [[ ${#warnings[@]} -gt 0 ]]; then
  printf '\n%s\n' "${BOLD}${Y}Warnings:${RESET}"
  for w in "${warnings[@]}"; do
    printf '  %s %s\n' "${Y}⚠${RESET}" "$w"
  done
fi
