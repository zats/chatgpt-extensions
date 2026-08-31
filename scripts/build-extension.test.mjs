import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildExtension } from "./build-extension.mjs";

async function fixture(source) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chatgptx-builder-"));
  await mkdir(path.join(directory, "src"), { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    `${JSON.stringify({
      name: "@example/main-extension",
      displayName: "Main extension",
      id: "main-extension",
      version: "1.0.0",
      description: "Builder behavior fixture.",
      chatgptx: { api: "0.2.0", main: "dist/main.cjs" },
    }, null, 2)}\n`,
  );
  await writeFile(path.join(directory, "src", "main.ts"), source);
  return directory;
}

async function browserFixture(source = `
  import dependency from "example-dependency";
  export function activate() { return dependency; }
`) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chatgptx-builder-"));
  await mkdir(path.join(directory, "src"), { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    `${JSON.stringify({
      name: "@example/browser-extension",
      displayName: "Browser extension",
      id: "browser-extension",
      version: "1.0.0",
      description: "Browser builder behavior fixture.",
      chatgptx: {
        api: "0.2.0",
        renderer: "dist/renderer.cjs",
        settings: {
          renderer: "dist/settings.cjs",
          sectionId: "browser-extension",
        },
      },
    }, null, 2)}\n`,
  );
  await writeFile(path.join(directory, "src", "renderer.ts"), source);
  await writeFile(path.join(directory, "src", "settings.ts"), source);
  return directory;
}

async function installFixtureDependency(directory) {
  const dependencyDirectory = path.join(
    directory,
    "node_modules",
    "example-dependency",
  );
  await mkdir(dependencyDirectory, { recursive: true });
  await writeFile(
    path.join(dependencyDirectory, "package.json"),
    '{"name":"example-dependency","version":"1.0.0","main":"index.js"}\n',
  );
  await writeFile(
    path.join(dependencyDirectory, "index.js"),
    'module.exports = "bundled-example-dependency";\n',
  );
}

test("main builds bundle package dependencies and keep host modules external", async () => {
  const directory = await fixture(`
    import dependency from "example-dependency";
    import path from "node:path";
    import { app } from "electron";
    export function activate() {
      return [dependency, path.sep, app];
    }
  `);
  try {
    await installFixtureDependency(directory);

    await buildExtension(directory);
    const output = await readFile(path.join(directory, "dist", "main.cjs"), "utf8");
    assert.match(output, /bundled-example-dependency/);
    assert.doesNotMatch(output, /require\(["']example-dependency["']\)/);
    assert.match(output, /require\(["']node:path["']\)/);
    assert.match(output, /require\(["']electron["']\)/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("renderer and settings builds bundle package dependencies", async () => {
  const directory = await browserFixture();
  try {
    await installFixtureDependency(directory);
    await buildExtension(directory);

    for (const outputName of ["renderer.cjs", "settings.cjs"]) {
      const output = await readFile(
        path.join(directory, "dist", outputName),
        "utf8",
      );
      assert.match(output, /bundled-example-dependency/);
      assert.doesNotMatch(output, /require\(["']example-dependency["']\)/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("main builds reject direct objc-js imports", async () => {
  const directory = await fixture(`
    import objc from "objc-js";
    export function activate() { return objc; }
  `);
  try {
    await assert.rejects(
      buildExtension(directory),
      /use MainExtensionContext\.objc/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("main builds reject objc-js subpath imports", async () => {
  const directory = await fixture(`
    import objc from "objc-js/dist/native.js";
    export function activate() { return objc; }
  `);
  try {
    await assert.rejects(
      buildExtension(directory),
      /use MainExtensionContext\.objc/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("browser builds reject direct objc-js imports", async () => {
  const directory = await browserFixture(`
    import objc from "objc-js";
    export function activate() { return objc; }
  `);
  try {
    await assert.rejects(
      buildExtension(directory),
      /use MainExtensionContext\.objc/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
