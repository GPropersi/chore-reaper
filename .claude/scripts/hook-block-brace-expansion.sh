#!/bin/bash
# PreToolUse hook for the Bash tool: auto-denies commands containing a `{` character alongside
# `,` or `..` anywhere in the command.
#
# Confirmed (2026-07-09): Claude Code flags this as "Brace expansion (unquoted `{` in
# concatenation with `,`/`..`)". Real trigger seen: git's `@{u}` upstream-ref shorthand followed
# by a `..` range (e.g. `git log --oneline @{u}..`) -- the analyzer can't tell that apart from
# real bash brace expansion (`{1..30}`, `{a,b,c}`), which genuinely can expand to an unpredictable
# number of arguments. Same family as the other gates here: no "don't ask again", can't be
# pre-approved.
#
# Fix: for git's @{u} shorthand, reference the actual branch name instead (`git rev-parse
# --abbrev-ref --symbolic-full-name @{u}` has the same problem -- instead use `git status -sb`,
# or read the upstream name from `git branch -vv` / `git for-each-ref`, or just spell out the
# literal remote branch name, e.g. `origin/main`). For brace-expansion loops/lists, spell out the
# literal values instead of `{1..30}` or `{a,b,c}` -- e.g. `for i in 1 2 3 ... 30`.
#
# Reads the PreToolUse hook JSON payload on stdin. Commands without both a `{` and a `,`/`..`
# pass through silently (exit 0, no output).

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

if [ -z "$cmd" ]; then
  exit 0
fi

has_brace=no
if printf '%s' "$cmd" | grep -q '{'; then
  has_brace=yes
fi

has_trigger=no
if printf '%s' "$cmd" | grep -qE '\.\.|,'; then
  has_trigger=yes
fi

if [ "$has_brace" = "yes" ] && [ "$has_trigger" = "yes" ]; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"This command contains a { character alongside , or .., which Claude Code always requires manual approval for (\"Brace expansion\") and can't be allow-listed -- this fires even for git's @{u} upstream-ref shorthand, which isn't real brace expansion but looks identical to the analyzer. Rewrite: for @{u}, use `git status -sb` or read the upstream name from `git branch -vv` instead, or reference the actual branch name literally (e.g. origin/main). For brace-expansion loops/lists, spell out the literal values instead of {1..30} or {a,b,c}."}}
JSON
fi
