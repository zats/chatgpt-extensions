"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { loadBindingManifest, sha256File } = require("./binding-registry.cjs");

const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/;
const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(message);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${name} has unexpected fields`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function validateAbsoluteDirectory(value, name) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail(`${name} must be an absolute directory`);
  }
  const resolved = fs.realpathSync(value);
  if (!fs.statSync(resolved).isDirectory()) fail(`${name} is not a directory`);
  return resolved;
}

function validateAbsoluteFile(value, name) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail(`${name} must be an absolute file`);
  }
  const resolved = fs.realpathSync(value);
  if (!fs.statSync(resolved).isFile()) fail(`${name} is not a file`);
  return resolved;
}

function resolvePackageEntry(directory, relativePath, name) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail(`${name} has an invalid package path`);
  }
  const candidate = path.resolve(directory, ...relativePath.split("/"));
  if (!candidate.startsWith(`${directory}${path.sep}`)) {
    fail(`${name} escapes its package directory`);
  }
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${name} does not exist`);
    throw error;
  }
  if (!resolved.startsWith(`${directory}${path.sep}`)) {
    fail(`${name} escapes its package directory through a symbolic link`);
  }
  if (!fs.statSync(resolved).isFile()) fail(`${name} is not a file`);
  return resolved;
}

function validateManifest(manifest, directory) {
  if (!plainObject(manifest)) fail(`Invalid extension manifest in ${directory}`);
  if (!extensionIdPattern.test(manifest.id ?? "")) {
    fail(`Invalid extension id in ${directory}`);
  }
  for (const key of ["name", "description"]) {
    if (typeof manifest[key] !== "string" || manifest[key].length === 0) {
      fail(`Extension ${key} is required in ${directory}`);
    }
  }
  if (!semanticVersionPattern.test(manifest.version ?? "")) {
    fail(`Invalid extension version in ${directory}`);
  }
  if (!plainObject(manifest.chatgptx) || manifest.chatgptx.api !== "0.2.0") {
    fail(`Extension ${manifest.id} requires an unsupported ChatGPTX API`);
  }
  const declaration = manifest.chatgptx;
  if (
    declaration.main !== undefined && declaration.main !== "main.cjs" ||
    declaration.renderer !== undefined && declaration.renderer !== "renderer.cjs"
  ) {
    fail(`Extension ${manifest.id} has an invalid entry path`);
  }
  if (declaration.settings !== undefined) {
    if (
      !plainObject(declaration.settings) ||
      declaration.settings.renderer !== "settings.cjs" ||
      typeof declaration.settings.sectionId !== "string" ||
      declaration.settings.sectionId.length === 0 ||
      declaration.settings.sectionId.includes(".")
    ) {
      fail(`Extension ${manifest.id} has invalid settings`);
    }
  }
  if (
    declaration.main === undefined &&
    declaration.renderer === undefined &&
    declaration.settings === undefined
  ) {
    fail(`Extension ${manifest.id} has no entries`);
  }
  if (
    declaration.capabilities !== undefined &&
    (!Array.isArray(declaration.capabilities) ||
      declaration.capabilities.some(
        (capability, index) =>
          typeof capability !== "string" ||
          capability.length === 0 ||
          declaration.capabilities.indexOf(capability) !== index,
      ))
  ) {
    fail(`Extension ${manifest.id} has invalid capabilities`);
  }
}

function loadExtension(selection) {
  if (!plainObject(selection) || typeof selection.enabled !== "boolean") {
    fail("Invalid selected extension");
  }
  const directory = validateAbsoluteDirectory(
    selection.packageDirectory,
    "Extension packageDirectory",
  );
  const manifestFile = resolvePackageEntry(directory, "package.json", "Manifest");
  const manifestSource = fs.readFileSync(manifestFile, "utf8");
  const manifest = JSON.parse(manifestSource);
  validateManifest(manifest, directory);
  const main = manifest.chatgptx.main
    ? resolvePackageEntry(directory, manifest.chatgptx.main, `${manifest.id} main entry`)
    : undefined;
  const renderer = manifest.chatgptx.renderer
    ? resolvePackageEntry(
        directory,
        manifest.chatgptx.renderer,
        `${manifest.id} renderer entry`,
      )
    : undefined;
  const settings = manifest.chatgptx.settings
    ? resolvePackageEntry(
        directory,
        manifest.chatgptx.settings.renderer,
        `${manifest.id} settings entry`,
      )
    : undefined;
  const required = manifest.required === true;
  return Object.freeze({
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    manifestDigest: crypto.createHash("sha256").update(manifestSource).digest("hex"),
    packageDirectory: directory,
    enabled: required ? true : selection.enabled,
    required,
    capabilities: Object.freeze([...(manifest.chatgptx.capabilities ?? [])]),
    ...(main ? { main } : {}),
    ...(renderer ? { renderer } : {}),
    ...(settings
      ? {
          settings,
          settingsSectionId: `${manifest.id}.${manifest.chatgptx.settings.sectionId}`,
        }
      : {}),
  });
}

function loadLaunchConfiguration(configurationFile) {
  const file = validateAbsoluteFile(configurationFile, "Launch configuration");
  const value = readJson(file);
  if (
    !plainObject(value) ||
    value.schemaVersion !== 2 ||
    typeof value.bindingManifestFile !== "string" ||
    typeof value.bindingManifestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.bindingManifestSha256) ||
    !Array.isArray(value.extensions)
  ) {
    fail("Invalid v5 launch configuration");
  }
  exactKeys(
    value,
    [
      "schemaVersion",
      "bindingManifestFile",
      "bindingManifestSha256",
      "storageDirectory",
      "extensions",
    ],
    "Launch configuration",
  );
  const bindingManifestFile = validateAbsoluteFile(
    value.bindingManifestFile,
    "Binding manifest",
  );
  if (sha256File(bindingManifestFile) !== value.bindingManifestSha256) {
    fail("Binding manifest digest does not match the launch configuration");
  }
  const bindingManifest = loadBindingManifest(bindingManifestFile);
  if (bindingManifest.manifestDigest !== value.bindingManifestSha256) {
    fail("Binding manifest changed while the launch configuration was loaded");
  }
  const storageDirectory = path.resolve(
    validateAbsoluteDirectory(value.storageDirectory, "Storage directory"),
  );
  const extensions = value.extensions.map(loadExtension).sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const ids = new Set();
  for (const extension of extensions) {
    if (ids.has(extension.id)) fail(`Duplicate extension id: ${extension.id}`);
    ids.add(extension.id);
  }
  return Object.freeze({
    file,
    apiVersion: bindingManifest.apiVersion,
    appVersion: bindingManifest.appVersion,
    appBuild: bindingManifest.appBuild,
    appAsarSha256: bindingManifest.appAsarSha256,
    binding: Object.freeze({
      adapterVersion: bindingManifest.adapterVersion,
      manifestFile: bindingManifest.manifestFile,
      manifestDigest: bindingManifest.manifestDigest,
      directory: bindingManifest.directory,
      hostFile: bindingManifest.artifacts.host.file,
      originalHostDigest: bindingManifest.artifacts.host.sha256,
      patchFile: bindingManifest.artifacts.patch.file,
      patchDigest: bindingManifest.artifacts.patch.sha256,
      rendererHostFile: bindingManifest.artifacts.rendererBundle.file,
      rendererHostDigest: bindingManifest.artifacts.rendererBundle.sha256,
    }),
    storageDirectory,
    extensions: Object.freeze(extensions),
  });
}

function installedExtensions(launch) {
  return Object.freeze(
    launch.extensions.map((extension) =>
      Object.freeze({
        id: extension.id,
        name: extension.name,
        description: extension.description,
        version: extension.version,
        enabled: extension.enabled,
        required: extension.required,
        ...(extension.settingsSectionId
          ? { settingsSectionId: extension.settingsSectionId }
          : {}),
      }),
    ),
  );
}

function writeJsonAtomic(file, value) {
  const directory = path.dirname(file);
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporary, file);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {}
  }
}

function setExtensionEnabled(launch, extensionId, enabled) {
  if (!extensionIdPattern.test(extensionId ?? "")) {
    throw new TypeError("Invalid extension id");
  }
  if (typeof enabled !== "boolean") {
    throw new TypeError("Extension enablement must be boolean");
  }
  const selected = launch.extensions.find((extension) => extension.id === extensionId);
  if (!selected) fail(`Unknown extension: ${extensionId}`);
  if (selected.required && !enabled) fail(`Required extension cannot be disabled: ${extensionId}`);
  const value = readJson(launch.file);
  const selection = value.extensions.find((extension) => {
    try {
      const directory = fs.realpathSync(extension.packageDirectory);
      return directory === selected.packageDirectory;
    } catch {
      return false;
    }
  });
  if (!selection) fail(`Extension selection disappeared: ${extensionId}`);
  selection.enabled = enabled;
  writeJsonAtomic(launch.file, value);
  return loadLaunchConfiguration(launch.file);
}

module.exports = {
  installedExtensions,
  loadLaunchConfiguration,
  setExtensionEnabled,
};
