#!/bin/bash

set -euo pipefail

if [[ "$#" -ne 7 ]]; then
  echo "usage: run-isolated-live-gate.sh <source> <app> <auth.json> <binding-relative-path> <result.json> <final-auth.json> <node>" >&2
  exit 64
fi

source_root="$1"
app_source="$2"
auth_source="$3"
binding_relative="$4"
result_output="$5"
auth_output="$6"
node_executable="$7"

[[ -d "$source_root" && ! -L "$source_root" ]]
[[ -d "$app_source" && ! -L "$app_source" ]]
[[ -f "$auth_source" && ! -L "$auth_source" ]]
[[ "$binding_relative" =~ ^runtime/bindings/[0-9]+([.][0-9]+)*$ ]]
[[ -x "$node_executable" && ! -L "$node_executable" ]]
[[ ! -e "$result_output" && ! -L "$result_output" ]]
[[ ! -e "$auth_output" && ! -L "$auth_output" ]]
chmod 700 "${RUNNER_TEMP:?}"

suffix="$(printf '%06d%04d' "$(( $$ % 1000000 ))" "$(( RANDOM % 10000 ))")"
gate_user="cxgate$suffix"
gate_home="/Users/$gate_user"
gate_uid=600
while /usr/bin/dscl . -search /Users UniqueID "$gate_uid" | /usr/bin/grep -q .; do
  gate_uid=$((gate_uid + 1))
done

cleanup() {
  sudo /usr/bin/pkill -KILL -u "$gate_uid" 2>/dev/null || true
  sudo /usr/bin/dscl . -delete "/Users/$gate_user" 2>/dev/null || true
  if [[ "$gate_home" == "/Users/$gate_user" && "$gate_user" =~ ^cxgate[0-9]+$ ]]; then
    sudo /bin/rm -rf "$gate_home"
  fi
}
trap cleanup EXIT

sudo /usr/bin/dscl . -create "/Users/$gate_user"
sudo /usr/bin/dscl . -create "/Users/$gate_user" UserShell /bin/bash
sudo /usr/bin/dscl . -create "/Users/$gate_user" RealName "ChatGPT live gate"
sudo /usr/bin/dscl . -create "/Users/$gate_user" UniqueID "$gate_uid"
sudo /usr/bin/dscl . -create "/Users/$gate_user" PrimaryGroupID 20
sudo /usr/bin/dscl . -create "/Users/$gate_user" NFSHomeDirectory "$gate_home"
sudo /bin/mkdir -m 755 "$gate_home"
if sudo -u "$gate_user" /usr/bin/sudo -n /usr/bin/true 2>/dev/null; then
  echo "The live gate account unexpectedly has sudo access" >&2
  exit 1
fi

sudo /usr/bin/ditto "$source_root" "$gate_home/workspace"
sudo /usr/bin/ditto "$app_source" "$gate_home/ChatGPT.app"
sudo /usr/sbin/chown -R root:wheel "$gate_home/workspace" "$gate_home/ChatGPT.app"
sudo /bin/chmod -R go-w "$gate_home/workspace" "$gate_home/ChatGPT.app"
sudo /bin/mkdir -m 700 \
  "$gate_home/codex-home" \
  "$gate_home/output" \
  "$gate_home/tmp"
sudo /usr/sbin/chown "$gate_uid:20" \
  "$gate_home/codex-home" \
  "$gate_home/output" \
  "$gate_home/tmp"
sudo /usr/bin/install -o "$gate_uid" -g 20 -m 600 \
  "$auth_source" "$gate_home/codex-home/auth.json"

node_directory="$(/usr/bin/dirname "$node_executable")"
set +e
"$node_executable" "$source_root/scripts/run-owned-command.mjs" \
  --timeout-ms 2700000 \
  --stdin /dev/null \
  --output /dev/null \
  -- /usr/bin/sudo -u "$gate_user" /usr/bin/env -i \
  HOME="$gate_home" \
  LANG=en_US.UTF-8 \
  LOGNAME="$gate_user" \
  PATH="$node_directory:/usr/bin:/bin:/usr/sbin:/sbin" \
  TMPDIR="$gate_home/tmp" \
  USER="$gate_user" \
  "$node_executable" "$gate_home/workspace/scripts/run-version-gate.mjs" \
  --phase live \
  --app "$gate_home/ChatGPT.app" \
  --binding "$gate_home/workspace/$binding_relative" \
  --codex-home "$gate_home/codex-home" \
  --result "$gate_home/output/version-gate.json"
gate_status="$?"
set -e

sudo /usr/bin/pkill -KILL -u "$gate_uid" 2>/dev/null || true
for ((remaining_checks = 5; remaining_checks > 0; remaining_checks -= 1)); do
  if ! /usr/bin/pgrep -u "$gate_uid" >/dev/null; then break; fi
  sleep 1
done
if /usr/bin/pgrep -u "$gate_uid" >/dev/null; then
  echo "The isolated live gate still has a process" >&2
  exit 1
fi

for input in "$gate_home/output/version-gate.json" "$gate_home/codex-home/auth.json"; do
  sudo /bin/test -f "$input"
  sudo /bin/test ! -L "$input"
done
result_bytes="$(sudo /usr/bin/stat -f%z "$gate_home/output/version-gate.json")"
auth_bytes="$(sudo /usr/bin/stat -f%z "$gate_home/codex-home/auth.json")"
[[ "$result_bytes" -gt 0 && "$result_bytes" -le 10485760 ]]
[[ "$auth_bytes" -gt 0 && "$auth_bytes" -le 1048576 ]]
runner_uid="$(/usr/bin/id -u)"
runner_gid="$(/usr/bin/id -g)"
sudo /usr/bin/install -o "$runner_uid" -g "$runner_gid" -m 600 \
  "$gate_home/output/version-gate.json" "$result_output"
sudo /usr/bin/install -o "$runner_uid" -g "$runner_gid" -m 600 \
  "$gate_home/codex-home/auth.json" "$auth_output"

trap - EXIT
cleanup
exit "$gate_status"
