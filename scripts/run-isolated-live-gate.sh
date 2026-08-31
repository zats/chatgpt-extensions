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
runner_temp="$(cd "$RUNNER_TEMP" && /bin/pwd -P)"
runner_uid="$(/usr/bin/id -u)"
runner_gid="$(/usr/bin/id -g)"
if [[ "$runner_uid" -eq 0 ]]; then
  echo "The isolated live gate must run as a normal administrator account" >&2
  exit 1
fi
for output in "$result_output" "$auth_output"; do
  output_parent="$(cd "$(/usr/bin/dirname "$output")" && /bin/pwd -P)"
  [[ "$output_parent" == "$runner_temp" ]]
done

suffix="$(printf '%06d%04d' "$(( $$ % 1000000 ))" "$(( RANDOM % 10000 ))")"
gate_user="cxgate$suffix"
gate_home="/Users/$gate_user"
gate_uid=""
account_verified=false
evidence_frozen=false
gate_result_source="$gate_home/output/version-gate.json"
gate_auth_source="$gate_home/codex-home/auth.json"
staged_result="$runner_temp/.version-gate.stage"
staged_auth="$runner_temp/.final-auth.stage"
[[ ! -e "$staged_result" && ! -L "$staged_result" ]]
[[ ! -e "$staged_auth" && ! -L "$staged_auth" ]]
if /usr/bin/dscl . -read "/Users/$gate_user" >/dev/null 2>&1 ||
   [[ -e "$gate_home" ]]; then
  echo "The isolated live gate account or home already exists" >&2
  exit 1
fi

# Invoked during setup and cleanup.
# shellcheck disable=SC2329
read_gate_uid() {
  /usr/bin/dscl . -read "/Users/$gate_user" UniqueID 2>/dev/null |
    /usr/bin/awk '$1 == "UniqueID:" && $2 ~ /^[0-9]+$/ { print $2 }'
}

# Invoked while cleanup waits for the temporary UID to become idle.
# shellcheck disable=SC2329
gate_process_exists() {
  [[ "$gate_uid" =~ ^[0-9]+$ && "$gate_uid" -ge 500 ]] &&
    /usr/bin/pgrep -u "$gate_uid" >/dev/null 2>&1
}

# Invoked before evidence copy and by cleanup.
# shellcheck disable=SC2329
stop_gate_processes() {
  local stop_status=0
  if [[ ! "$gate_uid" =~ ^[0-9]+$ || "$gate_uid" -lt 500 ]]; then
    return 0
  fi
  for ((remaining_checks = 10; remaining_checks > 0; remaining_checks -= 1)); do
    sudo /bin/launchctl bootout "gui/$gate_uid" 2>/dev/null || true
    sudo /bin/launchctl bootout "user/$gate_uid" 2>/dev/null || true
    sudo /usr/bin/pkill -KILL -u "$gate_uid" 2>/dev/null || true
    if ! /usr/bin/pgrep -u "$gate_uid" >/dev/null; then break; fi
    sleep 1
  done
  if /usr/bin/pgrep -u "$gate_uid" >/dev/null; then
    echo "The isolated live gate still has a process after its bounded stop" >&2
    /bin/ps -o pid=,ppid=,stat=,comm= -U "$gate_uid" >&2 || true
    stop_status=1
  fi
  return "$stop_status"
}

# Invoked before trusted evidence staging.
# shellcheck disable=SC2329
suspend_gate_processes() {
  if [[ ! "$gate_uid" =~ ^[0-9]+$ || "$gate_uid" -lt 500 ]]; then
    return 1
  fi
  for ((remaining_checks = 10; remaining_checks > 0; remaining_checks -= 1)); do
    sudo /bin/launchctl bootout "gui/$gate_uid" 2>/dev/null || true
    sudo /bin/launchctl bootout "user/$gate_uid" 2>/dev/null || true
    sudo /usr/bin/pkill -STOP -u "$gate_uid" 2>/dev/null || true
    if ! /usr/bin/pgrep -u "$gate_uid" >/dev/null; then
      return 0
    fi
    if /bin/ps -o stat= -U "$gate_uid" |
       /usr/bin/awk 'NF && substr($1, 1, 1) != "T" { active = 1 } END { exit active }'; then
      return 0
    fi
    sleep 1
  done
  echo "The isolated live gate still has an active process after suspension" >&2
  /bin/ps -o pid=,ppid=,stat=,comm= -U "$gate_uid" >&2 || true
  return 1
}

# Invoked by cleanup_on_exit.
# shellcheck disable=SC2329
cleanup() {
  local cleanup_status=0
  local cleanup_uid
  if [[ "$evidence_frozen" == true ]]; then
    sudo /usr/bin/chflags nouchg "$gate_result_source" "$gate_auth_source" || cleanup_status=1
    evidence_frozen=false
  fi
  if /usr/bin/dscl . -read "/Users/$gate_user" >/dev/null 2>&1; then
    cleanup_uid="$(read_gate_uid)"
    if [[ "$cleanup_uid" =~ ^[0-9]+$ && "$cleanup_uid" -ge 500 ]]; then
      gate_uid="$cleanup_uid"
    fi
  fi
  if /usr/bin/dscl . -read "/Users/$gate_user" >/dev/null 2>&1; then
    if [[ -d "$gate_home" && ! -L "$gate_home" ]]; then
      sudo /usr/sbin/chown "$gate_uid:20" "$gate_home" || cleanup_status=1
      sudo /bin/chmod 555 "$gate_home" || cleanup_status=1
    fi
    sudo /usr/sbin/sysadminctl -deleteUser "$gate_user" || cleanup_status=1
  fi
  stop_gate_processes || cleanup_status=1
  for ((remaining_checks = 20; remaining_checks > 0; remaining_checks -= 1)); do
    if ! /usr/bin/dscl . -read "/Users/$gate_user" >/dev/null 2>&1 &&
       ! gate_process_exists &&
       [[ ! -e "$gate_home" ]]; then
      break
    fi
    sleep 1
  done
  if /usr/bin/dscl . -read "/Users/$gate_user" >/dev/null 2>&1; then
    echo "The isolated live gate account still exists after cleanup" >&2
    cleanup_status=1
  fi
  if gate_process_exists; then
    echo "The isolated live gate still has a process after account deletion" >&2
    cleanup_status=1
  fi
  if [[ "$account_verified" != true && -e "$gate_home" ]]; then
    if [[ "$gate_home" == "/Users/$gate_user" && "$gate_user" =~ ^cxgate[0-9]+$ ]]; then
      sudo /usr/bin/find "$gate_home" -depth -delete || cleanup_status=1
    else
      echo "The isolated live gate partial home failed its cleanup guard" >&2
      cleanup_status=1
    fi
  fi
  if [[ -e "$gate_home" ]]; then
    echo "The isolated live gate home still exists after cleanup" >&2
    cleanup_status=1
  fi
  return "$cleanup_status"
}

# Invoked by the EXIT trap.
# shellcheck disable=SC2329
cleanup_on_exit() {
  local gate_exit_status="$?"
  local cleanup_exit_status=0
  trap - EXIT
  set +e
  cleanup
  cleanup_exit_status="$?"
  /usr/bin/chflags nouchg "$staged_result" "$staged_auth" 2>/dev/null || true
  /bin/rm -f "$staged_result" "$staged_auth"
  if [[ "$gate_exit_status" -ne 0 ]]; then exit "$gate_exit_status"; fi
  exit "$cleanup_exit_status"
}
trap cleanup_on_exit EXIT

sudo -v
gate_password="$(/usr/bin/uuidgen | /usr/bin/tr -d '-')"
sudo /usr/sbin/sysadminctl -addUser "$gate_user" \
  -fullName "ChatGPT live gate" \
  -GID 20 \
  -shell /bin/bash \
  -home "$gate_home" \
  -password "$gate_password"
unset gate_password
gate_uid="$(read_gate_uid)"
[[ "$gate_uid" =~ ^[0-9]+$ && "$gate_uid" -ge 500 ]]
record_home="$(/usr/bin/dscl . -read "/Users/$gate_user" NFSHomeDirectory |
  /usr/bin/awk '$1 == "NFSHomeDirectory:" { print $2 }')"
[[ "$record_home" == "$gate_home" ]]
if /usr/bin/id -Gn "$gate_user" | /usr/bin/tr ' ' '\n' | /usr/bin/grep -qx admin; then
  echo "The live gate account unexpectedly belongs to the admin group" >&2
  exit 1
fi
sudo /bin/mkdir -m 755 "$gate_home"
[[ -d "$gate_home" && ! -L "$gate_home" ]]
sudo /usr/sbin/chown "$gate_uid:20" "$gate_home"
sudo /bin/chmod 555 "$gate_home"
account_verified=true
if sudo -u "$gate_user" /usr/bin/sudo -n /usr/bin/true 2>/dev/null; then
  echo "The live gate account unexpectedly has sudo access" >&2
  exit 1
fi

sudo /usr/bin/ditto "$source_root" "$gate_home/workspace"
sudo /usr/bin/ditto "$app_source" "$gate_home/ChatGPT.app"
sudo /usr/sbin/chown -R root:wheel "$gate_home/workspace" "$gate_home/ChatGPT.app"
sudo /bin/chmod -R a+rX "$gate_home/workspace" "$gate_home/ChatGPT.app"
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
sudo /usr/bin/install -o "$gate_uid" -g 20 -m 600 \
  /dev/null "$gate_home/codex-home/.chatgpt-extensions-isolated-live-gate"

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

suspend_gate_processes

for input in "$gate_result_source" "$gate_auth_source"; do
  sudo /bin/test -f "$input"
  sudo /bin/test ! -L "$input"
done
sudo /usr/sbin/chown root:wheel \
  "$gate_home/output" \
  "$gate_home/codex-home" \
  "$gate_result_source" \
  "$gate_auth_source"
sudo /bin/chmod 500 "$gate_home/output" "$gate_home/codex-home"
sudo /bin/chmod 400 "$gate_result_source" "$gate_auth_source"
sudo /usr/bin/chflags uchg "$gate_result_source" "$gate_auth_source"
evidence_frozen=true
result_bytes="$(sudo /usr/bin/stat -f%z "$gate_result_source")"
auth_bytes="$(sudo /usr/bin/stat -f%z "$gate_auth_source")"
[[ "$result_bytes" -gt 0 && "$result_bytes" -le 10485760 ]]
[[ "$auth_bytes" -gt 0 && "$auth_bytes" -le 1048576 ]]
sudo /usr/bin/install -o "$runner_uid" -g "$runner_gid" -m 600 \
  "$gate_result_source" "$staged_result"
sudo /usr/bin/install -o "$runner_uid" -g "$runner_gid" -m 600 \
  "$gate_auth_source" "$staged_auth"
sudo /usr/bin/cmp -s "$gate_result_source" "$staged_result"
sudo /usr/bin/cmp -s "$gate_auth_source" "$staged_auth"
sudo /usr/bin/chflags nouchg "$staged_result" "$staged_auth"
if ! "$node_executable" -e '
  const fs = require("node:fs");
  let value;
  try {
    value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  } catch {
    process.exit(1);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    process.exit(1);
  }
' "$staged_auth"; then
  echo "The refreshed isolated authentication is not a JSON object" >&2
  exit 1
fi
sudo /usr/bin/chflags nouchg "$gate_result_source" "$gate_auth_source"
evidence_frozen=false

cleanup
/bin/mv "$staged_result" "$result_output"
/bin/mv "$staged_auth" "$auth_output"
trap - EXIT

exit "$gate_status"
