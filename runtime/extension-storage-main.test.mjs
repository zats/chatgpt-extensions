import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createExtensionStorageMain } from "./extension-storage-main.cjs";

function fixture(t) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "chatgptx-v5-storage-"),
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "parents", "storage");
  return {
    root,
    storage: createExtensionStorageMain(root),
    temporary,
  };
}

function permissions(file) {
  return fs.statSync(file).mode & 0o777;
}

test("creates private roots and parents and replaces files atomically", (t) => {
  const { root, storage } = fixture(t);
  assert.equal(permissions(path.dirname(root)), 0o700);
  assert.equal(permissions(root), 0o700);

  assert.equal(
    storage.writeTextFile("colors", "nested/deeper/value.txt", "before"),
    null,
  );
  const extensionRoot = path.join(root, "colors");
  const nested = path.join(extensionRoot, "nested");
  const deeper = path.join(nested, "deeper");
  const file = path.join(deeper, "value.txt");
  assert.equal(permissions(extensionRoot), 0o700);
  assert.equal(permissions(nested), 0o700);
  assert.equal(permissions(deeper), 0o700);
  assert.equal(permissions(file), 0o600);

  fs.chmodSync(file, 0o644);
  const oldDescriptor = fs.openSync(file, "r");
  try {
    storage.writeTextFile("colors", "nested/deeper/value.txt", "after");
    assert.equal(fs.readFileSync(oldDescriptor, "utf8"), "before");
  } finally {
    fs.closeSync(oldDescriptor);
  }
  assert.equal(fs.readFileSync(file, "utf8"), "after");
  assert.equal(permissions(file), 0o600);
  assert.deepEqual(
    fs.readdirSync(deeper).filter((name) => name.includes(".chatgptx-")),
    [],
  );
});

test("reads UTF-8 and uses null for a missing read and successful delete", (t) => {
  const { storage } = fixture(t);
  const value = "café 🟣 \u0000 is text, not a NUL byte";

  storage.writeTextFile("reactions", "settings.txt", value);
  assert.equal(storage.readTextFile("reactions", "settings.txt"), value);
  assert.equal(storage.readTextFile("reactions", "missing.txt"), null);
  assert.equal(storage.readTextFile("reactions", "missing/child.txt"), null);
  assert.equal(storage.deleteFile("reactions", "missing.txt"), null);
  assert.equal(storage.deleteFile("reactions", "missing/child.txt"), null);
  assert.equal(storage.deleteFile("reactions", "settings.txt"), null);
  assert.equal(storage.readTextFile("reactions", "settings.txt"), null);
});

test("lists files with deterministic Unicode code-unit order", (t) => {
  const { storage } = fixture(t);
  const files = [
    "z.txt",
    "a.txt",
    "ä.txt",
    "\ud83d\ude00.txt",
    "\ue000.txt",
    "nested/b.txt",
  ];
  for (const file of files) storage.writeTextFile("colors", file, file);

  assert.deepEqual(storage.listFiles("colors"), [...files].sort());
});

test("rejects invalid extension ids", (t) => {
  const { storage } = fixture(t);
  for (const extensionId of [
    "",
    "Uppercase",
    "-leading",
    "../escape",
    "nested/id",
    "nul\0id",
  ]) {
    assert.throws(
      () => storage.listFiles(extensionId),
      /Invalid extension id/,
      extensionId,
    );
  }
});

test("rejects absolute, dot, dotdot, backslash, empty, and NUL paths", (t) => {
  const { storage } = fixture(t);
  const invalid = [
    "",
    "/absolute.txt",
    ".",
    "..",
    "folder/./file.txt",
    "folder/../file.txt",
    "../file.txt",
    "folder//file.txt",
    "folder/",
    "folder\\file.txt",
    "folder\\..\\file.txt",
    "nul\0file.txt",
  ];

  for (const file of invalid) {
    assert.throws(
      () => storage.writeTextFile("colors", file, "value"),
      /Invalid extension storage path/,
      JSON.stringify(file),
    );
  }
});

test("rejects symbolic links to existing files", (t) => {
  const { root, storage, temporary } = fixture(t);
  storage.writeTextFile("colors", "seed.txt", "seed");
  const outside = path.join(temporary, "outside.txt");
  fs.writeFileSync(outside, "outside", "utf8");
  const link = path.join(root, "colors", "linked.txt");
  fs.symlinkSync(outside, link);

  assert.throws(
    () => storage.readTextFile("colors", "linked.txt"),
    /symbolic links/,
  );
  assert.throws(
    () => storage.writeTextFile("colors", "linked.txt", "changed"),
    /symbolic links/,
  );
  assert.throws(
    () => storage.deleteFile("colors", "linked.txt"),
    /symbolic links/,
  );
  assert.throws(() => storage.listFiles("colors"), /symbolic links/);
  assert.equal(fs.readFileSync(outside, "utf8"), "outside");
});

test("rejects missing descendants through an in-root symbolic link", (t) => {
  const { root, storage, temporary } = fixture(t);
  storage.listFiles("reactions");
  const outside = path.join(temporary, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, "reactions", "linked"));

  assert.throws(
    () => storage.readTextFile("reactions", "linked/missing.txt"),
    /symbolic links/,
  );
  assert.throws(
    () => storage.writeTextFile("reactions", "linked/missing.txt", "value"),
    /symbolic links/,
  );
  assert.throws(
    () => storage.deleteFile("reactions", "linked/missing.txt"),
    /symbolic links/,
  );
  assert.equal(fs.existsSync(path.join(outside, "missing.txt")), false);
});

test("rejects a symbolic-link storage root", (t) => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "chatgptx-v5-storage-root-"),
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const target = path.join(temporary, "target");
  const link = path.join(temporary, "storage");
  fs.mkdirSync(target);
  fs.symlinkSync(target, link);

  assert.throws(() => createExtensionStorageMain(link), /symbolic links/);
});
