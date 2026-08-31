"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const EXTENSION_ID = /^[a-z0-9][a-z0-9._-]*$/;

function invalidPath(message = "Invalid extension storage path") {
  return new Error(message);
}

function assertExtensionId(extensionId) {
  if (typeof extensionId !== "string" || !EXTENSION_ID.test(extensionId)) {
    throw new TypeError("Invalid extension id");
  }
}

function pathComponents(relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    throw invalidPath();
  }

  const components = relativePath.split("/");
  if (
    components.some(
      (component) =>
        component.length === 0 || component === "." || component === "..",
    )
  ) {
    throw invalidPath();
  }
  return components;
}

function lstatOrNull(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertDirectory(file, statistics) {
  if (statistics.isSymbolicLink()) {
    throw invalidPath("Extension storage paths must not contain symbolic links");
  }
  if (!statistics.isDirectory()) {
    throw invalidPath("Extension storage parent must be a directory");
  }
}

function assertRegularFile(statistics) {
  if (statistics.isSymbolicLink()) {
    throw invalidPath("Extension storage paths must not contain symbolic links");
  }
  if (!statistics.isFile()) {
    throw invalidPath("Extension storage path must refer to a regular file");
  }
}

function ensureNewDirectoryChain(directory) {
  const missing = [];
  let existing = directory;
  let statistics = lstatOrNull(existing);

  while (!statistics) {
    const parent = path.dirname(existing);
    if (parent === existing) {
      throw invalidPath("Extension storage root has no existing parent");
    }
    missing.push(existing);
    existing = parent;
    statistics = lstatOrNull(existing);
  }

  if (!statistics.isDirectory()) {
    throw invalidPath("Extension storage root parent must be a directory");
  }

  for (const component of missing.reverse()) {
    try {
      fs.mkdirSync(component, { mode: DIRECTORY_MODE });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const created = fs.lstatSync(component);
    assertDirectory(component, created);
    fs.chmodSync(component, DIRECTORY_MODE);
  }
}

function ensureOwnedDirectory(directory) {
  const statistics = lstatOrNull(directory);
  if (!statistics) {
    ensureNewDirectoryChain(directory);
  } else {
    assertDirectory(directory, statistics);
  }
  fs.chmodSync(directory, DIRECTORY_MODE);
  return directory;
}

function createExtensionStorageMain(rootDirectory) {
  if (typeof rootDirectory !== "string" || !path.isAbsolute(rootDirectory)) {
    throw new TypeError("Extension storage root must be an absolute path");
  }

  const storageRoot = path.resolve(rootDirectory);
  ensureOwnedDirectory(storageRoot);

  function extensionRoot(extensionId) {
    assertExtensionId(extensionId);
    ensureOwnedDirectory(storageRoot);
    return ensureOwnedDirectory(path.join(storageRoot, extensionId));
  }

  function resolveFile(extensionId, relativePath, createParents) {
    const root = extensionRoot(extensionId);
    const components = pathComponents(relativePath);
    let directory = root;

    for (const component of components.slice(0, -1)) {
      directory = path.join(directory, component);
      const statistics = lstatOrNull(directory);
      if (!statistics) {
        if (!createParents) {
          return { file: path.join(root, ...components), missingParent: true };
        }
        try {
          fs.mkdirSync(directory, { mode: DIRECTORY_MODE });
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
        }
        const created = fs.lstatSync(directory);
        assertDirectory(directory, created);
      } else {
        assertDirectory(directory, statistics);
      }
      fs.chmodSync(directory, DIRECTORY_MODE);
    }

    const file = path.join(root, ...components);
    const statistics = lstatOrNull(file);
    if (statistics) assertRegularFile(statistics);
    return { file, missingParent: false, statistics };
  }

  function listDirectory(root, directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const statistics = fs.lstatSync(absolute);
      if (statistics.isSymbolicLink()) {
        throw invalidPath(
          "Extension storage paths must not contain symbolic links",
        );
      }
      if (statistics.isDirectory()) {
        fs.chmodSync(absolute, DIRECTORY_MODE);
        files.push(...listDirectory(root, absolute));
      } else if (statistics.isFile()) {
        files.push(path.relative(root, absolute).split(path.sep).join("/"));
      } else {
        throw invalidPath("Extension storage contains a non-file entry");
      }
    }

    return files;
  }

  function listFiles(extensionId) {
    const root = extensionRoot(extensionId);
    return listDirectory(root, root).sort();
  }

  function readTextFile(extensionId, relativePath) {
    const resolved = resolveFile(extensionId, relativePath, false);
    if (resolved.missingParent || !resolved.statistics) return null;
    return fs.readFileSync(resolved.file, "utf8");
  }

  function writeTextFile(extensionId, relativePath, contents) {
    if (typeof contents !== "string") {
      throw new TypeError("Extension storage contents must be a string");
    }
    const { file } = resolveFile(extensionId, relativePath, true);
    const directory = path.dirname(file);
    const temporary = path.join(
      directory,
      `.chatgptx-${process.pid}-${randomUUID()}.tmp`,
    );
    let descriptor;

    try {
      const noFollow = fs.constants.O_NOFOLLOW ?? 0;
      descriptor = fs.openSync(
        temporary,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          noFollow,
        FILE_MODE,
      );
      fs.writeFileSync(descriptor, contents, { encoding: "utf8" });
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.chmodSync(temporary, FILE_MODE);
      fs.renameSync(temporary, file);
      fs.chmodSync(file, FILE_MODE);

      const directoryDescriptor = fs.openSync(directory, fs.constants.O_RDONLY);
      try {
        fs.fsyncSync(directoryDescriptor);
      } finally {
        fs.closeSync(directoryDescriptor);
      }
      return null;
    } finally {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch {}
      }
      try {
        fs.unlinkSync(temporary);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }

  function deleteFile(extensionId, relativePath) {
    const resolved = resolveFile(extensionId, relativePath, false);
    if (resolved.missingParent || !resolved.statistics) return null;
    try {
      fs.unlinkSync(resolved.file);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return null;
  }

  return Object.freeze({
    listFiles,
    readTextFile,
    writeTextFile,
    deleteFile,
  });
}

module.exports = { createExtensionStorageMain };
