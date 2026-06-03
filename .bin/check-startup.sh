#!/usr/bin/env bash
set -euo pipefail

# ── ANSI colors (zero dependencies) ──────────────────────────────────────────
if [[ "${NO_COLOR:-}" == "1" ]] || [[ ! -t 1 ]]; then
  R="" G="" Y="" BOLD="" RESET=""
else
  R=$'\033[31m' G=$'\033[32m' Y=$'\033[33m' BOLD=$'\033[1m' RESET=$'\033[0m'
fi

ROOT="$(pwd)"
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
  "system/instructions/configuration.md"
  "system/instructions/startup.md"
  "information.md"
)

for file in "${required_files[@]}"; do
  read_file "$file" > /dev/null
done

config="$(read_file "system/instructions/configuration.md")"
blueprint="$(read_file "information.md")"
startup_text="${config}
${blueprint}"

# ── check for leftover placeholders ─────────────────────────────────────────
for marker in "[path]" "[project name]"; do
  if [[ "$startup_text" == *"$marker"* ]]; then
    failures+=("Required placeholder remains: $marker")
  fi
done

# ── check setup_status ──────────────────────────────────────────────────────
if [[ "$startup_text" == *"setup_status: cli_started"* ]]; then
  failures+=("setup_status is still cli_started; run the workspace startup agent.")
fi

if [[ "$startup_text" != *"setup_status: zone_started"* ]]; then
  warnings+=("setup_status: zone_started was not found.")
fi

# ── check for stale fast-setup markers ──────────────────────────────────────
if echo "$startup_text" | grep -qE "To be discovered|Not specified during fast setup"; then
  warnings+=("Legacy fast-setup markers remain in blueprint/config.")
fi

# ── check root vault path ───────────────────────────────────────────────────
root_vault_path="$(echo "$config" | sed -n 's/.*root_vault_path: *["'\'']*\([^"'\'']*\)["'\'']*.*/\1/p' | head -1)"

if [[ -z "$root_vault_path" || "$root_vault_path" == "[path]" ]]; then
  failures+=("root_vault_path is missing or still a placeholder.")
else
  # check both relative and absolute
  if [[ ! -d "$root_vault_path" && ! -d "$ROOT/$root_vault_path" ]]; then
    failures+=("Root Vault path does not exist: $root_vault_path")
  else
    local_path="$root_vault_path"
    [[ ! -d "$local_path" ]] && local_path="$ROOT/$root_vault_path"
    if [[ ! -d "$local_path" ]]; then
      warnings+=("Root Vault path is not a directory: $root_vault_path")
    fi
  fi
fi

# ── check external policy ───────────────────────────────────────────────────
if ! echo "$config" | grep -qE "external_sources_allowed: *(yes|no)"; then
  failures+=("external_sources_allowed is missing or invalid.")
fi

# ── validate generated raw-zone and map frontmatter ─────────────────────────
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
  for key in generated_by generated_at processing_status; do
    if ! has_frontmatter_key "$file" "$key"; then
      failures+=("Missing $key in ${file#$ROOT/}")
    fi
  done
}

validate_source_path() {
  local file="$1"
  local source
  source="$(frontmatter_value "$file" "source")"
  if [[ -z "$source" ]]; then
    failures+=("Missing source in ${file#$ROOT/}")
    return
  fi
  if [[ ! -e "$source" && ! -e "$ROOT/$source" ]]; then
    failures+=("Source path does not exist in ${file#$ROOT/}: $source")
  fi
}

validate_array_field() {
  local file="$1" key="$2"
  local value
  value="$(frontmatter_value "$file" "$key")"
  [[ -z "$value" ]] && return
  if [[ "$value" != \[* ]]; then
    failures+=("Field $key must be a YAML array in ${file#$ROOT/}")
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
      failures+=("Broken wikilink in ${file#$ROOT/}: [[$target]]")
    fi
  done < <(grep -o '\[\[[^]]\+\]\]' "$file" 2>/dev/null || true)
}

if [[ -d "$raw_dir" ]]; then
  while IFS= read -r -d '' file; do
    name="$(basename "$file")"
    [[ "$name" == ".gitkeep" ]] && continue
    [[ "${file#$raw_dir/}" == "AGENTS.md" ]] && continue
    first_line="$(sed -n '1p' "$file")"
    if [[ "$first_line" != "---" ]]; then
      failures+=("Missing YAML frontmatter in ${file#$ROOT/}")
      continue
    fi

    file_type="$(frontmatter_value "$file" "type")"
    case "$file_type" in
      raw_copy)
        validate_source_path "$file"
        validate_generated_provenance "$file"
        for key in people places organizations topics keywords concepts explicit_source_terms inferred_concepts canonical_aliases uncertain_terms machine_artifacts metadata_uncertainty related_sources; do
          validate_array_field "$file" "$key"
        done
        ;;
      source_pointer)
        validate_source_path "$file"
        validate_generated_provenance "$file"
        for key in media_type extension size_bytes; do
          if ! has_frontmatter_key "$file" "$key"; then
            failures+=("Missing $key in ${file#$ROOT/}")
          fi
        done
        ;;
      raw_folder_index)
        warnings+=("Legacy raw folder index found; maps are authoritative: ${file#$ROOT/}")
        ;;
      "")
        failures+=("Missing type in ${file#$ROOT/}")
        ;;
      *)
        warnings+=("Unhandled raw-zone type in ${file#$ROOT/}: $file_type")
        ;;
    esac
  done < <(find "$raw_dir" -type f -name "*.md" -print0 2>/dev/null)
fi

if [[ "$startup_text" == *"setup_status: zone_started"* ]]; then
  if [[ ! -d "$maps_dir" ]]; then
    failures+=("Missing maps directory: maps")
  else
    while IFS= read -r -d '' map_file; do
      basename="${map_file#$maps_dir/}"
      [[ "$basename" == "AGENTS.md" || "$basename" == "map_template.md" || "$basename" == ".gitkeep" ]] && continue

      first_line="$(sed -n '1p' "$map_file")"
      if [[ "$first_line" != "---" ]]; then
        failures+=("Missing YAML frontmatter in ${map_file#$ROOT/}")
        continue
      fi

      map_type="$(frontmatter_value "$map_file" "type")"
      if [[ "$map_type" != "navigation_map" ]]; then
        failures+=("Map type must be navigation_map in ${map_file#$ROOT/}")
      fi
      validate_generated_provenance "$map_file"
      for key in role map_quality description_depth wikilink_policy; do
        if ! has_frontmatter_key "$map_file" "$key"; then
          failures+=("Missing $key in ${map_file#$ROOT/}")
        fi
      done
      if ! grep -q '\[\[' "$map_file"; then
        failures+=("Navigation map has no Obsidian wikilinks: ${map_file#$ROOT/}")
      else
        resolve_wikilinks "$map_file"
      fi
    done < <(find "$maps_dir" -maxdepth 1 -type f -name "*.md" -print0 2>/dev/null)
  fi
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
