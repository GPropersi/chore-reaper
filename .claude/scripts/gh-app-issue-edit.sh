#!/bin/bash
# gh-app-issue-edit.sh — edit an issue on GPropersi/chore-reaper as c4i-claude-bot[bot].
#
# Usage:
#   .claude/scripts/gh-app-issue-edit.sh <issue-number>   # new body read from stdin
#
# Exit codes:
#   0  Issue edited.
#   2  Bad arguments.
#   4  Token generator missing or not executable.
#   5  Token generator returned an invalid value.
#   other  gh issue edit failed (its own exit code is propagated).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_GENERATOR="$SCRIPT_DIR/generate-gh-token.sh"

if [ $# -ne 1 ]; then
  echo "Error: exactly one argument required. Usage: $0 <issue-number>  (body read from stdin)" >&2
  exit 2
fi

ISSUE_NUMBER="$1"

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

GH_TOKEN="$APP_TOKEN" gh issue edit "$ISSUE_NUMBER" --repo GPropersi/chore-reaper \
  --body-file -
