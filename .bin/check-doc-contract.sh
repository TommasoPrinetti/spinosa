#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

targets=(
  "$ROOT/README.md"
  "$ROOT/docs/FAQ.md"
  "$ROOT/docs/GLOSSARY.md"
  "$ROOT/docs/reference/agents.md"
)

patterns=(
  "evidence answer"
  "structured comparison"
  "Searcher \\+ Analyst"
  "run at the same time \\(parallel\\)"
  "Alongside Searcher"
  "classify -> searcher \\+ analyst"
)

failures=0

for file in "${targets[@]}"; do
  for pattern in "${patterns[@]}"; do
    if command -v rg >/dev/null 2>&1; then
      if rg -n --pcre2 "$pattern" "$file" >/dev/null 2>&1; then
        echo "FAIL: $file still matches pattern: $pattern"
        rg -n --pcre2 "$pattern" "$file" || true
        failures=$((failures + 1))
      fi
    else
      # Fallback to grep -E (less precise but avoids hard dep)
      if grep -E -n "$pattern" "$file" >/dev/null 2>&1; then
        echo "FAIL: $file still matches pattern: $pattern (grep fallback)"
        grep -E -n "$pattern" "$file" || true
        failures=$((failures + 1))
      fi
    fi
  done
done

if [[ $failures -gt 0 ]]; then
  echo "Doc contract check failed with $failures match(es)."
  exit 1
fi

echo "Doc contract check passed."
