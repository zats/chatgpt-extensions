"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const apiVersion = "0.2.0";
const appVersionPattern = /^\d+(?:\.\d+)+$/;
const appBuildPattern = /^\d+$/;
const digestPattern = /^[a-f0-9]{64}$/;
const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const defaultBindingsRoot = path.join(__dirname, "bindings");
const artifactNames = Object.freeze([
  "host",
  "patch",
  "rendererEntry",
  "rendererAdapterSource",
  "rendererBundle",
]);

function fail(message) {
  throw new Error(message);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${name} has unexpected fields`);
  }
}

function readJsonFile(file, name) {
  let source;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${name} does not exist: ${file}`);
    throw error;
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    fail(`${name} is not valid JSON: ${file}`);
  }
  return { source, value };
}

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

function validateDownloadUrl(version, value) {
  const expected = `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-${version}.zip`;
  if (value !== expected) fail(`Binding ${version} has an invalid download URL`);
  return value;
}

function validateDownloadLength(version, value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`Binding ${version} has an invalid download length`);
  }
  return value;
}

function validateDownloadEdSignature(version, value) {
  if (typeof value !== "string") {
    fail(`Binding ${version} has an invalid download Ed25519 signature`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 64 || decoded.toString("base64") !== value) {
    fail(`Binding ${version} has an invalid download Ed25519 signature`);
  }
  return value;
}

function validateIndexEntry(id, value) {
  if (!plainObject(value)) fail(`Binding index entry ${id} must be an object`);
  exactKeys(
    value,
    [
      "version",
      "appBuild",
      "appAsarSha256",
      "downloadUrl",
      "downloadLength",
      "downloadEdSignature",
    ],
    `Binding index entry ${id}`,
  );
  if (!appVersionPattern.test(id) || value.version !== id) {
    fail(`Binding index entry ${id} has an invalid version`);
  }
  if (!appBuildPattern.test(value.appBuild ?? "")) {
    fail(`Binding index entry ${id} has an invalid app build`);
  }
  if (!digestPattern.test(value.appAsarSha256 ?? "")) {
    fail(`Binding index entry ${id} has an invalid app.asar digest`);
  }
  validateDownloadUrl(id, value.downloadUrl);
  validateDownloadLength(id, value.downloadLength);
  validateDownloadEdSignature(id, value.downloadEdSignature);
  return Object.freeze({
    version: id,
    appBuild: value.appBuild,
    appAsarSha256: value.appAsarSha256,
    downloadUrl: value.downloadUrl,
    downloadLength: value.downloadLength,
    downloadEdSignature: value.downloadEdSignature,
  });
}

function readBindingIndex(options = {}) {
  const bindingsRoot = fs.realpathSync(options.bindingsRoot ?? defaultBindingsRoot);
  const file = path.join(bindingsRoot, "index.json");
  const { value } = readJsonFile(file, "Binding index");
  if (!plainObject(value)) fail("Binding index must be an object");
  exactKeys(value, ["schemaVersion", "current", "bindings"], "Binding index");
  if (value.schemaVersion !== 2 || !plainObject(value.bindings)) {
    fail("Binding index has an unsupported schema");
  }
  const bindings = {};
  for (const [id, entry] of Object.entries(value.bindings)) {
    bindings[id] = validateIndexEntry(id, entry);
  }
  if (!Object.hasOwn(bindings, value.current)) {
    fail("Binding index current version does not exist");
  }
  return Object.freeze({
    file,
    bindingsRoot,
    schemaVersion: 2,
    current: value.current,
    bindings: Object.freeze(bindings),
  });
}

function resolveContainedFile(directory, relativePath, name) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail(`${name} has an invalid path`);
  }
  const candidate = path.resolve(directory, ...relativePath.split("/"));
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${name} does not exist: ${candidate}`);
    throw error;
  }
  const canonicalDirectory = fs.realpathSync(directory);
  if (!resolved.startsWith(`${canonicalDirectory}${path.sep}`)) {
    fail(`${name} escapes its binding directory`);
  }
  if (!fs.statSync(resolved).isFile()) fail(`${name} is not a file`);
  return resolved;
}

function loadArtifact(directory, name, value) {
  if (!plainObject(value)) fail(`Binding artifact ${name} must be an object`);
  exactKeys(value, ["path", "sha256"], `Binding artifact ${name}`);
  if (!digestPattern.test(value.sha256 ?? "")) {
    fail(`Binding artifact ${name} has an invalid digest`);
  }
  const file = resolveContainedFile(directory, value.path, `Binding artifact ${name}`);
  const actual = sha256File(file);
  if (actual !== value.sha256) {
    fail(`Binding artifact ${name} digest does not match its manifest`);
  }
  return Object.freeze({ path: value.path, file, sha256: actual });
}

function loadBindingManifest(manifestFile, options = {}) {
  if (typeof manifestFile !== "string" || !path.isAbsolute(manifestFile)) {
    fail("Binding manifest path must be absolute");
  }
  const canonicalManifest = fs.realpathSync(manifestFile);
  if (!fs.statSync(canonicalManifest).isFile()) fail("Binding manifest is not a file");
  const directory = path.dirname(canonicalManifest);
  const { source, value } = readJsonFile(canonicalManifest, "Binding manifest");
  if (!plainObject(value)) fail("Binding manifest must be an object");
  exactKeys(
    value,
    [
      "schemaVersion",
      "version",
      "appBuild",
      "appAsarSha256",
      "downloadUrl",
      "downloadLength",
      "downloadEdSignature",
      "apiVersion",
      "adapterVersion",
      "artifacts",
    ],
    "Binding manifest",
  );
  if (
    value.schemaVersion !== 2 ||
    !appVersionPattern.test(value.version ?? "") ||
    !appBuildPattern.test(value.appBuild ?? "") ||
    !digestPattern.test(value.appAsarSha256 ?? "") ||
    value.apiVersion !== apiVersion ||
    !semanticVersionPattern.test(value.adapterVersion ?? "") ||
    !plainObject(value.artifacts)
  ) {
    fail("Binding manifest has an unsupported schema or identity");
  }
  validateDownloadUrl(value.version, value.downloadUrl);
  validateDownloadLength(value.version, value.downloadLength);
  validateDownloadEdSignature(value.version, value.downloadEdSignature);
  exactKeys(value.artifacts, artifactNames, "Binding manifest artifacts");
  const artifacts = {};
  for (const name of artifactNames) {
    if (name === "rendererBundle" && options.validateRendererBundle === false) {
      const descriptor = value.artifacts[name];
      if (!plainObject(descriptor)) fail(`Binding artifact ${name} must be an object`);
      exactKeys(descriptor, ["path", "sha256"], `Binding artifact ${name}`);
      if (!digestPattern.test(descriptor.sha256 ?? "")) {
        fail(`Binding artifact ${name} has an invalid digest`);
      }
      artifacts[name] = Object.freeze({
        path: descriptor.path,
        sha256: descriptor.sha256,
      });
    } else {
      artifacts[name] = loadArtifact(directory, name, value.artifacts[name]);
    }
  }
  const binding = Object.freeze({
    manifestFile: canonicalManifest,
    manifestDigest: sha256(source),
    directory,
    apiVersion,
    adapterVersion: value.adapterVersion,
    appVersion: value.version,
    appBuild: value.appBuild,
    appAsarSha256: value.appAsarSha256,
    downloadUrl: value.downloadUrl,
    downloadLength: value.downloadLength,
    downloadEdSignature: value.downloadEdSignature,
    artifacts: Object.freeze(artifacts),
  });
  const expected = options.expectedIndexEntry;
  if (
    expected &&
    (binding.appVersion !== expected.version ||
      binding.appBuild !== expected.appBuild ||
      binding.appAsarSha256 !== expected.appAsarSha256 ||
      binding.downloadUrl !== expected.downloadUrl ||
      binding.downloadLength !== expected.downloadLength ||
      binding.downloadEdSignature !== expected.downloadEdSignature)
  ) {
    fail(`Binding manifest ${binding.appVersion} does not match the binding index`);
  }
  return binding;
}

function loadPublishedBinding(id, options = {}) {
  const index = readBindingIndex(options);
  const entry = index.bindings[id];
  if (!entry) fail(`No published binding exists for ChatGPT ${id}`);
  const directory = path.join(index.bindingsRoot, id);
  const canonicalDirectory = fs.realpathSync(directory);
  if (path.dirname(canonicalDirectory) !== index.bindingsRoot) {
    fail(`Binding ${id} escapes the binding index root`);
  }
  return loadBindingManifest(path.join(canonicalDirectory, "manifest.json"), {
    expectedIndexEntry: entry,
    validateRendererBundle: options.validateRendererBundle,
  });
}

function findPublishedBinding(identity, options = {}) {
  if (!plainObject(identity)) fail("ChatGPT app identity is required");
  const index = readBindingIndex(options);
  const entry = index.bindings[identity.appVersion];
  if (
    !entry ||
    entry.appBuild !== identity.appBuild ||
    entry.appAsarSha256 !== identity.appAsarSha256
  ) {
    fail(
      `No exact binding exists for ChatGPT ${String(identity.appVersion)} (${String(identity.appBuild)})`,
    );
  }
  return loadPublishedBinding(entry.version, {
    bindingsRoot: index.bindingsRoot,
    validateRendererBundle: options.validateRendererBundle,
  });
}

module.exports = Object.freeze({
  apiVersion,
  defaultBindingsRoot,
  findPublishedBinding,
  loadBindingManifest,
  loadPublishedBinding,
  readBindingIndex,
  sha256File,
});
