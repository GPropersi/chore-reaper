#!/bin/bash
# PreToolUse hook for the Bash tool: auto-ALLOWS commands built entirely out of a small, curated
# whitelist of side-effect-free / read-only sub-commands, joined only by ';', '|', or newlines.
#
# This exists because ordinary (non-hard-gated) commands using a shape nothing in
# permissions.allow covers still trigger a manual prompt every time -- e.g. piping a `printf`
# into one of this project's own diagnostic hook-*.sh scripts. Rather than accumulating one-off
# literal allow-rules forever, this hook classifies deterministically (no LLM, no judgment call):
# every segment must match an exact, explicit prefix in is_safe_segment() below.
#
# Deliberately fails closed (exit 0, no output -> falls through to the normal permission flow,
# i.e. no behavior change) the instant it sees ANYTHING it doesn't explicitly reason about:
# command substitution, backticks, redirection, subshells, backgrounding, or the OR operator
# '||'. It never tries to parse those -- if in doubt, it does nothing, and the existing
# allow-list / other hooks / manual prompt behave exactly as before.
#
# Note: `git` is intentionally NOT allowed as a bare wildcard -- only specific read-only
# subcommands are listed (status/log/branch --show-current/diff/show/rev-parse/check-ignore/
# remote -v/config --get). Mutating subcommands (push, commit, checkout, reset, branch -D, ...)
# are never matched here regardless of how this list is edited in the future, by design: keep
# each git entry an exact subcommand match, never a bare "git " prefix.
#
# Reads the PreToolUse hook JSON payload on stdin.

set -euo pipefail

is_safe_segment() {
  local seg="$1"
  case "$seg" in
    printf\ *|echo|echo\ *|cat\ *|tail\ *|head\ *|pwd|pwd\ *|ls|ls\ *|wc\ *|sort\ *|jq\ *|\
    ps|ps\ *|lsof|lsof\ *|du\ *|df\ *|which\ *|grep\ *|\
    .claude/scripts/hook-block-cd-compound.sh|.claude/scripts/hook-block-cmdsub.sh|.claude/scripts/hook-allow-safe-readonly.sh|\
    git\ status|git\ status\ *|git\ log|git\ log\ *|git\ branch\ --show-current|git\ diff|git\ diff\ *|\
    git\ show|git\ show\ *|git\ rev-parse|git\ rev-parse\ *|git\ check-ignore\ *|git\ remote\ -v|git\ config\ --get\ *)
      return 0 ;;
    *)
      return 1 ;;
  esac
}

cmd=$(jq -r '.tool_input.command // empty')

if [ -z "$cmd" ]; then
  exit 0
fi

# Fail closed on anything this classifier doesn't explicitly reason about.
if printf '%s' "$cmd" | grep -qE '\$\(|`|>|<|&|\(|\)|\|\|'; then
  exit 0
fi

normalized=$(printf '%s' "$cmd" | tr '\n;' '||')
IFS='|' read -ra segments <<< "$normalized"

if [ "${#segments[@]}" -eq 0 ]; then
  exit 0
fi

for seg in "${segments[@]}"; do
  trimmed="$(printf '%s' "$seg" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [ -z "$trimmed" ]; then
    continue
  fi
  if ! is_safe_segment "$trimmed"; then
    exit 0
  fi
done

cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Every segment of this command matches the curated whitelist of side-effect-free, read-only commands in hook-allow-safe-readonly.sh."}}
JSON
