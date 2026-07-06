#!/bin/bash
# Generates a short-lived GitHub App installation token for gh CLI / git push,
# scoped to the chore-reaper-claude App (isolated from any other project's bot).
# Tokens expire after 1 hour.

APP_ID="4229755"
INSTALL_ID="144776711"
PEM_FILE="$HOME/.claude/chore-reaper-app.pem"

# Generate JWT
NOW=$(date +%s)
IAT=$((NOW - 60))
EXP=$((NOW + 600))

HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
PAYLOAD=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' "$IAT" "$EXP" "$APP_ID" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
SIGNATURE=$(printf '%s.%s' "$HEADER" "$PAYLOAD" | openssl dgst -sha256 -sign "$PEM_FILE" -binary | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
JWT="${HEADER}.${PAYLOAD}.${SIGNATURE}"

# Exchange JWT for installation token
TOKEN=$(curl -s -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/app/installations/$INSTALL_ID/access_tokens" \
  | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Failed to generate installation token" >&2
  exit 1
fi

echo "$TOKEN"
