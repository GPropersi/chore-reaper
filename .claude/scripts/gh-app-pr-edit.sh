#!/bin/bash
# gh-app-pr-edit.sh — edit a PR's body on GPropersi/chore-reaper as c4i-claude-bot[bot].
#
# gh pr edit needs GH_TOKEN set to a bot token (not the user's own `gh auth` session) so the
# edit is attributed to the App, matching how the PR itself was opened.
#
# Usage:
#   .claude/scripts/gh-app-pr-edit.sh <pr-number>   # new body read from stdin
#
# Example:
#   .claude/scripts/gh-app-pr-edit.sh 4 <<'EOF'
#   ## Summary
#   - ...
#   EOF
#
# Exit codes:
#   0  PR edited.
#   2  Bad arguments.
#   4  Token generator missing or not executable.
#   5  Token generator returned an invalid value.
#   other  gh pr edit failed (its own exit code is propagated).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_GENERATOR="$SCRIPT_DIR/generate-gh-token.sh"

if [ $# -ne 1 ]; then
  echo "Error: exactly one argument required. Usage: $0 <pr-number>  (new body read from stdin)" >&2
  exit 2
fi

PR_NUMBER="$1"

if [ ! -x "$TOKEN_GENERATOR" ]; then
  echo "Error: token generator not found or not executable: $TOKEN_GENERATOR" >&2
  exit 4
fi

unset GH_TOKEN

APP_TOKEN=$("$TOKEN_GENERATOR")

if [ -z "$APP_TOKEN" ] || [ "${APP_TOKEN:0:4}" != "ghs_" ]; then
  echo "Error: token generator did not return a valid installation token (expected 'ghs_' prefix)." >&2
  exit 5
fi

GH_TOKEN="$APP_TOKEN" gh pr edit "$PR_NUMBER" --repo GPropersi/chore-reaper --body-file -
