import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  validateBindingChange,
  validateExistingBinding,
} from "./validate-binding-change.mjs";

const downloadEdSignature = Buffer.alloc(64, 11).toString("base64");

function git(root, ...arguments_) {
  return execFileSync("git", ["-C", root, ...arguments_], { encoding: "utf8" }).trim();
}

async function json(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function repositoryFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "binding-change-test."));
  await mkdir(path.join(root, "runtime", "bindings"), { recursive: true });
  await mkdir(path.join(root, "APIs"), { recursive: true });
  await json(path.join(root, "APIs", "package.json"), { version: "0.2.0" });
  await json(path.join(root, "runtime", "bindings", "index.json"), {
    schemaVersion: 2,
    current: "26.1.0",
    bindings: {
      "26.1.0": {
        version: "26.1.0",
        appBuild: "100",
        appAsarSha256: "b".repeat(64),
        downloadUrl:
          "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.1.0.zip",
        downloadLength: 123456,
        downloadEdSignature,
      },
    },
  });
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  return root;
}

async function addBinding(root, version, mode = "backtest") {
  const directory = path.join(root, "runtime", "bindings", version);
  await mkdir(directory, { recursive: true });
  const host = "exact host\n";
  const hostDigest = crypto.createHash("sha256").update(host).digest("hex");
  await writeFile(path.join(directory, "host.js"), host);
  await writeFile(path.join(directory, "binding.test.mjs"), "// exact test\n");
  await writeFile(path.join(directory, "DERIVATION.md"), "# Derivation\n");
  await mkdir(path.join(root, "APIs", "builds"), { recursive: true });
  await writeFile(path.join(root, "APIs", "builds", `${version}.d.ts`), "export {};\n");
  await writeFile(path.join(root, "APIs", "builds", `${version}.md`), "# Build\n");
  const downloadUrl = `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-${version}.zip`;
  const exact = {
    appBuild: "123",
    downloadUrl,
    downloadLength: 456789,
    downloadEdSignature,
  };
  await json(path.join(directory, "manifest.json"), {
    schemaVersion: 2,
    version,
    appBuild: exact.appBuild,
    appAsarSha256: "a".repeat(64),
    downloadUrl,
    downloadLength: exact.downloadLength,
    downloadEdSignature,
    apiVersion: "0.2.0",
    adapterVersion: "1.0.0",
    artifacts: { host: { path: "host.js", sha256: hostDigest } },
  });
  const indexFile = path.join(root, "runtime", "bindings", "index.json");
  const baseIndex = JSON.parse(await readFile(indexFile, "utf8"));
  const index = {
    schemaVersion: 2,
    current: mode === "current" ? version : "26.1.0",
    bindings: {
      ...baseIndex.bindings,
      [version]: {
        version,
        appBuild: exact.appBuild,
        appAsarSha256: "a".repeat(64),
        downloadUrl,
        downloadLength: exact.downloadLength,
        downloadEdSignature,
      },
    },
  };
  await json(indexFile, index);
  return exact;
}

test("new backtest binding validates without a commit and does not become current", async () => {
  const root = await repositoryFixture();
  try {
    const base = git(root, "rev-parse", "HEAD");
    const exact = await addBinding(root, "26.1.1");
    const result = await validateBindingChange({
      repository: root,
      base,
      version: "26.1.1",
      mode: "backtest",
      ...exact,
    });
    assert.equal(result.version, "26.1.1");
    assert.ok(result.changes.some(({ file }) => file.endsWith("manifest.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("current binding must become the selected index version", async () => {
  const root = await repositoryFixture();
  try {
    const base = git(root, "rev-parse", "HEAD");
    const exact = await addBinding(root, "26.1.1", "backtest");
    await assert.rejects(
      validateBindingChange({
        repository: root,
        base,
        version: "26.1.1",
        mode: "current",
        ...exact,
      }),
      /must select the new binding as current/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a change outside the exact binding scope fails closed", async () => {
  const root = await repositoryFixture();
  try {
    const base = git(root, "rev-parse", "HEAD");
    const exact = await addBinding(root, "26.1.1");
    await writeFile(path.join(root, "README.md"), "forbidden\n");
    await assert.rejects(
      validateBindingChange({
        repository: root,
        base,
        version: "26.1.1",
        mode: "backtest",
        ...exact,
      }),
      /forbidden paths/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const mutation of ["remove", "rewrite"]) {
  test(`new binding rejects an unrelated index ${mutation}`, async () => {
    const root = await repositoryFixture();
    try {
      const base = git(root, "rev-parse", "HEAD");
      const exact = await addBinding(root, "26.1.1");
      const indexFile = path.join(root, "runtime", "bindings", "index.json");
      const index = JSON.parse(await readFile(indexFile, "utf8"));
      if (mutation === "remove") {
        delete index.bindings["26.1.0"];
      } else {
        index.bindings["26.1.0"].appBuild = "101";
      }
      await json(indexFile, index);
      await assert.rejects(
        validateBindingChange({
          repository: root,
          base,
          version: "26.1.1",
          mode: "backtest",
          ...exact,
        }),
        /can change only its exact binding tuple/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("existing backtest validates the exact committed tuple without a change", async () => {
  const root = await repositoryFixture();
  try {
    const exact = await addBinding(root, "26.1.1");
    git(root, "add", ".");
    git(root, "commit", "-qm", "existing binding");
    const revision = git(root, "rev-parse", "HEAD");
    const result = await validateExistingBinding({
      repository: root,
      revision,
      version: "26.1.1",
      ...exact,
    });
    assert.equal(result.noChange, true);
    assert.equal(result.sourceSha, revision);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("current promotion validation requires the selected current version", async () => {
  const root = await repositoryFixture();
  try {
    const exact = await addBinding(root, "26.1.1");
    git(root, "add", ".");
    git(root, "commit", "-qm", "existing backtest binding");
    let revision = git(root, "rev-parse", "HEAD");
    await assert.rejects(
      validateExistingBinding({
        repository: root,
        revision,
        version: "26.1.1",
        requireCurrent: true,
        ...exact,
      }),
      /not the selected current binding/,
    );

    const indexFile = path.join(root, "runtime", "bindings", "index.json");
    const index = JSON.parse(await readFile(indexFile, "utf8"));
    index.current = "26.1.1";
    await json(indexFile, index);
    git(root, "add", "runtime/bindings/index.json");
    git(root, "commit", "-qm", "promote current binding");
    revision = git(root, "rev-parse", "HEAD");
    const result = await validateExistingBinding({
      repository: root,
      revision,
      version: "26.1.1",
      requireCurrent: true,
      ...exact,
    });
    assert.equal(result.sourceSha, revision);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same-build correction preserves the parsed index", async () => {
  const root = await repositoryFixture();
  try {
    const exact = await addBinding(root, "26.1.1", "current");
    git(root, "add", ".");
    git(root, "commit", "-qm", "current binding");
    const base = git(root, "rev-parse", "HEAD");
    const directory = path.join(root, "runtime", "bindings", "26.1.1");
    const host = "corrected exact host\n";
    await writeFile(path.join(directory, "host.js"), host);
    const manifestFile = path.join(directory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.adapterVersion = "1.0.1";
    manifest.artifacts.host.sha256 = crypto.createHash("sha256").update(host).digest("hex");
    await json(manifestFile, manifest);
    const result = await validateBindingChange({
      repository: root,
      base,
      version: "26.1.1",
      mode: "correction",
      ...exact,
    });
    assert.equal(result.adapterVersion, "1.0.1");
    assert.equal(
      result.changes.some(({ file }) => file === "runtime/bindings/index.json"),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("correction can replace a non-current binding without changing the current selection", async () => {
  const root = await repositoryFixture();
  try {
    const exact = await addBinding(root, "26.1.1", "backtest");
    git(root, "add", ".");
    git(root, "commit", "-qm", "historical binding");
    const base = git(root, "rev-parse", "HEAD");
    const directory = path.join(root, "runtime", "bindings", "26.1.1");
    const host = "corrected historical host\n";
    await writeFile(path.join(directory, "host.js"), host);
    const manifestFile = path.join(directory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.adapterVersion = "1.0.1";
    manifest.artifacts.host.sha256 = crypto.createHash("sha256").update(host).digest("hex");
    await json(manifestFile, manifest);

    const result = await validateBindingChange({
      repository: root,
      base,
      version: "26.1.1",
      mode: "correction",
      ...exact,
    });
    const index = JSON.parse(
      await readFile(path.join(root, "runtime", "bindings", "index.json"), "utf8"),
    );
    assert.equal(result.adapterVersion, "1.0.1");
    assert.equal(index.current, "26.1.0");
    assert.equal(
      result.changes.some(({ file }) => file === "runtime/bindings/index.json"),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("head validation reads the candidate while the checkout remains at base", async () => {
  const root = await repositoryFixture();
  try {
    const base = git(root, "rev-parse", "HEAD");
    const exact = await addBinding(root, "26.1.1");
    git(root, "add", ".");
    git(root, "commit", "-qm", "candidate binding");
    const head = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "--detach", base);
    const result = await validateBindingChange({
      repository: root,
      base,
      head,
      version: "26.1.1",
      mode: "backtest",
      ...exact,
    });
    assert.equal(result.head, head);
    assert.equal(git(root, "rev-parse", "HEAD"), base);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate validation rejects a test-file symlink", async () => {
  const root = await repositoryFixture();
  try {
    const base = git(root, "rev-parse", "HEAD");
    const exact = await addBinding(root, "26.1.1");
    const testFile = path.join(root, "runtime", "bindings", "26.1.1", "binding.test.mjs");
    await unlink(testFile);
    await symlink("host.js", testFile);
    await assert.rejects(
      validateBindingChange({
        repository: root,
        base,
        version: "26.1.1",
        mode: "backtest",
        ...exact,
      }),
      /regular file|Git mode/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate validation rejects a test-file gitlink", async () => {
  const root = await repositoryFixture();
  try {
    const base = git(root, "rev-parse", "HEAD");
    const exact = await addBinding(root, "26.1.1");
    const relativeTest = "runtime/bindings/26.1.1/binding.test.mjs";
    git(root, "add", ".");
    await unlink(path.join(root, relativeTest));
    git(root, "update-index", "--force-remove", relativeTest);
    git(root, "update-index", "--add", "--cacheinfo", `160000,${base},${relativeTest}`);
    await assert.rejects(
      validateBindingChange({
        repository: root,
        base,
        version: "26.1.1",
        mode: "backtest",
        ...exact,
      }),
      /Git mode 100644 or 100755/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
