#!/bin/bash
# PreToolUse hook for the Bash tool: auto-denies compound commands that combine `cd` with
# output redirection.
#
# Claude Code's own permission system already gates this shape behind a mandatory manual
# approval prompt ("Compound command contains cd with output redirection - manual approval
# required to prevent path resolution bypass") -- an allow-rule like Bash(cd /safe/dir && *)
# could otherwise be tricked into redirecting somewhere unintended once inside that subshell.
# That gate can't be suppressed via permissions.allow by design.
#
# This hook turns the manual click into an automatic deny-and-rewrite instead: it denies the
# tool call before the prompt ever reaches the user, with a reason telling the agent how to
# restructure. The agent then resubmits without the risky shape, which either matches an
# existing allow rule or triggers only an ordinary one-time prompt.
#
# Reads the PreToolUse hook JSON payload on stdin. Any command that doesn't match both
# conditions passes through silently (exit 0, no output).

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

if [ -z "$cmd" ]; then
  exit 0
fi

has_cd=no
if printf '%s' "$cmd" | grep -qE '(^|[;&]|\|\|)[[:space:]]*cd([[:space:]]|$)'; then
  has_cd=yes
fi

has_redirect=no
if printf '%s' "$cmd" | grep -qE '(>>|>|2>&1|&>|1>&2)'; then
  has_redirect=yes
fi

if [ "$has_cd" = "yes" ] && [ "$has_redirect" = "yes" ]; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"This command combines cd with output redirection, which always requires manual approval (prevents allow-rules from being bypassed via a directory change). Rewrite: drop the cd if the working directory is already correct (it persists across Bash calls in this session), or split into two calls -- cd alone with no redirection, then the redirecting command as a second call."}}
JSON
fi
