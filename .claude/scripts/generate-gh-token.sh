#!/bin/bash
# Retired the isolated `chore-reaper-claude` App: this repo now authenticates as
# the SHARED consolidated `gpropersi-claude` GitHub App (one App across all of
# GPropersi's repos), scoped here to chore-reaper's installation.
#
# This is a thin delegate to the single shared generator so the repo-local bot
# toolkit (gh-app-pr-create.sh, gh-app-issue-create.sh, gh-app-push.sh, …) keeps
# working unchanged — it still calls `.claude/scripts/generate-gh-token.sh` and
# still gets a valid `ghs_` installation token, just minted from the shared App.
# GH_APP_REPO pins the resolution to this repo regardless of the caller's CWD.
# Tokens expire after 1 hour. The private key lives at ~/.claude/, outside the repo.
exec env GH_APP_REPO="GPropersi/chore-reaper" "$HOME/.claude/generate-gh-token.sh"
