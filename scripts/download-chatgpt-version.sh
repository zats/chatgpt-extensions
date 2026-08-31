#!/usr/bin/env bash

set -euo pipefail

APP_VERSION="${1:-}"
EXPECTED_APP_BUILD="${2:-}"
DOWNLOAD_URL="${3:-}"
EXPECTED_DOWNLOAD_LENGTH="${4:-}"
DOWNLOAD_ED_SIGNATURE="${5:-}"
OUTPUT_ROOT="${6:-}"
SCRIPT_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
EXPECTED_URL="https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-$APP_VERSION.zip"

[[ "$APP_VERSION" =~ ^[0-9]+(\.[0-9]+)+$ ]] || {
  echo "version must contain only numeric dot-separated components" >&2
  exit 1
}
[[ "$DOWNLOAD_URL" == "$EXPECTED_URL" ]] || {
  echo "download URL must be $EXPECTED_URL" >&2
  exit 1
}
[[ "$EXPECTED_APP_BUILD" =~ ^[0-9]+$ ]] || {
  echo "app build must be numeric" >&2
  exit 1
}
[[ "$EXPECTED_DOWNLOAD_LENGTH" =~ ^[1-9][0-9]*$ ]] || {
  echo "download length must be a positive integer" >&2
  exit 1
}
[[ -n "$DOWNLOAD_ED_SIGNATURE" ]] || {
  echo "download Ed25519 signature is required" >&2
  exit 1
}
[[ -n "$OUTPUT_ROOT" ]] || {
  echo "usage: scripts/download-chatgpt-version.sh <version> <app-build> <download-url> <download-length> <download-signature> <empty-output-directory>" >&2
  exit 1
}
[[ ! -e "$OUTPUT_ROOT" ]] || {
  echo "output path already exists: $OUTPUT_ROOT" >&2
  exit 1
}

for command in codesign curl ditto shasum spctl; do
  command -v "$command" >/dev/null || {
    echo "$command is required" >&2
    exit 1
  }
done

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/chatgpt-version-download.XXXXXX")"
ARCHIVE="$TEMP_ROOT/ChatGPT.zip"

cleanup() {
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

curl \
  --connect-timeout 30 \
  --fail \
  --location \
  --max-time 900 \
  --retry 3 \
  --retry-all-errors \
  --silent \
  --show-error \
  "$DOWNLOAD_URL" \
  --output "$ARCHIVE"

ACTUAL_DOWNLOAD_LENGTH="$(/usr/bin/stat -f %z "$ARCHIVE")"
[[ "$ACTUAL_DOWNLOAD_LENGTH" == "$EXPECTED_DOWNLOAD_LENGTH" ]] || {
  echo "downloaded archive has $ACTUAL_DOWNLOAD_LENGTH bytes, expected $EXPECTED_DOWNLOAD_LENGTH" >&2
  exit 1
}
node "$SCRIPT_DIRECTORY/verify-sparkle-signature.mjs" "$ARCHIVE" "$DOWNLOAD_ED_SIGNATURE"

mkdir -p "$OUTPUT_ROOT"
ditto -x -k "$ARCHIVE" "$OUTPUT_ROOT"

APP_PATH="$OUTPUT_ROOT/ChatGPT.app"
PLIST="$APP_PATH/Contents/Info.plist"
ASAR="$APP_PATH/Contents/Resources/app.asar"
RESOURCES="$APP_PATH/Contents/Resources"
[[ -f "$PLIST" && -f "$ASAR" ]] || {
  echo "download did not contain a complete ChatGPT.app" >&2
  exit 1
}

ACTUAL_VERSION="$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$PLIST")"
APP_BUILD="$(/usr/bin/plutil -extract CFBundleVersion raw "$PLIST")"
BUNDLE_IDENTIFIER="$(/usr/bin/plutil -extract CFBundleIdentifier raw "$PLIST")"
[[ "$ACTUAL_VERSION" == "$APP_VERSION" ]] || {
  echo "downloaded ChatGPT version $ACTUAL_VERSION, expected $APP_VERSION" >&2
  exit 1
}
[[ "$BUNDLE_IDENTIFIER" == "com.openai.codex" ]] || {
  echo "downloaded app has unexpected bundle identifier $BUNDLE_IDENTIFIER" >&2
  exit 1
}
[[ "$APP_BUILD" == "$EXPECTED_APP_BUILD" ]] || {
  echo "downloaded ChatGPT app build $APP_BUILD, expected $EXPECTED_APP_BUILD" >&2
  exit 1
}
for executable in codex codex-code-mode-host; do
  [[ -x "$RESOURCES/$executable" ]] || {
    echo "downloaded ChatGPT app has no bundled $executable executable" >&2
    exit 1
  }
done

codesign --verify --deep --strict "$APP_PATH"
SIGNATURE_DETAILS="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1)"
SIGNING_IDENTIFIER="$(sed -n 's/^Identifier=//p' <<< "$SIGNATURE_DETAILS")"
TEAM_IDENTIFIER="$(sed -n 's/^TeamIdentifier=//p' <<< "$SIGNATURE_DETAILS")"
[[ "$SIGNING_IDENTIFIER" == "com.openai.codex" ]] || {
  echo "downloaded app has unexpected signing identifier $SIGNING_IDENTIFIER" >&2
  exit 1
}
[[ "$TEAM_IDENTIFIER" == "2DC432GLL2" ]] || {
  echo "downloaded app has unexpected signing team $TEAM_IDENTIFIER" >&2
  exit 1
}
spctl --assess --type execute "$APP_PATH"
ASAR_SHA256="$(shasum -a 256 "$ASAR" | awk '{print $1}')"
[[ "$ASAR_SHA256" =~ ^[a-f0-9]{64}$ ]] || {
  echo "downloaded ChatGPT app.asar has an invalid SHA-256 digest" >&2
  exit 1
}
printf '%s\n' "$APP_PATH"
