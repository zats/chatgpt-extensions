#!/usr/bin/env bash

set -euo pipefail

app_path=""
expect_version=""
script_directory="$(cd "$(dirname "$0")" && pwd)"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      [[ $# -ge 2 ]] || { echo "--app requires a path" >&2; exit 1; }
      app_path="$2"
      shift 2
      ;;
    --expect-version)
      [[ $# -ge 2 ]] || { echo "--expect-version requires a version" >&2; exit 1; }
      expect_version="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

[[ -n "$app_path" && -n "$expect_version" ]] || {
  echo "usage: extract-app.sh --app <ChatGPT.app> --expect-version <version>" >&2
  exit 1
}

plist="$app_path/Contents/Info.plist"
asar="$app_path/Contents/Resources/app.asar"
[[ -f "$plist" && -f "$asar" ]] || {
  echo "The supplied ChatGPT.app is incomplete" >&2
  exit 2
}

app_version="$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$plist")"
app_build="$(/usr/bin/plutil -extract CFBundleVersion raw "$plist")"
asar_sha256="$(/usr/bin/shasum -a 256 "$asar" | /usr/bin/awk '{print $1}')"
electron_version="unknown"
for framework_plist in \
  "$app_path/Contents/Frameworks/Codex Framework.framework/Resources/Info.plist" \
  "$app_path/Contents/Frameworks/Electron Framework.framework/Resources/Info.plist"; do
  if [[ -f "$framework_plist" ]]; then
    electron_version="$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$framework_plist")"
    break
  fi
done

extract_dir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/chatgpt-app-${app_version}.XXXXXX")"
cleanup_failed_extract() {
  /bin/rm -rf "$extract_dir"
}
trap cleanup_failed_extract ERR
asar_executable="$script_directory/../../../../node_modules/.bin/asar"
[[ -x "$asar_executable" ]] || {
  echo "The pinned extractor is not installed; run npm ci at the repository root" >&2
  exit 3
}
"$asar_executable" extract "$asar" "$extract_dir" >&2
trap - ERR

APP_PATH_VALUE="$app_path" \
APP_VERSION_VALUE="$app_version" \
APP_BUILD_VALUE="$app_build" \
ASAR_SHA256_VALUE="$asar_sha256" \
ELECTRON_VERSION_VALUE="$electron_version" \
EXPECT_VERSION_VALUE="$expect_version" \
EXTRACT_DIR_VALUE="$extract_dir" \
node - <<'NODE'
const value = {
  appPath: process.env.APP_PATH_VALUE,
  appVersion: process.env.APP_VERSION_VALUE,
  appBuild: process.env.APP_BUILD_VALUE,
  appAsarSha256: process.env.ASAR_SHA256_VALUE,
  electronVersion: process.env.ELECTRON_VERSION_VALUE,
  expectationsMet: process.env.APP_VERSION_VALUE === process.env.EXPECT_VERSION_VALUE,
  extractDir: process.env.EXTRACT_DIR_VALUE,
};
process.stdout.write(`${JSON.stringify(value)}\n`);
NODE
