---
name: bot-push
description: Push branches and open PRs on GPropersi/chore-reaper as the c4i-claude-bot[bot] GitHub App identity instead of the user's personal account — commits and PRs must show up bot-authored only, no human or Co-Authored-By attribution. Use automatically whenever the user asks to push, commit-and-push, open/create a PR, or merge in this repo — they've said this should be the standing default, not something they need to ask for each time.
---

# bot-push

This repo has a dedicated GitHub App (`c4i-claude-bot`, App ID `4229755`, installed only on this repo,
isolated from any other project's bot) so commits and PRs can be attributed to the bot instead of the
user's personal GitHub account. **Standing instruction (given 2026-07-06): every push and PR on this
repo goes through this flow by default — don't ask first, just use it**, the same way you'd default to
`npm run lint` without being asked each time.

Scripts already in the repo (don't recreate them):
- `.claude/scripts/generate-gh-token.sh` — mints a short-lived (1hr) installation token
- `.claude/scripts/gh-app-push.sh <branch>` — pushes a branch as the bot (refuses `main`/`master` and
  refuses anything that looks like a force flag in the branch-name argument)
- `.claude/scripts/gh-app-force-push.sh <branch>` — force-push escape hatch (refuses `main`/`master`)
- `.claude/scripts/gh-app-pr-create.sh <branch> <title>` — opens a PR as the bot; body read from stdin
- `.claude/scripts/gh-app-pr-verify.sh <pr-number>` — prints PR + commit authorship for verification
- `.claude/scripts/gh-app-askpass.sh` — `GIT_ASKPASS` helper so the token never appears in anything git
  prints (push progress, the upstream-tracking message, `git remote -v`)

All four `gh-app-*.sh` scripts are allow-listed as single Bash prefixes, so use them instead of
assembling `unset GH_TOKEN; APP_TOKEN=$(...)` inline — an inline compound command doesn't match a
fixed allow-list prefix and re-prompts for approval every time.

Bot identity for git authorship: name `c4i-claude-bot[bot]`, email
`300508129+c4i-claude-bot[bot]@users.noreply.github.com` (GitHub's standard bot noreply format — user ID
looked up via `curl -s "https://api.github.com/users/c4i-claude-bot%5Bbot%5D"`, shouldn't change, but
re-check if this stops matching).

## Commit authorship — the part that's easy to get wrong

**Author every commit on this repo as the bot directly, and do NOT append this harness's usual
`Co-Authored-By: Claude ...` / `Claude-Session: ...` trailer.** That trailer is what caused GitHub to
list a second "claude" co-author on the commit the first time this was set up — the user explicitly
wants bot-only attribution, no human, no separate AI co-author line.

```bash
git commit --author="c4i-claude-bot[bot] <300508129+c4i-claude-bot[bot]@users.noreply.github.com>" -m "..."
```

This only sets the *author*; the *committer* field still defaults to whatever `git config user.*` is —
that's fine, GitHub's UI/API attribution (and what shows up in `gh pr view --json commits`) keys off the
author email, which is what matters here.

**If commits already exist with the wrong authorship** (e.g. made before this skill was invoked, or by
a different flow that didn't know to use `--author`) — don't leave it and just push anyway. Rewrite them
first, since nothing has been merged/relied on yet if the branch hasn't been merged to `main`:

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '
export GIT_AUTHOR_NAME="c4i-claude-bot[bot]"
export GIT_AUTHOR_EMAIL="300508129+c4i-claude-bot[bot]@users.noreply.github.com"
export GIT_COMMITTER_NAME="c4i-claude-bot[bot]"
export GIT_COMMITTER_EMAIL="300508129+c4i-claude-bot[bot]@users.noreply.github.com"
' main..HEAD
git update-ref -d refs/original/refs/heads/$(git branch --show-current) 2>/dev/null
```

If any of those commits also carry the `Co-Authored-By: Claude` / `Claude-Session:` trailer, strip it in
the same pass with `--msg-filter` instead of `--env-filter`:

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter \
  "sed -e '/^Co-Authored-By: Claude/d' -e '/^Claude-Session:/d'" main..HEAD
git update-ref -d refs/original/refs/heads/$(git branch --show-current) 2>/dev/null
```
(Don't combine `--env-filter` and `--msg-filter` in one invocation if you need both — run one pass for
each; `filter-branch` handles that fine since each pass just rewrites what the prior pass produced.)

Do NOT use `git rebase -i` for this (interactive rebase requires input this environment can't provide,
and is against standing tool-use rules) — `filter-branch` is the non-interactive equivalent for
rewriting a range of unpublished commits.

## Pushing

```bash
.claude/scripts/gh-app-push.sh <branch-name>   # never main/master; the script itself refuses those
```

If the branch was already pushed once and you then rewrote its history (e.g. to fix authorship per
above), a plain push will be rejected — force-push is warranted here specifically because it's your own
branch, pushed by you moments earlier, nothing else could have landed on it in between:

```bash
.claude/scripts/gh-app-force-push.sh <branch-name>   # never main/master; the script itself refuses those
```

## Opening the PR

`gh pr create` needs `GH_TOKEN` set to a bot token (not your own `gh auth` session) so the PR itself is
authored by the App, and needs `--head` explicitly — upstream tracking often fails to persist here
(sandboxed `.git/config` writes are frequently blocked; `gh-app-push.sh` warns about this when it
happens), so don't rely on a plain `gh pr create` picking up the branch automatically:

```bash
.claude/scripts/gh-app-pr-create.sh <branch-name> "<title>" <<'EOF'
<body>
EOF
```

## Verify before reporting success

Don't just trust the push/create commands returned 0 — confirm both the PR and every commit on it show
bot-only attribution, since a leftover trailer or a commit made before switching to `--author` is easy to
miss otherwise:

```bash
.claude/scripts/gh-app-pr-verify.sh <number>
```
Expect `author: "app/c4i-claude-bot"` and `commitAuthors: ["c4i-claude-bot[bot]"]` — nothing else. If a
second login shows up (e.g. `"claude"` from a leftover trailer, or the human's own login from an
un-rewritten commit), go back and fix authorship/trailers before telling the user it's done.

## Guardrails (enforced by the scripts themselves)

- Never push directly to `main`/`master` through this flow — feature branches + PR only. All four
  `gh-app-*.sh` scripts refuse a `main`/`master` target.
- Never pass `--force`/`-f` through `gh-app-push.sh`'s branch-name argument (it explicitly rejects
  anything force-flag-shaped) — `gh-app-force-push.sh` is the deliberate escape hatch, used only for a
  branch you and only you pushed moments earlier.
- The token is short-lived (1hr) — each script regenerates a fresh one per invocation rather than
  reusing a captured value across a long gap.
- Don't assemble `unset GH_TOKEN; APP_TOKEN=$(...)` inline — always go through one of the
  `gh-app-*.sh` scripts so the command stays a single allow-listable prefix.
