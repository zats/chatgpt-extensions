#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateExistingBinding } from "./validate-binding-change.mjs";

const versionPattern = /^\d+(?:\.\d+)+$/;
const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function git(repository, arguments_, options = {}) {
  return execFileSync("git", ["-C", repository, ...arguments_], {
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio,
  }).trim();
}

export async function packageBindingRelease(options) {
  const repository = path.resolve(options.repository ?? process.cwd());
  if (!versionPattern.test(options.version ?? "")) {
    throw new TypeError("Binding version must be numeric dot-separated components");
  }
  if (!options.source) throw new TypeError("Binding source Git revision is required");
  if (!options.output) throw new TypeError("Binding release output directory is required");
  const sourceSha = git(repository, ["rev-parse", "--verify", `${options.source}^{commit}`]);
  const bindingPath = `runtime/bindings/${options.version}`;
  const manifest = JSON.parse(
    git(repository, ["show", `${sourceSha}:${bindingPath}/manifest.json`]),
  );
  if (
    manifest.schemaVersion !== 2 ||
    manifest.version !== options.version ||
    !semanticVersionPattern.test(manifest.adapterVersion ?? "")
  ) {
    throw new TypeError("Committed binding manifest is invalid");
  }
  const index = JSON.parse(
    git(repository, ["show", `${sourceSha}:runtime/bindings/index.json`]),
  );
  const indexed = index.bindings?.[options.version];
  if (
    index.schemaVersion !== 2 ||
    !indexed ||
    indexed.version !== manifest.version ||
    indexed.appBuild !== manifest.appBuild ||
    indexed.appAsarSha256 !== manifest.appAsarSha256 ||
    indexed.downloadUrl !== manifest.downloadUrl ||
    indexed.downloadLength !== manifest.downloadLength ||
    indexed.downloadEdSignature !== manifest.downloadEdSignature
  ) {
    throw new TypeError("Committed binding index has no exact version entry");
  }
  await validateExistingBinding({
    repository,
    revision: sourceSha,
    version: options.version,
    appBuild: manifest.appBuild,
    downloadUrl: manifest.downloadUrl,
    downloadLength: manifest.downloadLength,
    downloadEdSignature: manifest.downloadEdSignature,
  });
  const tag = `binding-${options.version}-v${manifest.adapterVersion}`;
  const baseName = `chatgpt-binding-${options.version}-v${manifest.adapterVersion}`;
  const outputDirectory = path.resolve(options.output);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const archive = path.join(outputDirectory, `${baseName}.zip`);
  const checksum = `${archive}.sha256`;
  execFileSync(
    "git",
    [
      "-C",
      repository,
      "archive",
      "--format=zip",
      `--prefix=${baseName}/`,
      `--output=${archive}`,
      sourceSha,
      bindingPath,
    ],
    { stdio: "inherit" },
  );
  const sha256 = crypto
    .createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await writeFile(checksum, `${sha256}  ${path.basename(archive)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  const plan = Object.freeze({
    schemaVersion: 2,
    sourceSha,
    version: options.version,
    adapterVersion: manifest.adapterVersion,
    appBuild: manifest.appBuild,
    appAsarSha256: manifest.appAsarSha256,
    downloadUrl: manifest.downloadUrl,
    downloadLength: manifest.downloadLength,
    downloadEdSignature: manifest.downloadEdSignature,
    tag,
    title: `ChatGPT ${options.version} binding v${manifest.adapterVersion}`,
    archive,
    checksum,
    sha256,
  });
  if (options.plan) {
    await writeFile(path.resolve(options.plan), `${JSON.stringify(plan, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
  return plan;
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || index + 1 >= argv.length) throw new Error(`Invalid argument: ${key}`);
    values[key.slice(2)] = argv[++index];
  }
  return {
    repository: values.repository,
    version: values.version,
    source: values.source,
    output: values.output,
    plan: values.plan,
  };
}

async function main() {
  const plan = await packageBindingRelease(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
