#!/bin/bash
# PreToolUse hook for the Bash tool: auto-denies `rm` invocations whose OWN arguments contain
# shell glob metacharacters (*, ?, [...]).
#
# Confirmed (2026-07-09): Claude Code flags this as "Glob patterns are not allowed in write
# operations. Please specify an exact file path." Unlike the other gates in this directory, this
# one IS arguably a good guardrail on its own merits (a glob can match more than intended), not
# just an overzealous static-analysis false positive -- so the fix here is not "grant broad
# glob-delete access," it's "stop needing globs to clean up test-output files in the first
# place." That usually traces back to inventing a fresh incrementally-suffixed filename per test
# run (mockapi-1.txt, mockapi-2.txt, ...) -- reuse one static filename per purpose instead
# (redirection overwrites by default), and cleanup never needs a wildcard.
#
# Scoped per-segment (not whole-command): normalizes all common shell boundaries (;, &, &&, |,
# ||, newline) to newlines, then only checks glob characters within segments that actually START
# with `rm`. An earlier version checked the whole command string, which false-triggered on any rm
# invocation sharing a compound command with an unrelated * elsewhere (e.g. describing another
# command's output in an echo on a different line).
#
# Reads the PreToolUse hook JSON payload on stdin. Commands without an `rm` segment containing a
# glob character pass through silently (exit 0, no output).

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

if [ -z "$cmd" ]; then
  exit 0
fi

normalized="$(printf '%s' "$cmd" | sed -E 's/(&&|\|\||[;&|])/\n/g')"

while IFS= read -r seg; do
  trimmed="$(printf '%s' "$seg" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [ -z "$trimmed" ]; then
    continue
  fi
  if printf '%s' "$trimmed" | grep -qE '^rm([[:space:]]|$)'; then
    if printf '%s' "$trimmed" | grep -qE '[*?]|\[[^]]*\]'; then
      cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"This command uses a glob pattern (*, ?, or [...]) in an rm argument, which Claude Code always requires manual approval for (\"Glob patterns are not allowed in write operations\") and can't be allow-listed. Rewrite with exact literal paths instead -- either list each file explicitly (rm -f a.txt b.txt c.txt), or better, stop generating incrementally-suffixed filenames in the first place: reuse one static filename per purpose (output redirection overwrites by default), so cleanup never needs a wildcard at all."}}
JSON
      exit 0
    fi
  fi
done <<< "$normalized"
