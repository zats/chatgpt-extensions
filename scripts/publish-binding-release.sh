#!/usr/bin/env bash

set -euo pipefail

PLAN_PATH="${1:-}"
REPOSITORY="${2:-${GITHUB_REPOSITORY:-}}"

[[ -f "$PLAN_PATH" && "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || {
  echo "usage: scripts/publish-binding-release.sh <release-plan.json> <owner/repository>" >&2
  exit 1
}
for command in cmp gh grep jq shasum sleep; do
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
  (.tag == ("binding-" + .version + "-v" + .adapterVersion)) and
  (.title == ("ChatGPT " + .version + " binding v" + .adapterVersion)) and
  (.archive | type == "string") and
  (.checksum | type == "string") and
  (.sha256 | test("^[a-f0-9]{64}$"))
' "$PLAN_PATH" >/dev/null

SOURCE_SHA="$(jq -er .sourceSha "$PLAN_PATH")"
TAG="$(jq -er .tag "$PLAN_PATH")"
TITLE="$(jq -er .title "$PLAN_PATH")"
NOTES="Immutable exact-build binding generated and validated from $SOURCE_SHA."
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
release_error="$TEMP_ROOT/release.error"
release_pages="$TEMP_ROOT/release-pages.json"
release_list_error="$TEMP_ROOT/release-list.error"
release_create_error="$TEMP_ROOT/release-create.error"
tag_json="$TEMP_ROOT/tag.json"
tag_error="$TEMP_ROOT/tag.error"
tag_create_json="$TEMP_ROOT/tag-create.json"
tag_create_error="$TEMP_ROOT/tag-create.error"

tag_state() {
  if gh api "repos/$REPOSITORY/git/ref/tags/$TAG" > "$tag_json" 2> "$tag_error"; then
    local tag_sha
    local tag_type
    tag_sha="$(jq -er .object.sha "$tag_json")"
    tag_type="$(jq -er .object.type "$tag_json")"
    [[ "$tag_type" == "commit" && "$tag_sha" == "$SOURCE_SHA" ]] || {
      echo "release tag $TAG points to $tag_type $tag_sha, expected commit $SOURCE_SHA" >&2
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

release_state() {
  if gh api "repos/$REPOSITORY/releases/tags/$TAG" > "$release_json" 2> "$release_error"; then
    return 0
  fi
  if ! grep -Eq 'Not Found|HTTP 404' "$release_error"; then
    cat "$release_error" >&2
    echo "could not resolve release $TAG" >&2
    exit 1
  fi

  # GitHub excludes drafts from the release-by-tag REST endpoint. Search all
  # authenticated release pages and accept exactly one matching draft.
  if ! gh api \
    --paginate \
    --slurp \
    "repos/$REPOSITORY/releases?per_page=100" > "$release_pages" 2> "$release_list_error"; then
    cat "$release_list_error" >&2
    echo "could not search draft releases for $TAG" >&2
    exit 1
  fi
  local release_count
  release_count="$(jq -er --arg tag "$TAG" '[.[][] | select(.tag_name == $tag)] | length' "$release_pages")"
  if [[ "$release_count" == "0" ]]; then
    return 1
  fi
  [[ "$release_count" == "1" ]] || {
    echo "more than one release has exact tag $TAG" >&2
    exit 1
  }
  jq -e --arg tag "$TAG" '[.[][] | select(.tag_name == $tag)][0]' "$release_pages" > "$release_json"
}

wait_for_release_state() {
  local attempt
  for ((attempt = 0; attempt < 15; attempt += 1)); do
    if release_state; then
      return 0
    fi
    if [[ "$attempt" -lt 14 ]]; then
      sleep 1
    fi
  done
  return 1
}

require_exact_tag() {
  tag_state || {
    echo "release tag $TAG does not exist at expected source $SOURCE_SHA" >&2
    exit 1
  }
}

require_release_identity() {
  jq -e \
    --arg tag "$TAG" \
    --arg source "$SOURCE_SHA" \
    --arg title "$TITLE" \
    --arg notes "$NOTES" \
    '.tag_name == $tag and
     .target_commitish == $source and
     .name == $title and
     .body == $notes and
     .prerelease == false and
     (.draft | type) == "boolean" and
     (.assets | type) == "array"' \
    "$release_json" >/dev/null || {
    echo "release metadata for $TAG is not exact" >&2
    exit 1
  }
}

ensure_exact_tag() {
  if tag_state; then
    return 0
  fi
  if gh api \
    --method POST \
    "repos/$REPOSITORY/git/refs" \
    -f "ref=refs/tags/$TAG" \
    -f "sha=$SOURCE_SHA" > "$tag_create_json" 2> "$tag_create_error"; then
    require_exact_tag
    return 0
  fi

  # A concurrent publisher can create the same exact tag between the read and POST.
  # Re-read it after every failed create. A different target still fails in tag_state.
  if tag_state; then
    return 0
  fi
  cat "$tag_create_error" >&2
  echo "could not create exact release tag $TAG at $SOURCE_SHA" >&2
  exit 1
}

# Reject hostile pre-existing state before this process creates any state.
tag_state || true
release_exists=false
if release_state; then
  release_exists=true
  require_release_identity
fi

# GitHub draft releases do not necessarily create a Git ref. Create and verify the
# lightweight tag explicitly before a draft or any release asset is created.
ensure_exact_tag

if [[ "$release_exists" == "false" ]]; then
  if ! gh api \
    --method POST \
    "repos/$REPOSITORY/releases" \
    -f "tag_name=$TAG" \
    -f "target_commitish=$SOURCE_SHA" \
    -f "name=$TITLE" \
    -f "body=$NOTES" \
    -F draft=true \
    -F prerelease=false > "$release_json" 2> "$release_create_error"; then
    # A concurrent publisher can create the exact draft between the read and create.
    if ! wait_for_release_state; then
      cat "$release_create_error" >&2
      echo "could not create exact draft release $TAG" >&2
      exit 1
    fi
  fi
  require_release_identity
fi

require_exact_tag

existing_published=false
if [[ "$(jq -r .draft "$release_json")" == "false" ]]; then
  existing_published=true
fi

release_id="$(jq -er .id "$release_json")"
archive_name="$(basename "$ARCHIVE")"
checksum_name="$(basename "$CHECKSUM")"

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
    gh release upload "$TAG" "$file" --repo "$REPOSITORY" > /dev/null
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
  gh release edit "$TAG" --repo "$REPOSITORY" --draft=false --latest=false > /dev/null
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
