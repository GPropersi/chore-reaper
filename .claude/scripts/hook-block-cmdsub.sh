#!/bin/bash
# PreToolUse hook for the Bash tool: auto-denies any command containing command substitution
# ($(...) or `backticks`).
#
# Claude Code's own permission system flags this shape as "Contains shell syntax (string) that
# cannot be statically analyzed" and forces a mandatory manual approval -- confirmed (2026-07-09)
# that this gate can NEVER be pre-approved via permissions.allow, regardless of how safe the
# inner command is, and that a PreToolUse hook cannot override it to auto-allow either. The only
# lever available is turning the manual click into an automatic deny, same as
# hook-block-cd-redirect.sh already does for the narrower cd+redirect case.
#
# This hook denies the tool call before the prompt ever reaches the user, telling the agent to
# rewrite the command: run the value-producing command alone first (a plain command has no such
# gate), read its plain-text output, then splice that literal value into a second call instead of
# inlining a substitution. Verified (2026-07-09, run-dev skill) that even a "genuinely dynamic"
# case -- killing a whole process tree -- has a substitution-free equivalent (read the PID, read
# its process-group ID via a plain `ps -o pgid=` call, kill the group) once you stop assuming the
# work has to happen in one shell invocation.
#
# Reads the PreToolUse hook JSON payload on stdin. Commands without $(...) or backticks pass
# through silently (exit 0, no output).

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

if [ -z "$cmd" ]; then
  exit 0
fi

if printf '%s' "$cmd" | grep -qE '\$\(|`'; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"This command contains command substitution ($(...) or backticks). Claude Code always requires manual approval for this shape and it can never be allow-listed -- the static analyzer treats it as unverifiable no matter how safe the inner command is. Rewrite as two or more plain calls instead: run the inner/value-producing command alone first, read its plain-text output, then splice that literal value into the next call. This works even for tree/recursive operations -- e.g. instead of a pgrep-recursive kill_tree, read a PID, run `ps -o pgid= -p <PID>` as its own call, then `kill -TERM -- -<PGID>` on the literal group id."}}
JSON
fi
