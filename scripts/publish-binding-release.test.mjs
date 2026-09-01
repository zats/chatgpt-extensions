import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const sourceSha = "a".repeat(40);
const tag = "binding-26.1.2-v1.0.0";
const title = "ChatGPT 26.1.2 binding v1.0.0";
const notes = `Immutable exact-build binding generated and validated from ${sourceSha}.`;
const releaseUrl = `https://github.com/zats/chatgpt-extensions/releases/tag/${tag}`;

async function fixture(assets, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "publish-binding-test."));
  const bin = path.join(root, "bin");
  const assetDirectory = path.join(root, "assets");
  await mkdir(bin);
  await mkdir(assetDirectory);
  const archive = path.join(root, "binding.zip");
  const checksum = `${archive}.sha256`;
  const archiveContents = Buffer.from("exact archive\n");
  const sha256 = crypto.createHash("sha256").update(archiveContents).digest("hex");
  await writeFile(archive, archiveContents);
  await writeFile(checksum, `${sha256}  ${path.basename(archive)}\n`);
  const plan = path.join(root, "plan.json");
  await writeFile(
    plan,
    `${JSON.stringify({
      schemaVersion: 2,
      sourceSha,
      version: "26.1.2",
      adapterVersion: "1.0.0",
      appBuild: "123",
      appAsarSha256: "b".repeat(64),
      downloadUrl:
        "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.1.2.zip",
      downloadLength: 123456,
      downloadEdSignature: Buffer.alloc(64, 5).toString("base64"),
      tag,
      title,
      archive,
      checksum,
      sha256,
    })}\n`,
  );
  const release = path.join(root, "release.json");
  await writeFile(
    release,
    `${JSON.stringify({
      id: 44,
      tag_name: tag,
      name: options.name ?? title,
      body: options.body ?? notes,
      draft: options.draft ?? false,
      prerelease: options.prerelease ?? false,
      immutable: options.immutable ?? true,
      target_commitish: options.targetCommitish ?? sourceSha,
      assets,
    })}\n`,
  );
  for (const asset of assets) {
    let contents = Buffer.from("unexpected asset\n");
    if (asset.name === path.basename(archive)) {
      contents = await readFile(archive);
    } else if (asset.name === path.basename(checksum)) {
      contents = await readFile(checksum);
    }
    await writeFile(path.join(assetDirectory, String(asset.id)), contents);
  }

  const releaseExistsState = path.join(root, "release-exists");
  const tagState = path.join(root, "tag-state");
  const tagCreateMode = path.join(root, "tag-create-mode");
  const releaseCreateMode = path.join(root, "release-create-mode");
  const log = path.join(root, "gh.log");
  await writeFile(releaseExistsState, String(options.releaseExists ?? true));
  await writeFile(
    tagState,
    options.tagSha === "missing"
      ? "missing\n"
      : `${options.tagType ?? "commit"} ${options.tagSha ?? sourceSha}\n`,
  );
  await writeFile(tagCreateMode, `${options.tagCreateMode ?? "success"}\n`);
  await writeFile(releaseCreateMode, `${options.releaseCreateMode ?? "success"}\n`);
  await writeFile(log, "");

  const mock = path.join(bin, "gh");
  await writeFile(
    mock,
    `#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_LOG"

if [[ "\${1:-}" == "api" ]]; then
  method="GET"
  api_path=""
  previous=""
  for argument in "$@"; do
    if [[ "$previous" == "--method" ]]; then
      method="$argument"
    fi
    case "$argument" in
      repos/*) api_path="$argument" ;;
    esac
    previous="$argument"
  done

  case "$api_path" in
    repos/*/git/ref/tags/*)
      state="$(cat "$MOCK_TAG_STATE")"
      if [[ "$state" == "missing" ]]; then
        echo "gh: Not Found (HTTP 404)" >&2
        exit 1
      fi
      read -r type sha <<< "$state"
      printf '{"object":{"type":"%s","sha":"%s"}}\n' "$type" "$sha"
      exit 0
      ;;
    repos/*/git/refs)
      [[ "$method" == "POST" ]] || exit 92
      sha=""
      for argument in "$@"; do
        case "$argument" in
          sha=*) sha="\${argument#sha=}" ;;
        esac
      done
      case "$(cat "$MOCK_TAG_CREATE_MODE")" in
        success)
          printf 'commit %s\n' "$sha" > "$MOCK_TAG_STATE"
          printf '{"object":{"type":"commit","sha":"%s"}}\n' "$sha"
          exit 0
          ;;
        race-exact)
          printf 'commit %s\n' "$MOCK_SOURCE_SHA" > "$MOCK_TAG_STATE"
          echo "gh: Reference already exists (HTTP 422)" >&2
          exit 1
          ;;
        race-hostile)
          printf 'commit %s\n' "$MOCK_HOSTILE_SHA" > "$MOCK_TAG_STATE"
          echo "gh: Reference already exists (HTTP 422)" >&2
          exit 1
          ;;
        fail)
          echo "gh: tag create failed (HTTP 500)" >&2
          exit 1
          ;;
      esac
      ;;
    repos/*/releases/assets/*)
      asset_id="\${api_path##*/}"
      cat "$MOCK_ASSET_DIRECTORY/$asset_id"
      exit 0
      ;;
    repos/*/releases/tags/*)
      if [[ "$(cat "$MOCK_RELEASE_EXISTS_STATE")" == "false" ]]; then
        echo "gh: Not Found (HTTP 404)" >&2
        exit 1
      fi
      if [[ "$(jq -r .draft "$MOCK_RELEASE_JSON")" == "true" ]]; then
        echo "gh: Not Found (HTTP 404)" >&2
        exit 1
      fi
      cat "$MOCK_RELEASE_JSON"
      exit 0
      ;;
    repos/*/releases\?per_page=100)
      if [[ "$(cat "$MOCK_RELEASE_EXISTS_STATE")" == "false" ]]; then
        printf '[[]]\n'
      else
        jq -s '[.]' "$MOCK_RELEASE_JSON"
      fi
      exit 0
      ;;
    repos/*/releases/*)
      if [[ "$(cat "$MOCK_RELEASE_EXISTS_STATE")" == "false" ]]; then
        echo "gh: Not Found (HTTP 404)" >&2
        exit 1
      fi
      cat "$MOCK_RELEASE_JSON"
      exit 0
      ;;
  esac
fi

if [[ "\${1:-}" == "release" && "\${2:-}" == "create" ]]; then
  case "$(cat "$MOCK_RELEASE_CREATE_MODE")" in
    success)
      printf 'true\n' > "$MOCK_RELEASE_EXISTS_STATE"
      printf 'https://github.com/zats/chatgpt-extensions/releases/tag/%s\n' "$3"
      exit 0
      ;;
    race-exact)
      printf 'true\n' > "$MOCK_RELEASE_EXISTS_STATE"
      echo "a release with the same tag name already exists" >&2
      exit 1
      ;;
    fail)
      echo "release create failed" >&2
      exit 1
      ;;
  esac
fi

if [[ "\${1:-}" == "release" && "\${2:-}" == "upload" ]]; then
  file="$4"
  name="$(basename "$file")"
  next_id="$(jq '[.assets[].id] | max // 0 | . + 1' "$MOCK_RELEASE_JSON")"
  cp "$file" "$MOCK_ASSET_DIRECTORY/$next_id"
  temporary="\${MOCK_RELEASE_JSON}.tmp"
  jq --arg name "$name" --argjson id "$next_id" \
    '.assets += [{id: $id, name: $name}]' "$MOCK_RELEASE_JSON" > "$temporary"
  mv "$temporary" "$MOCK_RELEASE_JSON"
  printf 'https://github.com/zats/chatgpt-extensions/releases/download/%s/%s\n' "$3" "$name"
  exit 0
fi

if [[ "\${1:-}" == "release" && "\${2:-}" == "edit" ]]; then
  temporary="\${MOCK_RELEASE_JSON}.tmp"
  jq '.draft = false | .immutable = true' "$MOCK_RELEASE_JSON" > "$temporary"
  mv "$temporary" "$MOCK_RELEASE_JSON"
  printf 'https://github.com/zats/chatgpt-extensions/releases/tag/%s\n' "$3"
  exit 0
fi

exit 91
`,
  );
  await chmod(mock, 0o755);
  return {
    root,
    bin,
    archive,
    checksum,
    plan,
    release,
    releaseExistsState,
    tagState,
    assetDirectory,
    log,
  };
}

function publish(value) {
  return spawnSync(
    path.resolve(import.meta.dirname, "publish-binding-release.sh"),
    [value.plan, "zats/chatgpt-extensions"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH}`,
        MOCK_RELEASE_JSON: value.release,
        MOCK_RELEASE_EXISTS_STATE: value.releaseExistsState,
        MOCK_TAG_STATE: value.tagState,
        MOCK_TAG_CREATE_MODE: path.join(value.root, "tag-create-mode"),
        MOCK_RELEASE_CREATE_MODE: path.join(value.root, "release-create-mode"),
        MOCK_ASSET_DIRECTORY: value.assetDirectory,
        MOCK_LOG: value.log,
        MOCK_SOURCE_SHA: sourceSha,
        MOCK_HOSTILE_SHA: "c".repeat(40),
      },
    },
  );
}

function assertExactReleaseUrl(result) {
  assert.equal(result.stdout, `${releaseUrl}\n`);
}

test("published immutable release fails closed when an asset is missing", async () => {
  const value = await fixture([]);
  try {
    const result = publish(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not contain the exact two binding assets/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("published immutable release fails closed when an asset differs", async () => {
  const value = await fixture([
    { id: 1, name: "binding.zip" },
    { id: 2, name: "binding.zip.sha256" },
  ]);
  try {
    await writeFile(path.join(value.assetDirectory, "1"), "wrong\n");
    const result = publish(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /existing release asset binding\.zip is not immutable/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("draft release rejects an extra asset before immutable publication", async () => {
  const value = await fixture(
    [
      { id: 1, name: "binding.zip" },
      { id: 2, name: "binding.zip.sha256" },
      { id: 3, name: "unexpected.txt" },
    ],
    { draft: true, immutable: false },
  );
  try {
    const result = publish(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unexpected or duplicate assets/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("published immutable release requires exact metadata", async () => {
  const value = await fixture(
    [
      { id: 1, name: "binding.zip" },
      { id: 2, name: "binding.zip.sha256" },
    ],
    { prerelease: true },
  );
  try {
    const result = publish(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /release metadata .* is not exact/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("partial exact draft creates and verifies a lightweight tag before assets", async () => {
  const value = await fixture([], {
    draft: true,
    immutable: false,
    tagSha: "missing",
  });
  try {
    const result = publish(value);
    assert.equal(result.status, 0, result.stderr);
    assertExactReleaseUrl(result);
    assert.equal(await readFile(value.tagState, "utf8"), `commit ${sourceSha}\n`);
    const release = JSON.parse(await readFile(value.release, "utf8"));
    assert.equal(release.draft, false);
    assert.equal(release.immutable, true);
    assert.deepEqual(
      release.assets.map((asset) => asset.name),
      ["binding.zip", "binding.zip.sha256"],
    );
    const log = await readFile(value.log, "utf8");
    const createTag = log.indexOf("--method POST repos/zats/chatgpt-extensions/git/refs");
    const firstUpload = log.indexOf(`release upload ${tag}`);
    assert.ok(createTag >= 0);
    assert.ok(firstUpload > createTag);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("clean state creates the exact tag before the draft and its assets", async () => {
  const value = await fixture([], {
    draft: true,
    immutable: false,
    releaseExists: false,
    tagSha: "missing",
  });
  try {
    const result = publish(value);
    assert.equal(result.status, 0, result.stderr);
    assertExactReleaseUrl(result);
    assert.equal(await readFile(value.tagState, "utf8"), `commit ${sourceSha}\n`);
    const release = JSON.parse(await readFile(value.release, "utf8"));
    assert.equal(release.draft, false);
    assert.equal(release.immutable, true);
    assert.deepEqual(
      release.assets.map((asset) => asset.name),
      ["binding.zip", "binding.zip.sha256"],
    );

    const log = await readFile(value.log, "utf8");
    const createTag = log.indexOf("--method POST repos/zats/chatgpt-extensions/git/refs");
    const createRelease = log.indexOf(`release create ${tag}`);
    const firstUpload = log.indexOf(`release upload ${tag}`);
    assert.ok(createTag >= 0);
    assert.ok(createRelease > createTag);
    assert.ok(firstUpload > createRelease);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("an exact concurrent tag creation closes the create race", async () => {
  const value = await fixture([], {
    draft: true,
    immutable: false,
    tagSha: "missing",
    tagCreateMode: "race-exact",
  });
  try {
    const result = publish(value);
    assert.equal(result.status, 0, result.stderr);
    assertExactReleaseUrl(result);
    assert.equal(await readFile(value.tagState, "utf8"), `commit ${sourceSha}\n`);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("a hostile concurrent tag creation fails before asset mutation", async () => {
  const value = await fixture([], {
    draft: true,
    immutable: false,
    tagSha: "missing",
    tagCreateMode: "race-hostile",
  });
  try {
    const result = publish(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /points to commit .* expected commit/);
    const log = await readFile(value.log, "utf8");
    assert.doesNotMatch(log, /release upload|release edit/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("an exact concurrent draft creation closes the release race", async () => {
  const value = await fixture([], {
    draft: true,
    immutable: false,
    releaseExists: false,
    releaseCreateMode: "race-exact",
  });
  try {
    const result = publish(value);
    assert.equal(result.status, 0, result.stderr);
    assertExactReleaseUrl(result);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("hostile pre-existing tag fails before any draft or asset mutation", async () => {
  const value = await fixture([], {
    releaseExists: false,
    tagSha: "c".repeat(40),
  });
  try {
    const result = publish(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /release tag .* points to .* expected commit/);
    const log = await readFile(value.log, "utf8");
    assert.doesNotMatch(log, /--method POST|release create|release upload|release edit/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("annotated tag object is not accepted as the lightweight release tag", async () => {
  const value = await fixture([], {
    releaseExists: false,
    tagType: "tag",
  });
  try {
    const result = publish(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /points to tag .* expected commit/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("stale draft metadata fails before a missing tag is created", async () => {
  const value = await fixture([], {
    body: "stale body",
    draft: true,
    immutable: false,
    tagSha: "missing",
  });
  try {
    const result = publish(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /release metadata .* is not exact/);
    const log = await readFile(value.log, "utf8");
    assert.doesNotMatch(log, /--method POST|release upload|release edit/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("checksum file must contain one exact canonical line", async () => {
  const value = await fixture([]);
  try {
    const checksum = await readFile(value.checksum, "utf8");
    await writeFile(value.checksum, `${checksum}extra\n`);
    const result = publish(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /checksum file does not match/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
