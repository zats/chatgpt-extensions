#!/bin/bash

set -euo pipefail

if [[ "$#" -ne 4 ]]; then
  echo "usage: provision-auth-handoff.sh <owner/repository> <agent-auth.json> <test-auth.json> <environment-secret-writer-token-file>" >&2
  exit 64
fi

repository="$1"
agent_auth="$2"
test_auth="$3"
update_token="$4"
[[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]
[[ -f "$agent_auth" && ! -L "$agent_auth" ]]
[[ -f "$test_auth" && ! -L "$test_auth" ]]
[[ -f "$update_token" && ! -L "$update_token" ]]

temporary="$(mktemp -d "${TMPDIR:-/tmp}/chatgpt-auth-provision.XXXXXX")"
cleanup() {
  rm -rf "$temporary"
}
trap cleanup EXIT
chmod 700 "$temporary"

install -m 600 "$update_token" "$temporary/update-token"
export GH_TOKEN
GH_TOKEN="$(<"$temporary/update-token")"

for role in agent test; do
  node scripts/auth-handoff.mjs generate \
    "$temporary/$role-public.pem" \
    "$temporary/$role-private.pem"
done

gh variable set CODEX_AGENT_AUTH_HANDOFF_PUBLIC_KEY \
  --repo "$repository" --env codex-agent < "$temporary/agent-public.pem"
gh secret set CODEX_AGENT_AUTH_JSON \
  --repo "$repository" --env codex-agent < "$agent_auth"
gh variable set CHATGPT_TEST_AUTH_HANDOFF_PUBLIC_KEY \
  --repo "$repository" --env chatgpt-test < "$temporary/test-public.pem"
gh secret set CHATGPT_TEST_AUTH_JSON \
  --repo "$repository" --env chatgpt-test < "$test_auth"

gh secret set AUTH_HANDOFF_PRIVATE_KEY \
  --repo "$repository" --env codex-agent-refresh < "$temporary/agent-private.pem"
gh secret set CURRENT_AUTH_JSON \
  --repo "$repository" --env codex-agent-refresh < "$agent_auth"
gh secret set SECRET_UPDATE_TOKEN \
  --repo "$repository" --env codex-agent-refresh < "$temporary/update-token"

gh secret set AUTH_HANDOFF_PRIVATE_KEY \
  --repo "$repository" --env chatgpt-test-refresh < "$temporary/test-private.pem"
gh secret set CURRENT_AUTH_JSON \
  --repo "$repository" --env chatgpt-test-refresh < "$test_auth"
gh secret set SECRET_UPDATE_TOKEN \
  --repo "$repository" --env chatgpt-test-refresh < "$temporary/update-token"
