#!/usr/bin/env bash

set -euo pipefail

PLAN_PATH="${1:-}"
REPOSITORY="${2:-${GITHUB_REPOSITORY:-}}"

[[ -f "$PLAN_PATH" && "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || {
  echo "usage: scripts/publish-binding-release.sh <release-plan.json> <owner/repository>" >&2
  exit 1
}
for command in cmp gh grep jq shasum; do
  command -v "$command" >/dev/null || {
    echo "$command is required" >&2
    exit 1
  }
done

jq -e '
  .schemaVersion == 2 and
  (.sourceSha | test("^[a-f0-9]{40}$")) and
  (.version | test("^[0-9]+(\\.[0-9]+)+$")) and
  (.adapterVersion | test("^[0-9]+\\.[0-9]+\\.[0-9]+$")) and
  (.appBuild | test("^[0-9]+$")) and
  (.appAsarSha256 | test("^[a-f0-9]{64}$")) and
  (.downloadUrl | test("^https://persistent\\.oaistatic\\.com/codex-app-prod/ChatGPT-darwin-arm64-[0-9.]+\\.zip$")) and
  (.downloadLength | type == "number" and . > 0) and
  (.downloadEdSignature | type == "string" and length > 0) and
  (.tag | type == "string") and
  (.title | type == "string") and
  (.archive | type == "string") and
  (.checksum | type == "string") and
  (.sha256 | test("^[a-f0-9]{64}$"))
' "$PLAN_PATH" >/dev/null

SOURCE_SHA="$(jq -er .sourceSha "$PLAN_PATH")"
TAG="$(jq -er .tag "$PLAN_PATH")"
TITLE="$(jq -er .title "$PLAN_PATH")"
ARCHIVE="$(jq -er .archive "$PLAN_PATH")"
CHECKSUM="$(jq -er .checksum "$PLAN_PATH")"
EXPECTED_SHA="$(jq -er .sha256 "$PLAN_PATH")"
[[ -f "$ARCHIVE" && -f "$CHECKSUM" ]] || {
  echo "binding release files are missing" >&2
  exit 1
}
ACTUAL_SHA="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
[[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] || {
  echo "binding archive SHA-256 does not match the release plan" >&2
  exit 1
}
expected_checksum="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/binding-checksum.XXXXXX")"
printf '%s  %s\n' "$EXPECTED_SHA" "$(basename "$ARCHIVE")" > "$expected_checksum"
cmp "$expected_checksum" "$CHECKSUM" >/dev/null || {
  rm -f "$expected_checksum"
  echo "binding checksum file does not match the release plan" >&2
  exit 1
}
rm -f "$expected_checksum"

TEMP_ROOT="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/binding-release.XXXXXX")"
cleanup() {
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

release_json="$TEMP_ROOT/release.json"
tag_json="$TEMP_ROOT/tag.json"
tag_error="$TEMP_ROOT/tag.error"

tag_state() {
  if gh api "repos/$REPOSITORY/git/ref/tags/$TAG" > "$tag_json" 2> "$tag_error"; then
    local tag_sha
    tag_sha="$(jq -er .object.sha "$tag_json")"
    [[ "$tag_sha" == "$SOURCE_SHA" ]] || {
      echo "release tag $TAG points to $tag_sha, expected $SOURCE_SHA" >&2
      exit 1
    }
    return 0
  fi
  if grep -Eq 'Not Found|HTTP 404' "$tag_error"; then
    return 1
  fi
  cat "$tag_error" >&2
  echo "could not resolve release tag $TAG" >&2
  exit 1
}

require_exact_tag() {
  tag_state || {
    echo "release tag $TAG does not exist at expected source $SOURCE_SHA" >&2
    exit 1
  }
}

# A hostile or stale pre-existing tag must fail before a draft or asset can be created.
tag_state || true
existing_published=false
if gh api "repos/$REPOSITORY/releases/tags/$TAG" > "$release_json" 2>/dev/null; then
  target="$(jq -er .target_commitish "$release_json")"
  [[ "$target" == "$SOURCE_SHA" ]] || {
    echo "existing release $TAG targets $target, expected $SOURCE_SHA" >&2
    exit 1
  }
  if [[ "$(jq -r .draft "$release_json")" == "false" ]]; then
    existing_published=true
  fi
else
  gh release create "$TAG" \
    --repo "$REPOSITORY" \
    --target "$SOURCE_SHA" \
    --title "$TITLE" \
    --notes "Immutable exact-build binding generated and validated from $SOURCE_SHA." \
    --draft
  gh api "repos/$REPOSITORY/releases/tags/$TAG" > "$release_json"
fi

require_exact_tag

release_id="$(jq -er .id "$release_json")"
archive_name="$(basename "$ARCHIVE")"
checksum_name="$(basename "$CHECKSUM")"

require_release_identity() {
  jq -e \
    --arg tag "$TAG" \
    --arg source "$SOURCE_SHA" \
    '.tag_name == $tag and .target_commitish == $source and .prerelease == false' \
    "$release_json" >/dev/null || {
    echo "release metadata for $TAG is not exact" >&2
    exit 1
  }
}

require_no_unexpected_assets() {
  jq -e \
    --arg archive "$archive_name" \
    --arg checksum "$checksum_name" '
      ([.assets[] | select(.name != $archive and .name != $checksum)] | length) == 0 and
      ([.assets[] | select(.name == $archive)] | length) <= 1 and
      ([.assets[] | select(.name == $checksum)] | length) <= 1
    ' "$release_json" >/dev/null || {
    echo "release $TAG contains unexpected or duplicate assets" >&2
    exit 1
  }
}

require_exact_assets() {
  jq -e \
    --arg archive "$archive_name" \
    --arg checksum "$checksum_name" '
      (.assets | length) == 2 and
      ([.assets[] | select(.name == $archive)] | length) == 1 and
      ([.assets[] | select(.name == $checksum)] | length) == 1
    ' "$release_json" >/dev/null || {
    echo "release $TAG does not contain the exact two binding assets" >&2
    exit 1
  }
}

require_release_identity
require_no_unexpected_assets
if [[ "$existing_published" == "true" ]]; then
  require_exact_assets
fi

verify_or_upload() {
  local file="$1"
  local name
  local asset_id
  local downloaded
  name="$(basename "$file")"
  asset_id="$(jq -r --arg name "$name" '.assets[] | select(.name == $name) | .id' "$release_json")"
  if [[ -n "$asset_id" ]]; then
    downloaded="$TEMP_ROOT/$name"
    gh api \
      -H "Accept: application/octet-stream" \
      "repos/$REPOSITORY/releases/assets/$asset_id" > "$downloaded"
    cmp "$file" "$downloaded" || {
      echo "existing release asset $name is not immutable" >&2
      exit 1
    }
  else
    [[ "$existing_published" == "false" ]] || {
      echo "published immutable release $TAG is missing asset $name" >&2
      exit 1
    }
    require_exact_tag
    gh release upload "$TAG" "$file" --repo "$REPOSITORY"
  fi
}

verify_or_upload "$ARCHIVE"
gh api "repos/$REPOSITORY/releases/$release_id" > "$release_json"
verify_or_upload "$CHECKSUM"
gh api "repos/$REPOSITORY/releases/$release_id" > "$release_json"

require_release_identity
require_no_unexpected_assets
require_exact_assets

for file in "$ARCHIVE" "$CHECKSUM"; do
  name="$(basename "$file")"
  asset_id="$(jq -er --arg name "$name" '.assets[] | select(.name == $name) | .id' "$release_json")"
  gh api \
    -H "Accept: application/octet-stream" \
    "repos/$REPOSITORY/releases/assets/$asset_id" > "$TEMP_ROOT/final-$name"
  cmp "$file" "$TEMP_ROOT/final-$name"
done

if [[ "$(jq -r .draft "$release_json")" == "true" ]]; then
  gh api "repos/$REPOSITORY/releases/$release_id" > "$release_json"
  require_release_identity
  require_exact_assets
  require_exact_tag
  gh release edit "$TAG" --repo "$REPOSITORY" --draft=false --latest=false
fi

gh api "repos/$REPOSITORY/releases/tags/$TAG" > "$release_json"
[[ "$(jq -r .draft "$release_json")" == "false" ]] || {
  echo "binding release $TAG is still a draft" >&2
  exit 1
}
[[ "$(jq -r '.immutable // false' "$release_json")" == "true" ]] || {
  echo "binding release $TAG is not immutable" >&2
  exit 1
}
require_release_identity
require_exact_assets

require_exact_tag
printf 'https://github.com/%s/releases/tag/%s\n' "$REPOSITORY" "$TAG"
