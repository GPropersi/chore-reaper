#!/bin/bash
# PreToolUse hook for the Bash tool: auto-denies `rm` commands whose arguments contain shell glob
# metacharacters (*, ?, [...]).
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
# Reads the PreToolUse hook JSON payload on stdin. Commands without an `rm` + glob-character
# combination pass through silently (exit 0, no output).

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

if [ -z "$cmd" ]; then
  exit 0
fi

has_rm=no
if printf '%s' "$cmd" | grep -qE '(^|[;&]|\|\||[[:cntrl:]])[[:space:]]*rm([[:space:]]|$)'; then
  has_rm=yes
fi

has_glob=no
if printf '%s' "$cmd" | grep -qE '[*?]|\[[^]]*\]'; then
  has_glob=yes
fi

if [ "$has_rm" = "yes" ] && [ "$has_glob" = "yes" ]; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"This command uses a glob pattern (*, ?, or [...]) in an rm argument, which Claude Code always requires manual approval for (\"Glob patterns are not allowed in write operations\") and can't be allow-listed. Rewrite with exact literal paths instead -- either list each file explicitly (rm -f a.txt b.txt c.txt), or better, stop generating incrementally-suffixed filenames in the first place: reuse one static filename per purpose (output redirection overwrites by default), so cleanup never needs a wildcard at all."}}
JSON
fi
