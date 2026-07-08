#!/bin/bash
# gh-app-force-push.sh — force-push a branch to GPropersi/chore-reaper as c4i-claude-bot[bot].
#
# Deliberate escape hatch for gh-app-push.sh's force-flag refusal: used only when a branch
# was already pushed once and then had its history rewritten (e.g. to fix commit authorship)
# moments earlier by the same actor, so nothing else could have landed on it in between.
#
# Same token-handling approach as gh-app-push.sh: fresh token stored in APP_TOKEN (never
# GH_TOKEN, so nothing in the environment can shadow it), handed to git via GIT_ASKPASS so it
# never appears in anything git prints.
#
# Usage:
#   .claude/scripts/gh-app-force-push.sh <branch-name>
#
# Exit codes:
#   0  Push succeeded.
#   2  Bad arguments.
#   3  Refused: target is main/master.
#   4  Token generator or askpass helper missing/not executable.
#   5  Token generator returned an invalid value.
#   other  git push failed (its own exit code is propagated).

set -euo pipefail

REPO_URL="https://github.com/GPropersi/chore-reaper.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_GENERATOR="$SCRIPT_DIR/generate-gh-token.sh"
ASKPASS_HELPER="$SCRIPT_DIR/gh-app-askpass.sh"

if [ $# -ne 1 ]; then
  echo "Error: exactly one argument required. Usage: $0 <branch-name>" >&2
  exit 2
fi

BRANCH="$1"

case "$BRANCH" in
  main|master)
    echo "Error: refusing to force-push to '$BRANCH'. Feature branches only." >&2
    exit 3
    ;;
esac

if [ ! -x "$TOKEN_GENERATOR" ]; then
  echo "Error: token generator not found or not executable: $TOKEN_GENERATOR" >&2
  exit 4
fi

if [ ! -x "$ASKPASS_HELPER" ]; then
  echo "Error: askpass helper not found or not executable: $ASKPASS_HELPER" >&2
  exit 4
fi

unset GH_TOKEN

APP_TOKEN=$("$TOKEN_GENERATOR")

if [ -z "$APP_TOKEN" ] || [ "${APP_TOKEN:0:4}" != "ghs_" ]; then
  echo "Error: token generator did not return a valid installation token (expected 'ghs_' prefix)." >&2
  exit 5
fi

echo "Force-pushing '$BRANCH' to $REPO_URL as c4i-claude-bot[bot]..."

export APP_TOKEN
GIT_ASKPASS="$ASKPASS_HELPER" GIT_TERMINAL_PROMPT=0 git \
  -c credential.helper= \
  push --force -u "$REPO_URL" \
  "$BRANCH"
unset APP_TOKEN

echo "Force-push complete: $BRANCH"
