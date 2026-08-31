import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const sourceSha = "a".repeat(40);

async function fixture(assets, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "publish-binding-test."));
  const bin = path.join(root, "bin");
  await mkdir(bin);
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
      tag: "binding-26.1.2-v1.0.0",
      title: "ChatGPT 26.1.2 binding v1.0.0",
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
      tag_name: "binding-26.1.2-v1.0.0",
      draft: options.draft ?? false,
      prerelease: false,
      immutable: options.immutable ?? true,
      target_commitish: sourceSha,
      assets,
    })}\n`,
  );
  const mock = path.join(bin, "gh");
  await writeFile(
    mock,
    `#!/bin/bash
set -euo pipefail
for argument in "$@"; do
  case "$argument" in
    repos/*/git/ref/tags/*)
      if [[ "$MOCK_TAG_SHA" == "missing" ]]; then
        echo "gh: Not Found (HTTP 404)" >&2
        exit 1
      fi
      printf '{"object":{"sha":"%s"}}\n' "$MOCK_TAG_SHA"
      exit 0
      ;;
    repos/*/releases/tags/*)
      if [[ "$MOCK_RELEASE_EXISTS" == "false" ]]; then
        echo "gh: Not Found (HTTP 404)" >&2
        exit 1
      fi
      cat "$MOCK_RELEASE_JSON"
      exit 0
      ;;
    repos/*/releases/assets/1) cat "$MOCK_ASSET_ONE"; exit 0 ;;
    repos/*/releases/assets/2) cat "$MOCK_ASSET_TWO"; exit 0 ;;
  esac
done
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
    releaseExists: options.releaseExists ?? true,
    tagSha: options.tagSha ?? sourceSha,
  };
}

function publish(value, assetOne = "/dev/null", assetTwo = "/dev/null") {
  return spawnSync(
    path.resolve(import.meta.dirname, "publish-binding-release.sh"),
    [value.plan, "zats/chatgpt-extensions"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH}`,
        MOCK_RELEASE_JSON: value.release,
        MOCK_ASSET_ONE: assetOne,
        MOCK_ASSET_TWO: assetTwo,
        MOCK_RELEASE_EXISTS: String(value.releaseExists),
        MOCK_TAG_SHA: value.tagSha,
      },
    },
  );
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
    const wrong = path.join(value.root, "wrong.zip");
    await writeFile(wrong, "wrong\n");
    const result = publish(value, wrong, value.checksum);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /existing release asset binding\.zip is not immutable/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("draft release rejects an extra asset before immutable publication", async () => {
  const value = await fixture([
    { id: 1, name: "binding.zip" },
    { id: 2, name: "binding.zip.sha256" },
    { id: 3, name: "unexpected.txt" },
  ], { draft: true, immutable: false });
  try {
    const result = publish(value, value.archive, value.checksum);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unexpected or duplicate assets/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("published immutable release requires exact tag and prerelease metadata", async () => {
  const value = await fixture([
    { id: 1, name: "binding.zip" },
    { id: 2, name: "binding.zip.sha256" },
  ]);
  try {
    const release = JSON.parse(await readFile(value.release, "utf8"));
    release.prerelease = true;
    await writeFile(value.release, `${JSON.stringify(release)}\n`);
    const result = publish(value, value.archive, value.checksum);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /release metadata .* is not exact/);
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
    assert.match(result.stderr, /release tag .* points to .* expected/);
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
