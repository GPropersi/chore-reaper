#!/bin/bash
# PreToolUse hook for the Bash tool: auto-denies ANY compound command where `cd` appears together
# with at least one other sub-command.
#
# Claude Code has multiple built-in gates for this general shape -- confirmed distinct wordings
# seen in this repo on 2026-07-09: "cd with output redirection", "cd with write operation", and
# "changes directory before running git" -- none of which can be pre-approved via
# permissions.allow, and none of which offer a "don't ask again" option. Rather than special-
# casing each variant as it's discovered (this replaces the narrower hook-block-cd-redirect.sh
# and hook-block-cd-git.sh, which each only covered one), this hook denies the general shape
# outright: cd combined with anything else, unconditionally. It is a strict superset of what the
# two hooks it replaces covered.
#
# In this repo the Bash tool's cwd already persists at the project root across calls in a
# session, so a leading `cd <path> && ...` / `cd <path>; ...` is almost always redundant --
# dropping it removes the trigger entirely. A bare `cd <path>` with nothing else in the same
# command is NOT flagged (no reason to deny that). If you genuinely need to target a different
# directory for one operation: `git -C <dir> <command>` for git, absolute paths for everything
# else, or a standalone `cd <dir>` call by itself.
#
# Reads the PreToolUse hook JSON payload on stdin.

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

if [ -z "$cmd" ]; then
  exit 0
fi

has_cd=no
if printf '%s' "$cmd" | grep -qE '(^|[;&]|\|\||[[:cntrl:]])[[:space:]]*cd([[:space:]]|$)'; then
  has_cd=yes
fi

if [ "$has_cd" = "no" ]; then
  exit 0
fi

cmd_trimmed="$(printf '%s' "$cmd" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
is_bare_cd=no
if printf '%s' "$cmd_trimmed" | grep -qE '^cd([[:space:]][^;&|]*)?$'; then
  is_bare_cd=yes
fi

if [ "$is_bare_cd" = "yes" ]; then
  exit 0
fi

cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"This command combines cd with at least one other operation, which Claude Code always requires manual approval for in one form or another (output redirection, write operations, running git -- the exact wording varies but none of these gates can be pre-approved). Rewrite: drop the cd entirely -- the Bash tool's cwd persists across calls in this session, so you're almost certainly already in the right directory. If you genuinely need a different directory for one command: use `git -C <dir> <command>` for git, absolute paths for file operations, or issue a standalone `cd <dir>` as its own call with nothing else in it (that alone is never flagged)."}}
JSON
