#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { expectedDownloadUrl } from "./resolve-appcast-versions.mjs";

const digestPattern = /^[a-f0-9]{64}$/;
const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function validateExactRequest({ version, appBuild, downloadUrl, downloadLength, downloadEdSignature }) {
  if (typeof appBuild !== "string" || !/^\d+$/.test(appBuild)) {
    throw new TypeError("Requested appBuild must be numeric text");
  }
  if (!Number.isSafeInteger(downloadLength) || downloadLength <= 0) {
    throw new TypeError("Requested downloadLength must be a positive safe integer");
  }
  const signature = Buffer.from(downloadEdSignature ?? "", "base64");
  if (signature.length !== 64 || signature.toString("base64") !== downloadEdSignature) {
    throw new TypeError("Requested downloadEdSignature must be canonical Ed25519 base64");
  }
  if (downloadUrl !== expectedDownloadUrl(version)) {
    throw new TypeError("Download URL does not match the exact version");
  }
}

function runGit(repository, arguments_) {
  return execFileSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  }).trim();
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function assertRegularFile(repository, relativeFile, label = relativeFile) {
  if (
    typeof relativeFile !== "string" ||
    relativeFile.length === 0 ||
    path.isAbsolute(relativeFile) ||
    relativeFile.includes("\\") ||
    path.posix.normalize(relativeFile) !== relativeFile ||
    relativeFile.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new TypeError(`${label} has an invalid repository path`);
  }
  let current = repository;
  const parts = relativeFile.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let stats;
    try {
      stats = await lstat(current);
    } catch {
      throw new TypeError(`${label} is missing`);
    }
    const final = index === parts.length - 1;
    if ((final && !stats.isFile()) || (!final && !stats.isDirectory()) || stats.isSymbolicLink()) {
      throw new TypeError(`${label} must be a regular file with regular parent directories`);
    }
  }
  return path.join(repository, ...parts);
}

function parseIndexMode(repository, relativeFile) {
  const output = runGit(repository, ["ls-files", "--stage", "--", relativeFile]);
  if (!output) return undefined;
  const records = output.split("\n");
  if (records.length !== 1) throw new TypeError(`${relativeFile} has unresolved Git stages`);
  const match = /^(\d{6}) [a-f0-9]{40,64} 0\t/.exec(records[0]);
  if (!match) throw new TypeError(`${relativeFile} has invalid Git index metadata`);
  return match[1];
}

function assertAllowedGitMode(relativeFile, mode, type = "blob") {
  if (type !== "blob" || !["100644", "100755"].includes(mode)) {
    throw new TypeError(`${relativeFile} must use Git mode 100644 or 100755`);
  }
}

async function validateCandidateFileTree(repository, version) {
  const bindingPath = `runtime/bindings/${version}`;
  const output = runGit(repository, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    bindingPath,
  ]);
  const bindingFiles = output ? output.split("\n") : [];
  const requiredFiles = [
    `${bindingPath}/manifest.json`,
    `${bindingPath}/DERIVATION.md`,
    `APIs/builds/${version}.d.ts`,
    `APIs/builds/${version}.md`,
    "APIs/package.json",
    "runtime/bindings/index.json",
  ];
  for (const relativeFile of [...new Set([...bindingFiles, ...requiredFiles])]) {
    const mode = parseIndexMode(repository, relativeFile);
    if (mode !== undefined) assertAllowedGitMode(relativeFile, mode);
    await assertRegularFile(repository, relativeFile);
  }
  if (!bindingFiles.includes(`${bindingPath}/manifest.json`)) {
    throw new TypeError("Binding manifest must be a repository file");
  }
  const tests = bindingFiles.filter((file) => /(?:^|\/)\w[^/]*\.test\.(?:mjs|cjs|ts)$/.test(file));
  if (tests.length === 0) {
    throw new TypeError("Binding must contain at least one regular test file");
  }
  return Object.freeze(bindingFiles);
}

function revisionEntries(repository, revision, paths) {
  const output = execFileSync(
    "git",
    [
      "-C",
      repository,
      "ls-tree",
      "-r",
      "-z",
      revision,
      "--",
      ...paths,
    ],
    { encoding: "utf8" },
  );
  const entries = new Map();
  for (const record of output.split("\0").filter(Boolean)) {
    const match = /^(\d{6}) (\w+) [a-f0-9]{40,64}\t(.+)$/.exec(record);
    if (!match) throw new TypeError("Git tree contains invalid metadata");
    entries.set(match[3], { mode: match[1], type: match[2] });
  }
  return entries;
}

async function validateRevisionFileTree(repository, revision, version) {
  const bindingPath = `runtime/bindings/${version}`;
  const apiDeclaration = `APIs/builds/${version}.d.ts`;
  const apiNotes = `APIs/builds/${version}.md`;
  const entries = revisionEntries(repository, revision, [
    bindingPath,
    apiDeclaration,
    apiNotes,
    "APIs/package.json",
    "runtime/bindings/index.json",
  ]);
  const requiredFiles = [
    `${bindingPath}/manifest.json`,
    `${bindingPath}/DERIVATION.md`,
    apiDeclaration,
    apiNotes,
    "APIs/package.json",
    "runtime/bindings/index.json",
  ];
  for (const relativeFile of requiredFiles) {
    if (!entries.has(relativeFile)) throw new TypeError(`${relativeFile} is not committed`);
  }
  for (const [relativeFile, entry] of entries) {
    assertAllowedGitMode(relativeFile, entry.mode, entry.type);
    await assertRegularFile(repository, relativeFile);
  }
  const tests = [...entries.keys()].filter(
    (file) =>
      file.startsWith(`${bindingPath}/`) &&
      /(?:^|\/)\w[^/]*\.test\.(?:mjs|cjs|ts)$/.test(file),
  );
  if (tests.length === 0) {
    throw new TypeError("Committed binding must contain at least one regular test file");
  }
  return entries;
}

function readBaseJson(repository, base, file) {
  try {
    return JSON.parse(runGit(repository, ["show", `${base}:${file}`]));
  } catch {
    return undefined;
  }
}

function changedPaths(repository, base, head) {
  const range = head ? [`${base}..${head}`] : [base];
  const output = runGit(repository, ["diff", "--name-status", "--no-renames", ...range, "--"]);
  const changes = output
    ? output.split("\n").map((line) => {
        const [status, file] = line.split("\t");
        return { status, file };
      })
    : [];
  if (!head) {
    const untracked = runGit(repository, ["ls-files", "--others", "--exclude-standard"]);
    for (const file of untracked ? untracked.split("\n") : []) {
      changes.push({ status: "A", file });
    }
  }
  const unique = new Map();
  for (const change of changes) unique.set(change.file, change);
  return [...unique.values()].sort((left, right) => left.file.localeCompare(right.file));
}

function allowedPath(file, version) {
  return (
    file.startsWith(`runtime/bindings/${version}/`) ||
    file === "runtime/bindings/index.json" ||
    file === `APIs/builds/${version}.d.ts` ||
    file === `APIs/builds/${version}.md`
  );
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function artifactFile(repository, bindingDirectory, artifactPath) {
  if (
    typeof artifactPath !== "string" ||
    artifactPath.length === 0 ||
    path.isAbsolute(artifactPath) ||
    artifactPath.includes("\\") ||
    path.posix.normalize(artifactPath) !== artifactPath ||
    artifactPath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new TypeError(`Invalid binding artifact path: ${artifactPath}`);
  }
  const file = path.join(bindingDirectory, ...artifactPath.split("/"));
  const relative = path.relative(bindingDirectory, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new TypeError(`Binding artifact escapes its binding: ${artifactPath}`);
  }
  return file;
}

async function validateArtifacts(repository, version, manifest) {
  const bindingDirectory = path.join(repository, "runtime", "bindings", version);
  if (!manifest.artifacts || typeof manifest.artifacts !== "object" || Array.isArray(manifest.artifacts)) {
    throw new TypeError("Binding manifest artifacts are required");
  }
  if (!manifest.artifacts.host) throw new TypeError("Binding manifest must identify the host artifact");
  for (const [name, artifact] of Object.entries(manifest.artifacts)) {
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      throw new TypeError(`Invalid binding artifact ${name}`);
    }
    if (!digestPattern.test(artifact.sha256 ?? "")) {
      throw new TypeError(`Binding artifact ${name} has no exact SHA-256 digest`);
    }
    const file = artifactFile(repository, bindingDirectory, artifact.path);
    const relativeFile = path.relative(repository, file).split(path.sep).join("/");
    await assertRegularFile(repository, relativeFile, `Binding artifact ${name}`);
    const actual = crypto.createHash("sha256").update(await readFile(file)).digest("hex");
    if (actual !== artifact.sha256) {
      throw new TypeError(`Binding artifact ${name} digest does not match ${artifact.path}`);
    }
  }
}

async function validateManifest({
  repository,
  version,
  mode,
  appBuild,
  downloadUrl,
  downloadLength,
  downloadEdSignature,
  baseManifest,
}) {
  const bindingDirectory = path.join(repository, "runtime", "bindings", version);
  const manifestFile = path.join(bindingDirectory, "manifest.json");
  await validateCandidateFileTree(repository, version);
  const manifest = await readJson(manifestFile);
  if (manifest.schemaVersion !== 2) throw new TypeError("Binding manifest schemaVersion must be 2");
  if (manifest.version !== version) throw new TypeError("Binding manifest version does not match the request");
  if (manifest.appBuild !== appBuild) throw new TypeError("Binding appBuild does not match the request");
  if (!digestPattern.test(manifest.appAsarSha256 ?? "")) {
    throw new TypeError("Binding appAsarSha256 must be a lowercase SHA-256 digest");
  }
  if (manifest.downloadUrl !== downloadUrl) throw new TypeError("Binding downloadUrl does not match the request");
  if (manifest.downloadLength !== downloadLength) throw new TypeError("Binding downloadLength does not match the request");
  if (manifest.downloadEdSignature !== downloadEdSignature) {
    throw new TypeError("Binding downloadEdSignature does not match the request");
  }
  const api = await readJson(path.join(repository, "APIs", "package.json"));
  if (manifest.apiVersion !== api.version) {
    throw new TypeError(`Binding apiVersion must remain ${api.version}`);
  }
  const adapterMatch = semanticVersionPattern.exec(manifest.adapterVersion ?? "");
  if (!adapterMatch) throw new TypeError("Binding adapterVersion must be semantic");
  if (mode === "correction") {
    const baseMatch = semanticVersionPattern.exec(baseManifest?.adapterVersion ?? "");
    if (!baseMatch) throw new TypeError("Base binding has no semantic adapterVersion");
    if (
      Number(adapterMatch[1]) !== Number(baseMatch[1]) ||
      Number(adapterMatch[2]) !== Number(baseMatch[2]) ||
      Number(adapterMatch[3]) !== Number(baseMatch[3]) + 1
    ) {
      throw new TypeError("Correction must increment the adapter patch version by exactly one");
    }
    if (manifest.apiVersion !== baseManifest.apiVersion) {
      throw new TypeError("Correction cannot change the binding API version");
    }
  } else if (manifest.adapterVersion !== "1.0.0") {
    throw new TypeError("A new binding adapterVersion must be 1.0.0");
  }
  await validateArtifacts(repository, version, manifest);
  return manifest;
}

export async function validateBindingChange(options) {
  const repository = path.resolve(options.repository ?? process.cwd());
  if (options.head) {
    const base = options.base;
    if (!base) throw new TypeError("Base Git revision is required");
    const head = runGit(repository, ["rev-parse", "--verify", `${options.head}^{commit}`]);
    const temporary = await mkdtemp(path.join(os.tmpdir(), "binding-head-validation."));
    const worktree = path.join(temporary, "worktree");
    try {
      runGit(repository, ["worktree", "add", "--detach", worktree, head]);
      const result = await validateBindingChange({
        ...options,
        repository: worktree,
        head: undefined,
      });
      return Object.freeze({ ...result, head });
    } finally {
      try {
        runGit(repository, ["worktree", "remove", "--force", worktree]);
      } catch {
        // The worktree was not installed or was already removed.
      }
      await rm(temporary, { recursive: true, force: true });
    }
  }
  const version = options.version;
  const mode = options.mode;
  if (!["current", "backtest", "correction"].includes(mode)) {
    throw new TypeError("Mode must be current, backtest, or correction");
  }
  const downloadUrl = options.downloadUrl ?? expectedDownloadUrl(version);
  validateExactRequest({
    version,
    appBuild: options.appBuild,
    downloadUrl,
    downloadLength: options.downloadLength,
    downloadEdSignature: options.downloadEdSignature,
  });
  const base = options.base;
  if (!base) throw new TypeError("Base Git revision is required");
  runGit(repository, ["rev-parse", "--verify", `${base}^{commit}`]);

  const relativeManifest = `runtime/bindings/${version}/manifest.json`;
  const baseManifest = readBaseJson(repository, base, relativeManifest);
  if (mode === "correction" && !baseManifest) {
    throw new TypeError("Correction mode requires an existing binding at the base revision");
  }
  if (mode !== "correction" && baseManifest) {
    throw new TypeError("Current and backtest modes require a new binding version");
  }
  const changes = changedPaths(repository, base);
  if (changes.length === 0) throw new TypeError("Binding change is empty");
  const invalid = changes.filter(
    ({ status, file }) => status === "D" || !allowedPath(file, version),
  );
  if (invalid.length > 0) {
    throw new TypeError(
      `Binding change has forbidden paths: ${invalid.map(({ status, file }) => `${status}:${file}`).join(", ")}`,
    );
  }
  if (!changes.some(({ file }) => file === relativeManifest)) {
    throw new TypeError("Binding manifest must change");
  }
  const indexChanged = changes.some(({ file }) => file === "runtime/bindings/index.json");
  if (mode !== "correction" && !indexChanged) {
    throw new TypeError("Binding index must change");
  }

  const manifest = await validateManifest({
    repository,
    version,
    mode,
    appBuild: options.appBuild,
    downloadUrl,
    downloadLength: options.downloadLength,
    downloadEdSignature: options.downloadEdSignature,
    baseManifest,
  });
  const index = await readJson(path.join(repository, "runtime", "bindings", "index.json"));
  if (index.schemaVersion !== 2 || !index.bindings || typeof index.bindings !== "object") {
    throw new TypeError("Binding index schema is invalid");
  }
  const indexed = index.bindings[version];
  if (
    !indexed ||
    indexed.version !== version ||
    indexed.appBuild !== manifest.appBuild ||
    indexed.appAsarSha256 !== manifest.appAsarSha256 ||
    indexed.downloadUrl !== downloadUrl ||
    indexed.downloadLength !== options.downloadLength ||
    indexed.downloadEdSignature !== options.downloadEdSignature
  ) {
    throw new TypeError("Binding index entry does not match the exact manifest");
  }
  const baseIndex = readBaseJson(repository, base, "runtime/bindings/index.json");
  if (!baseIndex || baseIndex.schemaVersion !== 2 || !baseIndex.bindings) {
    throw new TypeError("Base binding index schema is invalid");
  }
  if (mode === "current") {
    if (index.current !== version) throw new TypeError("Current mode must select the new binding as current");
    if (baseIndex?.current && compareVersions(version, baseIndex.current) <= 0) {
      throw new TypeError("Current mode cannot select a historical or equal ChatGPT version");
    }
  } else if (index.current !== baseIndex?.current) {
    throw new TypeError(`${mode} mode cannot change the current binding`);
  }
  if (mode === "correction") {
    const expectedIndex = structuredClone(baseIndex);
    expectedIndex.bindings[version] = indexed;
    if (!isDeepStrictEqual(index, expectedIndex)) {
      throw new TypeError("Correction can change only its exact binding index tuple");
    }
    const tupleChanged = !isDeepStrictEqual(baseIndex.bindings[version], indexed);
    if (tupleChanged !== indexChanged) {
      throw new TypeError(
        tupleChanged
          ? "Correction must update its changed exact binding index tuple"
          : "Correction cannot rewrite an unchanged binding index",
      );
    }
  } else {
    const expectedIndex = structuredClone(baseIndex);
    expectedIndex.bindings[version] = indexed;
    if (mode === "current") expectedIndex.current = version;
    if (!isDeepStrictEqual(index, expectedIndex)) {
      throw new TypeError(
        `${mode} mode can change only its exact binding tuple and current selector`,
      );
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    base: runGit(repository, ["rev-parse", `${base}^{commit}`]),
    mode,
    version,
    appBuild: manifest.appBuild,
    adapterVersion: manifest.adapterVersion,
    appAsarSha256: manifest.appAsarSha256,
    downloadLength: manifest.downloadLength,
    downloadEdSignature: manifest.downloadEdSignature,
    changes: Object.freeze(changes),
  });
}

export async function validateExistingBinding(options) {
  const repository = path.resolve(options.repository ?? process.cwd());
  const version = options.version;
  const downloadUrl = options.downloadUrl ?? expectedDownloadUrl(version);
  validateExactRequest({
    version,
    appBuild: options.appBuild,
    downloadUrl,
    downloadLength: options.downloadLength,
    downloadEdSignature: options.downloadEdSignature,
  });
  if (!options.revision) throw new TypeError("Existing-binding revision is required");
  const sourceSha = runGit(repository, [
    "rev-parse",
    "--verify",
    `${options.revision}^{commit}`,
  ]);
  if (runGit(repository, ["rev-parse", "HEAD^{commit}"]) !== sourceSha) {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "existing-binding-validation."));
    const worktree = path.join(temporary, "worktree");
    try {
      runGit(repository, ["worktree", "add", "--detach", worktree, sourceSha]);
      return await validateExistingBinding({
        ...options,
        repository: worktree,
        revision: sourceSha,
      });
    } finally {
      try {
        runGit(repository, ["worktree", "remove", "--force", worktree]);
      } catch {
        // The worktree was not installed or was already removed.
      }
      await rm(temporary, { recursive: true, force: true });
    }
  }
  await validateRevisionFileTree(repository, sourceSha, version);
  const manifest = readBaseJson(
    repository,
    sourceSha,
    `runtime/bindings/${version}/manifest.json`,
  );
  if (
    !manifest ||
    manifest.schemaVersion !== 2 ||
    manifest.version !== version ||
    manifest.appBuild !== options.appBuild ||
    manifest.downloadUrl !== downloadUrl ||
    manifest.downloadLength !== options.downloadLength ||
    manifest.downloadEdSignature !== options.downloadEdSignature ||
    !digestPattern.test(manifest.appAsarSha256 ?? "") ||
    !semanticVersionPattern.test(manifest.adapterVersion ?? "")
  ) {
    throw new TypeError("Existing binding manifest does not match the exact request");
  }
  const api = await readJson(path.join(repository, "APIs", "package.json"));
  if (manifest.apiVersion !== api.version) {
    throw new TypeError("Existing binding does not use the current public API");
  }
  const index = readBaseJson(repository, sourceSha, "runtime/bindings/index.json");
  const indexed = index?.bindings?.[version];
  if (
    index?.schemaVersion !== 2 ||
    !indexed ||
    indexed.version !== version ||
    indexed.appBuild !== manifest.appBuild ||
    indexed.appAsarSha256 !== manifest.appAsarSha256 ||
    indexed.downloadUrl !== downloadUrl ||
    indexed.downloadLength !== options.downloadLength ||
    indexed.downloadEdSignature !== options.downloadEdSignature
  ) {
    throw new TypeError("Existing binding index entry does not match its manifest");
  }
  if (options.requireCurrent === true && index.current !== version) {
    throw new TypeError("Existing binding is not the selected current binding");
  }
  await validateArtifacts(repository, version, manifest);
  if (runGit(repository, ["status", "--porcelain", "--untracked-files=all"])) {
    throw new TypeError("Existing-binding validation path must not change repository files");
  }
  return Object.freeze({
    schemaVersion: 1,
    sourceSha,
    version,
    appBuild: manifest.appBuild,
    adapterVersion: manifest.adapterVersion,
    appAsarSha256: manifest.appAsarSha256,
    downloadLength: manifest.downloadLength,
    downloadEdSignature: manifest.downloadEdSignature,
    noChange: true,
  });
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || index + 1 >= argv.length) throw new Error(`Invalid argument: ${key}`);
    options[key.slice(2)] = argv[++index];
  }
  return {
    repository: options.repository,
    base: options.base,
    head: options.head,
    version: options.version,
    mode: options.mode,
    appBuild: options["app-build"],
    downloadUrl: options["download-url"],
    downloadLength: Number(options["download-length"]),
    downloadEdSignature: options["download-ed-signature"],
    existing: options.existing === "true",
    requireCurrent: options["require-current"] === "true",
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = options.existing
    ? await validateExistingBinding({
        repository: options.repository,
        revision: options.base,
        version: options.version,
        appBuild: options.appBuild,
        downloadUrl: options.downloadUrl,
        downloadLength: options.downloadLength,
        downloadEdSignature: options.downloadEdSignature,
        requireCurrent: options.requireCurrent,
      })
    : await validateBindingChange(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
