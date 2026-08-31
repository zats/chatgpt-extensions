import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { packageBindingRelease } from "./package-binding-release.mjs";

function git(root, ...arguments_) {
  return execFileSync("git", ["-C", root, ...arguments_], { encoding: "utf8" }).trim();
}

const signature = Buffer.alloc(64, 5).toString("base64");
const exact = {
  version: "26.1.2",
  appBuild: "123",
  appAsarSha256: "a".repeat(64),
  downloadUrl:
    "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.1.2.zip",
  downloadLength: 123456,
  downloadEdSignature: signature,
};

async function fixture(treeKind = "regular") {
  const root = await mkdtemp(path.join(os.tmpdir(), "binding-release-test."));
  const binding = path.join(root, "runtime", "bindings", "26.1.2");
  await mkdir(binding, { recursive: true });
  await mkdir(path.join(root, "APIs", "builds"), { recursive: true });
  await writeFile(path.join(root, "APIs", "package.json"), '{"version":"0.2.0"}\n');
  await writeFile(path.join(root, "APIs", "builds", "26.1.2.d.ts"), "export {};\n");
  await writeFile(path.join(root, "APIs", "builds", "26.1.2.md"), "# Build\n");
  await writeFile(path.join(binding, "host.js"), "host\n");
  await writeFile(path.join(binding, "binding.test.mjs"), "// test\n");
  await writeFile(path.join(binding, "DERIVATION.md"), "# Derivation\n");
  const hostSha256 = crypto.createHash("sha256").update("host\n").digest("hex");
  await writeFile(
    path.join(binding, "manifest.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      ...exact,
      apiVersion: "0.2.0",
      adapterVersion: "1.0.0",
      artifacts: { host: { path: "host.js", sha256: hostSha256 } },
    })}\n`,
  );
  await writeFile(
    path.join(root, "runtime", "bindings", "index.json"),
    `${JSON.stringify({ schemaVersion: 2, current: "26.1.2", bindings: { "26.1.2": exact } })}\n`,
  );
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  if (treeKind === "symlink") {
    await unlink(path.join(binding, "binding.test.mjs"));
    await symlink("host.js", path.join(binding, "binding.test.mjs"));
  }
  git(root, "add", ".");
  if (treeKind === "gitlink") {
    const seedFile = path.join(root, "seed.txt");
    await writeFile(seedFile, "seed\n");
    git(root, "add", "seed.txt");
    git(root, "commit", "-qm", "seed");
    const seed = git(root, "rev-parse", "HEAD");
    const relativeTest = "runtime/bindings/26.1.2/binding.test.mjs";
    await unlink(path.join(root, relativeTest));
    git(root, "update-index", "--force-remove", relativeTest);
    git(root, "update-index", "--add", "--cacheinfo", `160000,${seed},${relativeTest}`);
  }
  git(root, "commit", "-qm", "binding");
  return root;
}

test("binding archive is deterministic for one exact source commit", async () => {
  const root = await fixture();
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "binding-release-output."));
  try {
    const source = git(root, "rev-parse", "HEAD");
    const first = await packageBindingRelease({
      repository: root,
      version: "26.1.2",
      source,
      output: path.join(outputRoot, "first"),
    });
    const second = await packageBindingRelease({
      repository: root,
      version: "26.1.2",
      source,
      output: path.join(outputRoot, "second"),
    });
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(await readFile(first.archive), await readFile(second.archive));
    assert.equal(first.tag, "binding-26.1.2-v1.0.0");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("current trusted packager can package an exact historical binding source", async () => {
  const root = await fixture();
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "binding-release-output."));
  try {
    const source = git(root, "rev-parse", "HEAD");
    await writeFile(path.join(root, "later.txt"), "later trusted automation\n");
    git(root, "add", "later.txt");
    git(root, "commit", "-qm", "later automation");
    assert.notEqual(git(root, "rev-parse", "HEAD"), source);
    const plan = await packageBindingRelease({
      repository: root,
      version: "26.1.2",
      source,
      output: outputRoot,
    });
    assert.equal(plan.sourceSha, source);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
  }
});

for (const treeKind of ["symlink", "gitlink"]) {
  test(`binding archive rejects a ${treeKind} in the committed binding tree`, async () => {
    const root = await fixture(treeKind);
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "binding-release-output."));
    try {
      await assert.rejects(
        packageBindingRelease({
          repository: root,
          version: "26.1.2",
          source: git(root, "rev-parse", "HEAD"),
          output: outputRoot,
        }),
        /Git mode 100644 or 100755|regular file/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
}
