#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtimeRoot = path.join(repositoryRoot, "runtime");
const finalDirectory = path.join(runtimeRoot, "dist");
const temporaryDirectory = await mkdtemp(path.join(runtimeRoot, ".chatgptx-runtime."));
const require = createRequire(import.meta.url);
const { loadPublishedBinding, readBindingIndex } = require(
  path.join(runtimeRoot, "binding-registry.cjs"),
);

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

try {
  await mkdir(temporaryDirectory, { recursive: true });
  const index = readBindingIndex();
  const builtBindings = [];
  for (const version of Object.keys(index.bindings).sort()) {
    const binding = loadPublishedBinding(version);
    const generatedFile = path.join(temporaryDirectory, `${version}.renderer-host.js`);
    await build({
      absWorkingDir: repositoryRoot,
      bundle: true,
      charset: "utf8",
      entryPoints: [binding.artifacts.rendererEntry.file],
      format: "iife",
      legalComments: "none",
      logLevel: "silent",
      outfile: generatedFile,
      platform: "browser",
      sourcemap: false,
      target: ["chrome151"],
    });
    const generatedDigest = sha256(await readFile(generatedFile));
    if (generatedDigest !== binding.artifacts.rendererBundle.sha256) {
      throw new Error(
        `Binding ${version} renderer bundle is stale: expected ${binding.artifacts.rendererBundle.sha256}, built ${generatedDigest}`,
      );
    }
    builtBindings.push({
      version,
      appBuild: binding.appBuild,
      appAsarSha256: binding.appAsarSha256,
      manifestSha256: binding.manifestDigest,
      rendererBundleSha256: generatedDigest,
    });
    await rm(generatedFile);
  }
  await writeFile(
    path.join(temporaryDirectory, "build-meta.json"),
    `${JSON.stringify({ schemaVersion: 1, bindings: builtBindings }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  await rm(finalDirectory, { recursive: true, force: true });
  await rename(temporaryDirectory, finalDirectory);
} catch (error) {
  await rm(temporaryDirectory, { recursive: true, force: true });
  throw error;
}

console.log(finalDirectory);
