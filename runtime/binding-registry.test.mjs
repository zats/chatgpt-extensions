import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import registry from "./binding-registry.cjs";

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const currentDirectory = path.join(runtimeRoot, "bindings", "26.825.51511");

test("published binding resolves only the exact app version, build, and app.asar digest", () => {
  const index = registry.readBindingIndex();
  const expected = index.bindings[index.current];
  const binding = registry.findPublishedBinding({
    appVersion: expected.version,
    appBuild: expected.appBuild,
    appAsarSha256: expected.appAsarSha256,
  });
  assert.equal(binding.appVersion, expected.version);
  assert.equal(binding.appBuild, expected.appBuild);
  assert.equal(binding.appAsarSha256, expected.appAsarSha256);
  assert.equal(binding.downloadLength, expected.downloadLength);
  assert.equal(binding.downloadEdSignature, expected.downloadEdSignature);
  assert.equal(binding.artifacts.host.sha256, registry.sha256File(binding.artifacts.host.file));

  const exactIdentity = {
    appVersion: expected.version,
    appBuild: expected.appBuild,
    appAsarSha256: expected.appAsarSha256,
  };
  for (const identity of [
    { ...exactIdentity, appVersion: "26.825.51512" },
    { ...exactIdentity, appBuild: "7378" },
    { ...exactIdentity, appAsarSha256: "0".repeat(64) },
  ]) {
    assert.throws(() => registry.findPublishedBinding(identity), /No exact binding exists/);
  }
});

test("candidate binding rejects modified and escaping artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chatgptx-binding-"));
  const bindingDirectory = path.join(root, "binding");
  try {
    await cp(currentDirectory, bindingDirectory, { recursive: true });
    const manifestFile = path.join(bindingDirectory, "manifest.json");
    assert.equal(registry.loadBindingManifest(manifestFile).appVersion, "26.825.51511");

    await writeFile(path.join(bindingDirectory, "host.js"), "modified\n");
    assert.throws(() => registry.loadBindingManifest(manifestFile), /digest does not match/);

    await rm(bindingDirectory, { recursive: true, force: true });
    await cp(currentDirectory, bindingDirectory, { recursive: true });
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.artifacts.host.path = "../outside.js";
    await writeFile(path.join(root, "outside.js"), "outside\n");
    await writeFile(manifestFile, JSON.stringify(manifest));
    assert.throws(() => registry.loadBindingManifest(manifestFile), /invalid path/);

    await rm(bindingDirectory, { recursive: true, force: true });
    await cp(currentDirectory, bindingDirectory, { recursive: true });
    const outside = path.join(root, "outside-host.js");
    await writeFile(outside, await readFile(path.join(bindingDirectory, "host.js")));
    await rm(path.join(bindingDirectory, "host.js"));
    await symlink(outside, path.join(bindingDirectory, "host.js"));
    assert.throws(() => registry.loadBindingManifest(manifestFile), /escapes its binding directory/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("binding index uses the stable public schema", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chatgptx-index-"));
  try {
    const source = JSON.parse(
      await readFile(path.join(runtimeRoot, "bindings", "index.json"), "utf8"),
    );
    assert.equal(source.schemaVersion, 2);
    const indexFile = path.join(root, "index.json");
    source.extra = true;
    await writeFile(indexFile, JSON.stringify(source));
    assert.throws(
      () => registry.readBindingIndex({ bindingsRoot: root }),
      /unexpected fields/,
    );

    delete source.extra;
    source.bindings[source.current].downloadLength = 0;
    await writeFile(indexFile, JSON.stringify(source));
    assert.throws(
      () => registry.readBindingIndex({ bindingsRoot: root }),
      /invalid download length/,
    );

    source.bindings[source.current].downloadLength = 595263123;
    source.bindings[source.current].downloadEdSignature = "not-a-signature";
    await writeFile(indexFile, JSON.stringify(source));
    assert.throws(
      () => registry.readBindingIndex({ bindingsRoot: root }),
      /invalid download Ed25519 signature/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
