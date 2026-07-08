#!/bin/bash
# gh-app-pr-verify.sh — confirm a PR and every commit on it show bot-only attribution.
#
# A leftover Co-Authored-By trailer or a commit made before switching to --author is easy to
# miss, so this is run before reporting a push/PR as done rather than trusting exit codes alone.
#
# Usage:
#   .claude/scripts/gh-app-pr-verify.sh <pr-number>
#
# Expected output: author "app/c4i-claude-bot" and commitAuthors ["c4i-claude-bot[bot]"] only.
# If a second login shows up (e.g. "claude" from a leftover trailer, or a human login from an
# un-rewritten commit), fix authorship/trailers before reporting success.
#
# Exit codes:
#   0  Verification query ran (inspect its output — this does not itself assert correctness).
#   2  Bad arguments.
#   4  Token generator missing or not executable.
#   5  Token generator returned an invalid value.
#   other  gh pr view failed (its own exit code is propagated).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_GENERATOR="$SCRIPT_DIR/generate-gh-token.sh"

if [ $# -ne 1 ]; then
  echo "Error: exactly one argument required. Usage: $0 <pr-number>" >&2
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

GH_TOKEN="$APP_TOKEN" gh pr view "$PR_NUMBER" --repo GPropersi/chore-reaper \
  --json author,commits --jq '{author: .author.login, commitAuthors: [.commits[].authors[].login] | unique}'
