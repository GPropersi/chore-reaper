#!/bin/bash
# PreToolUse hook for the Bash tool: auto-denies commands whose output-redirection TARGET
# contains a shell variable/expansion (e.g. `> /tmp/claude/run-$i.txt`, `>> $LOGFILE`).
#
# Confirmed (2026-07-09): Claude Code flags this as "Contains simple_expansion" -- the redirect
# destination isn't a literal, statically-known path, so the analyzer can't verify where output
# actually goes. Same family as the other unbypassable gates here: no "don't ask again" option,
# can never be pre-approved via permissions.allow.
#
# Typical trigger: a `for i in 1 2 3; do ... > out-$i.txt ...; done` loop used to run something
# N times with per-run output files. Fix: don't compute the filename from a variable -- either
# reuse one static filename across iterations (fine if only the last run's output matters), or
# unroll the loop into separate calls each with a literal, hardcoded suffix ("-1.txt", "-2.txt",
# "-3.txt" typed out, not computed).
#
# Reads the PreToolUse hook JSON payload on stdin. Commands without a variable-expansion inside a
# redirect target pass through silently (exit 0, no output).

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

if [ -z "$cmd" ]; then
  exit 0
fi

if printf '%s' "$cmd" | grep -qE '>{1,2}[[:space:]]*[^[:space:];&|]*\$'; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"This command's output-redirection target contains a shell variable/expansion (e.g. > out-$i.txt), which Claude Code always requires manual approval for (\"Contains simple_expansion\") and can't be allow-listed. Rewrite: use one static, literal filename instead of computing it from a variable -- either reuse the same fixed filename across loop iterations (fine if only the last run matters), or unroll the loop into separate calls, each with a literal hardcoded suffix typed out directly (\"-1.txt\", \"-2.txt\", ...) rather than a loop variable."}}
JSON
fi
