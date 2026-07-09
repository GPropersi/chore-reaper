#!/bin/bash
# PreToolUse hook for the Bash tool: auto-denies commands that `cd` into a directory before
# running `git`, mirroring Claude Code's own built-in gate ("This command changes directory
# before running git, which can execute untrusted hooks from the target directory. Approve only
# if you trust it.") -- which, like the cd+redirect and command-substitution gates, offers no
# "don't ask again" option and can't be pre-approved via permissions.allow.
#
# In this repo the Bash tool's cwd already persists at the project root across calls in a
# session, so a leading `cd <path> && git ...` is almost always redundant -- dropping it removes
# the trigger entirely. When the target genuinely is a different directory, `git -C <dir>
# <command>` is the substitution-free replacement: it doesn't change the shell's own directory (so
# the "could run untrusted hooks after cd" risk this gate exists for doesn't apply the same way),
# and Claude Code's analyzer can see straight through to the real git invocation.
#
# Reads the PreToolUse hook JSON payload on stdin. Commands without a cd-before-git shape pass
# through silently (exit 0, no output).

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

if [ -z "$cmd" ]; then
  exit 0
fi

cd_offset=$(printf '%s' "$cmd" | grep -aobE '(^|[;&]|\|\||[[:cntrl:]])[[:space:]]*cd([[:space:]]|$)' | head -1 | cut -d: -f1 || true)
git_offset=$(printf '%s' "$cmd" | grep -aobE '(^|[;&]|\|\||[[:cntrl:]])[[:space:]]*git([[:space:]]|$)' | head -1 | cut -d: -f1 || true)

if [ -n "$cd_offset" ] && [ -n "$git_offset" ] && [ "$cd_offset" -lt "$git_offset" ]; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"This command cd's into a directory before running git, which Claude Code always requires manual approval for (untrusted-hooks risk) and can't be allow-listed. Rewrite: drop the cd entirely if you're already at the right directory (the Bash tool's cwd persists across calls in this session), or use `git -C <dir> <command>` instead of `cd <dir> && git <command>` when you genuinely need to target a different directory."}}
JSON
fi
