#!/bin/bash
# Invoked by git via GIT_ASKPASS (set by gh-app-push.sh) whenever it needs a
# credential for an HTTPS remote. Reads the token from the APP_TOKEN
# environment variable rather than a URL or argv, so the token never appears
# in anything git prints (push progress, upstream-tracking messages,
# `git remote -v`, etc.) or in shell history.
case "$1" in
  Username*) echo "x-access-token" ;;
  *) echo "$APP_TOKEN" ;;
esac
