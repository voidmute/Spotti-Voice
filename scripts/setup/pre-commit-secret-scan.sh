#!/usr/bin/env bash
# Pre-commit hook: block staged files that likely contain secrets.
# Install: cp scripts/setup/pre-commit-secret-scan.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

STAGED="$(git diff --cached --name-only --diff-filter=ACM || true)"
if [[ -z "$STAGED" ]]; then
  exit 0
fi

should_skip() {
  local file="$1"
  case "$file" in
    .env.example|scripts/setup/env.example|*/test_redact.py|spotti/security/redact.py|spotti/mcp/redact.py)
      return 0
      ;;
    */package-lock.json|skills-lock.json)
      return 0
      ;;
    scripts/deploy/check-secret-len.py|scripts/deploy/merge-admin-env.sh)
      return 0
      ;;
  esac
  return 1
}

is_forbidden_env_file() {
  local file="$1"
  if [[ "$file" == ".env.example" || "$file" == "scripts/setup/env.example" ]]; then
    return 1
  fi
  if [[ "$file" == ".env" || "$file" == .env.* ]]; then
    return 0
  fi
  if [[ "$file" == *.snippet || "$file" == *env*.snippet ]]; then
    return 0
  fi
  if [[ "$file" == *".env.bak."* ]]; then
    return 0
  fi
  return 1
}

FAIL=0

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if should_skip "$file"; then
    continue
  fi
  if is_forbidden_env_file "$file"; then
    echo "pre-commit: blocked - do not commit env/snippet file: $file" >&2
    FAIL=1
    continue
  fi
  if [[ ! -f "$file" ]]; then
    continue
  fi

  # OpenAI-style keys only (avoid false positives like gfm-task-list-item in lockfiles)
  if grep -qE 'sk-[a-zA-Z0-9]{20,}' "$file" 2>/dev/null; then
    echo "pre-commit: blocked - likely API key in $file (sk-...)" >&2
    FAIL=1
  fi

  if grep -qE '(API_KEY|SECRET|TOKEN|PASSWORD)[[:space:]]*=[[:space:]]*[^[:space:]#]+' "$file" 2>/dev/null; then
    if ! grep -qE '(your_|YOUR_|example|placeholder|\*\*\*)' "$file" 2>/dev/null; then
      echo "pre-commit: blocked - secret-like KEY= value in $file" >&2
      FAIL=1
    fi
  fi

  if grep -qE 'postgresql://[^:]+:[^@]+@' "$file" 2>/dev/null; then
    if ! grep -qE 'YOUR_PASSWORD|\*\*\*|example' "$file" 2>/dev/null; then
      echo "pre-commit: blocked - Postgres URL with password in $file" >&2
      FAIL=1
    fi
  fi
done <<< "$STAGED"

if [[ "$FAIL" -ne 0 ]]; then
  echo "pre-commit: remove secrets before committing. See .cursor/rules/do-not-read-env.mdc" >&2
  exit 1
fi

exit 0
