#!/bin/bash
# gh-app-pr-create.sh — open a PR on GPropersi/chore-reaper authored by c4i-claude-bot[bot].
#
# gh pr create needs GH_TOKEN set to a bot token (not the user's own `gh auth` session) so the
# PR itself is authored by the App. --head is explicit because upstream tracking often fails to
# persist in a sandboxed environment (gh-app-push.sh warns about this when it happens), so a
# plain `gh pr create` can't reliably infer the branch.
#
# Usage:
#   .claude/scripts/gh-app-pr-create.sh <branch-name> <title>   # body read from stdin
#
# Example:
#   .claude/scripts/gh-app-pr-create.sh my-branch "My PR title" <<'EOF'
#   ## Summary
#   - ...
#   EOF
#
# Exit codes:
#   0  PR created.
#   2  Bad arguments.
#   3  Refused: head is main/master.
#   4  Token generator missing or not executable.
#   5  Token generator returned an invalid value.
#   other  gh pr create failed (its own exit code is propagated).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_GENERATOR="$SCRIPT_DIR/generate-gh-token.sh"

if [ $# -ne 2 ]; then
  echo "Error: exactly two arguments required. Usage: $0 <branch-name> <title>  (body read from stdin)" >&2
  exit 2
fi

BRANCH="$1"
TITLE="$2"

case "$BRANCH" in
  main|master)
    echo "Error: refusing to open a PR with head '$BRANCH'." >&2
    exit 3
    ;;
esac

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

GH_TOKEN="$APP_TOKEN" gh pr create --repo GPropersi/chore-reaper \
  --head "$BRANCH" --base main --title "$TITLE" --body-file -
