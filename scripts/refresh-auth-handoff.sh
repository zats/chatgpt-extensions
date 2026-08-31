#!/bin/bash

set -euo pipefail

if [[ "$#" -ne 9 ]]; then
  echo "usage: refresh-auth-handoff.sh <encrypted-dir> <private-key> <current-auth> <role> <repository> <run-id> <run-attempt> <target-environment> <secret-name>" >&2
  exit 64
fi

encrypted_directory="$1"
private_key="$2"
current_auth="$3"
role="$4"
repository="$5"
run_id="$6"
run_attempt="$7"
target_environment="$8"
secret_name="$9"

[[ "$role" =~ ^[a-z][a-z0-9-]*$ ]]
[[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]
[[ "$run_id" =~ ^[0-9]+$ ]]
[[ "$run_attempt" =~ ^[1-9][0-9]*$ ]]
[[ "$target_environment" =~ ^[A-Za-z0-9_.-]+$ ]]
[[ "$secret_name" =~ ^[A-Z][A-Z0-9_]*$ ]]
case "$role:$target_environment:$secret_name" in
  agent:codex-agent:CODEX_AGENT_AUTH_JSON|test:chatgpt-test:CHATGPT_TEST_AUTH_JSON)
    ;;
  *)
    echo "Authentication handoff target is not allowlisted" >&2
    exit 1
    ;;
esac
[[ -n "${GH_TOKEN:-}" ]]
[[ -f "$private_key" && ! -L "$private_key" ]]
[[ -f "$current_auth" && ! -L "$current_auth" ]]
envelope="$encrypted_directory/$role.json"
[[ -f "$envelope" && ! -L "$envelope" ]]
entries="$(find "$encrypted_directory" -mindepth 1 -maxdepth 1 -print)"
[[ "$entries" == "$envelope" ]] || {
  echo "Authentication handoff must contain only its exact regular envelope" >&2
  exit 1
}

temporary="$(mktemp -d "${RUNNER_TEMP:-/tmp}/auth-refresh.XXXXXX")"
cleanup() {
  rm -rf "$temporary"
}
trap cleanup EXIT
install -m 600 "$private_key" "$temporary/private.pem"
install -m 600 "$current_auth" "$temporary/current.json"
mkdir -m 700 "$temporary/decrypted"

node scripts/auth-handoff.mjs decrypt \
  "$temporary/private.pem" \
  "$encrypted_directory" \
  "$temporary/decrypted" \
  "$repository" \
  "$run_id" \
  "$run_attempt" \
  "$target_environment" \
  "$secret_name" \
  "$role"

candidate="$temporary/decrypted/$role.json"
selection="$(node scripts/select-newer-auth.mjs "$temporary/current.json" "$candidate")"
case "$selection" in
  same|stale)
    live_source="$temporary/current.json"
    ;;
  newer)
    # The serialized refresh mirror is authoritative. Write it first. A later
    # run repairs the live secret from this mirror if the second write fails.
    gh secret set CURRENT_AUTH_JSON \
      --repo "$repository" \
      --env "${target_environment}-refresh" < "$candidate"
    live_source="$candidate"
    ;;
  *)
    echo "Authentication selector returned an invalid result" >&2
    exit 1
    ;;
esac

gh secret set "$secret_name" \
  --repo "$repository" \
  --env "$target_environment" < "$live_source"
