# shellcheck shell=bash
# LLM CLI detection, command building, clipboard, and terminal handoff.

preferred_cli_name() {
  case "$1" in
    claude_code) echo "Claude Code" ;;
    claude_code_desktop) echo "Claude Code Desktop" ;;
    codex) echo "Codex" ;;
    codex_app) echo "Codex App" ;;
    gemini) echo "Gemini" ;;
    qwen) echo "Qwen" ;;
    opencode) echo "OpenCode" ;;
    opencode_desktop) echo "OpenCode Desktop" ;;
    hermes) echo "Hermes Agent" ;;
    kilo) echo "Kilo" ;;
    other) echo "Other" ;;
    *) echo "$1" ;;
  esac
}


handoff_action_label() {
  case "$1" in
    copy_command) echo "Copy launch command" ;;
    run_now) echo "Run launch command now" ;;
    selected_cli) echo "Open selected CLI" ;;
    *) echo "$1" ;;
  esac
}


build_launch_command() {
  local root="$1" cli="$2" prompt="$3" root_cmd
  root_cmd="$(shell_quote "$root")"

  case "$cli" in
    codex)
      printf 'codex -C %s "$(cat <<'\''SPINOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'SPINOSA_STARTUP_PROMPT\n)"\n'
      ;;
    codex_app)
      printf 'codex app %s\n' "$root_cmd"
      ;;
    opencode)
      printf 'opencode --prompt "$(cat <<'\''SPINOSA_STARTUP_PROMPT'\''\n'
      printf '%s\n' "$prompt"
      printf 'SPINOSA_STARTUP_PROMPT\n)" %s\n' "$root_cmd"
      ;;
    opencode_desktop)
      printf 'opencode %s\n' "$root_cmd"
      ;;
    gemini)
      printf 'cd %s && gemini -i "$(cat <<'\''SPINOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'SPINOSA_STARTUP_PROMPT\n)"\n'
      ;;
    qwen)
      printf 'cd %s && qwen -i "$(cat <<'\''SPINOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'SPINOSA_STARTUP_PROMPT\n)"\n'
      ;;
    claude_code)
      printf 'cd %s && claude "$(cat <<'\''SPINOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'SPINOSA_STARTUP_PROMPT\n)"\n'
      ;;
    claude_code_desktop)
      local encoded_prompt
      encoded_prompt="$(printf '%s' "$prompt" | python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))' 2>/dev/null || printf '%s' "$prompt" | sed 's/ /%20/g; s/"/%22/g')"
      printf 'open "claude://code/new?q=%s&folder=%s"\n' "$encoded_prompt" "$root_cmd"
      ;;
    hermes)
      printf 'cd %s && hermes chat\n' "$root_cmd"
      ;;
    kilo)
      printf 'cd %s && kilo "$(cat <<'\''SPINOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'SPINOSA_STARTUP_PROMPT\n)"\n'
      ;;
    *)
      printf 'cd %s && <your-llm-cli> "$(cat <<'\''SPINOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'SPINOSA_STARTUP_PROMPT\n)"\n'
      ;;
  esac
}


_launch_in_terminal() {
  local script="$1"
  if [[ "$(uname)" == "Darwin" ]]; then
    local mac_script="${script%.sh}.command"
    mv "$script" "$mac_script"
    chmod +x "$mac_script"
    open "$mac_script"
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -e bash "$script" &
  elif command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal -- bash "$script" &
  elif command -v xterm >/dev/null 2>&1; then
    xterm -hold -e bash "$script" &
  else
    exec bash "$script"
  fi
}


run_cli_with_prompt() {
  local root="$1" cli="$2" prompt="$3"
  case "$cli" in
	    codex)
	      command -v codex >/dev/null 2>&1 || { warn "codex was not found on PATH."; return 1; }
	      local _ptmp_codex _ltmp_codex
	      _ptmp_codex="$(mktemp /tmp/spinosa-prompt.XXXXXX)"
	      printf '%s' "$prompt" > "$_ptmp_codex"
	      _ltmp_codex="$(mktemp /tmp/spinosa-launch.XXXXXX.sh)"
	      printf '#!/bin/bash\n_prompt=%s\ntrap '\''rm -f "$0" "$_prompt"'\'' EXIT\ncd %s && codex -C %s "$(cat "$_prompt")"\n' \
	        "$(printf '%q' "$_ptmp_codex")" "$(printf '%q' "$root")" "$(printf '%q' "$root")" > "$_ltmp_codex"
      chmod +x "$_ltmp_codex"
      _launch_in_terminal "$_ltmp_codex"
      ok "Opened Codex in a new terminal."
      ;;
    codex_app)
      command -v codex >/dev/null 2>&1 || { warn "codex was not found on PATH."; return 1; }
      copy_to_clipboard "$prompt"
      codex app "$root" &
      ok "Prompt copied to clipboard — paste it in the Codex app."
      ;;
	    opencode)
	      command -v opencode >/dev/null 2>&1 || { warn "opencode was not found on PATH."; return 1; }
	      local _ptmp_oc _ltmp_oc
	      _ptmp_oc="$(mktemp /tmp/spinosa-prompt.XXXXXX)"
	      printf '%s' "$prompt" > "$_ptmp_oc"
	      _ltmp_oc="$(mktemp /tmp/spinosa-launch.XXXXXX.sh)"
	      printf '#!/bin/bash\n_prompt=%s\ntrap '\''rm -f "$0" "$_prompt"'\'' EXIT\ncd %s && opencode --prompt "$(cat "$_prompt")" %s\n' \
	        "$(printf '%q' "$_ptmp_oc")" "$(printf '%q' "$root")" "$(printf '%q' "$root")" > "$_ltmp_oc"
      chmod +x "$_ltmp_oc"
      _launch_in_terminal "$_ltmp_oc"
      ok "Opened OpenCode in a new terminal."
      ;;
    opencode_desktop)
      command -v opencode >/dev/null 2>&1 || { warn "opencode was not found on PATH."; return 1; }
      copy_to_clipboard "$prompt"
      opencode "$root" &
      ok "Prompt copied to clipboard — paste it in the OpenCode TUI."
      ;;
    gemini)
      command -v gemini >/dev/null 2>&1 || { warn "gemini was not found on PATH."; return 1; }
      local _ptmp_gm _ltmp_gm
      _ptmp_gm="$(mktemp /tmp/spinosa-prompt.XXXXXX)"
      printf '%s' "$prompt" > "$_ptmp_gm"
      _ltmp_gm="$(mktemp /tmp/spinosa-launch.XXXXXX.sh)"
      printf '#!/bin/bash\n_prompt=%s\ntrap '\''rm -f "$0" "$_prompt"'\'' EXIT\ncd %s && gemini -i "$(cat "$_prompt")"\n' \
        "$(printf '%q' "$_ptmp_gm")" "$(printf '%q' "$root")" > "$_ltmp_gm"
      chmod +x "$_ltmp_gm"
      _launch_in_terminal "$_ltmp_gm"
      ok "Opened Gemini in a new terminal."
      ;;
    qwen)
      command -v qwen >/dev/null 2>&1 || { warn "qwen was not found on PATH."; return 1; }
      local _ptmp_qw _ltmp_qw
      _ptmp_qw="$(mktemp /tmp/spinosa-prompt.XXXXXX)"
      printf '%s' "$prompt" > "$_ptmp_qw"
      _ltmp_qw="$(mktemp /tmp/spinosa-launch.XXXXXX.sh)"
      printf '#!/bin/bash\n_prompt=%s\ntrap '\''rm -f "$0" "$_prompt"'\'' EXIT\ncd %s && qwen -i "$(cat "$_prompt")"\n' \
        "$(printf '%q' "$_ptmp_qw")" "$(printf '%q' "$root")" > "$_ltmp_qw"
      chmod +x "$_ltmp_qw"
      _launch_in_terminal "$_ltmp_qw"
      ok "Opened Qwen in a new terminal."
      ;;
    claude_code)
      command -v claude >/dev/null 2>&1 || { warn "claude was not found on PATH."; return 1; }
      local _ptmp_cc _ltmp_cc
      _ptmp_cc="$(mktemp /tmp/spinosa-prompt.XXXXXX)"
      printf '%s' "$prompt" > "$_ptmp_cc"
	      _ltmp_cc="$(mktemp /tmp/spinosa-launch.XXXXXX.sh)"
	      printf '#!/bin/bash\n_prompt=%s\ntrap '\''rm -f "$0" "$_prompt"'\'' EXIT\ncd %s && claude "$(cat "$_prompt")"\n' \
	        "$(printf '%q' "$_ptmp_cc")" "$(printf '%q' "$root")" > "$_ltmp_cc"
      chmod +x "$_ltmp_cc"
      _launch_in_terminal "$_ltmp_cc"
      ok "Opened Claude Code in a new terminal."
      ;;
    claude_code_desktop)
      local encoded_prompt
      encoded_prompt="$(printf '%s' "$prompt" | python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))' 2>/dev/null || printf '%s' "$prompt" | sed 's/ /%20/g; s/"/%22/g')"
      if [[ "$(uname)" == "Darwin" ]]; then
        open "claude://code/new?q=${encoded_prompt}&folder=${root}"
        ok "Opening Claude Code Desktop with pre-filled prompt."
      else
        copy_to_clipboard "$prompt"
        ok "Prompt copied to clipboard — open Claude Code Desktop and paste it."
      fi
      ;;
    hermes)
      command -v hermes >/dev/null 2>&1 || { warn "hermes was not found on PATH."; return 1; }
      if [[ ! -f "$root/.hermes/workspace.config.yaml" ]]; then
        warn "Missing $root/.hermes/workspace.config.yaml — run spinosa update to get it"
      fi
      local _ltmp_hm
      _ltmp_hm="$(mktemp /tmp/spinosa-launch.XXXXXX.sh)"
      printf '#!/bin/bash\ntrap '\''rm -f "$0"'\'' EXIT\ncd %s && hermes chat\n' \
        "$(printf '%q' "$root")" > "$_ltmp_hm"
      chmod +x "$_ltmp_hm"
      copy_to_clipboard "$prompt"
      _launch_in_terminal "$_ltmp_hm"
      ok "Opened Hermes in this workspace; startup prompt copied to clipboard."
      ;;
	    kilo)
	      command -v kilo >/dev/null 2>&1 || { warn "kilo was not found on PATH."; return 1; }
	      local _ptmp_kl _ltmp_kl
	      _ptmp_kl="$(mktemp /tmp/spinosa-prompt.XXXXXX)"
	      printf '%s' "$prompt" > "$_ptmp_kl"
	      _ltmp_kl="$(mktemp /tmp/spinosa-launch.XXXXXX.sh)"
	      printf '#!/bin/bash\n_prompt=%s\ntrap '\''rm -f "$0" "$_prompt"'\'' EXIT\ncd %s && kilo "$(cat "$_prompt")"\n' \
	        "$(printf '%q' "$_ptmp_kl")" "$(printf '%q' "$root")" > "$_ltmp_kl"
      chmod +x "$_ltmp_kl"
      _launch_in_terminal "$_ltmp_kl"
      ok "Opened Kilo in a new terminal."
      ;;
    *)
      warn "Run-now is only available for known CLI choices."
      return 1
      ;;
  esac
}


handoff_selected_cli() {
  local root="$1" cli="$2" cli_label="$3" prompt="$4" launch_command="$5"
  if [[ "$cli" == "other" ]]; then
    tree_sep
    copy_to_clipboard "$launch_command" && tree_row "Launch command" "copied to clipboard" || print_box "Terminal Launch Command — full text" <<< "$launch_command"
    handoff_result="launch_command_copied"
    return 0
  fi

  if run_cli_with_prompt "$root" "$cli" "$prompt"; then
    handoff_result="selected_cli_opened"
    return 0
  fi

  warn "Could not open ${cli_label}. Copying the launch command instead."
  tree_sep
  copy_to_clipboard "$launch_command" && tree_row "Launch command" "copied to clipboard" || print_box "Terminal Launch Command — full text" <<< "$launch_command"
  handoff_result="run_failed_command_copied"
}


detect_llm_clis() {
  local clis
  clis=()
  command -v claude >/dev/null 2>&1 && clis+=("Claude Code")
  command -v codex >/dev/null 2>&1 && clis+=("Codex")
  command -v gemini >/dev/null 2>&1 && clis+=("Gemini")
  command -v opencode >/dev/null 2>&1 && clis+=("OpenCode")
  command -v hermes >/dev/null 2>&1 && clis+=("Hermes Agent")
  command -v qwen >/dev/null 2>&1 && clis+=("Qwen")
  command -v kilo >/dev/null 2>&1 && clis+=("Kilo")
  if [[ ${#clis[@]} -eq 0 ]]; then
    clis+=("Other (manual)")
  fi
  printf '%s\n' "${clis[@]}"
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: uninstall
# ═══════════════════════════════════════════════════════════════════════════
