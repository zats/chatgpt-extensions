#!/usr/bin/env node

import {
  access,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(scriptDirectory);
const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const rejectObjcJsImport = {
  name: "reject-host-objc-import",
  setup(buildContext) {
    buildContext.onResolve({ filter: /^objc-js(?:\/|$)/ }, () => ({
      errors: [
        {
          text:
            "Importing objc-js is unsupported; use MainExtensionContext.objc from a main entry",
        },
      ],
    }));
  },
};

function fail(message) {
  throw new Error(message);
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function validateManifest(manifest, directory) {
  if (!extensionIdPattern.test(manifest.id ?? "")) {
    fail(`Invalid extension id in ${directory}`);
  }
  if (typeof manifest.name !== "string" || manifest.name.length === 0) {
    fail(`npm package name is required in ${directory}`);
  }
  if (
    typeof manifest.displayName !== "string" ||
    manifest.displayName.length === 0
  ) {
    fail(`Extension display name is required in ${directory}`);
  }
  if (
    typeof manifest.description !== "string" ||
    manifest.description.length === 0
  ) {
    fail(`Extension description is required in ${directory}`);
  }
  if (!semverPattern.test(manifest.version ?? "")) {
    fail(`Extension version must be semantic in ${directory}`);
  }
  if (
    !manifest.chatgptx ||
    typeof manifest.chatgptx !== "object" ||
    !semverPattern.test(manifest.chatgptx.api ?? "")
  ) {
    fail(`Extension chatgptx manifest is incomplete in ${directory}`);
  }
  if (
    manifest.chatgptx.main !== undefined &&
    manifest.chatgptx.main !== "dist/main.cjs"
  ) {
    fail(`Main output must be dist/main.cjs in ${directory}`);
  }
  if (
    manifest.chatgptx.renderer !== undefined &&
    manifest.chatgptx.renderer !== "dist/renderer.cjs"
  ) {
    fail(`Renderer output must be dist/renderer.cjs in ${directory}`);
  }
  const capabilities = manifest.chatgptx.capabilities;
  if (
    capabilities !== undefined &&
    (!Array.isArray(capabilities) ||
      capabilities.some(
        (capability, index) =>
          typeof capability !== "string" ||
          capability.length === 0 ||
          capabilities.indexOf(capability) !== index,
      ))
  ) {
    fail(`Extension capabilities are invalid in ${directory}`);
  }
  const settings = manifest.chatgptx.settings;
  if (
    settings !== undefined &&
    (typeof settings !== "object" ||
      settings.renderer !== "dist/settings.cjs" ||
      typeof settings.sectionId !== "string" ||
      settings.sectionId.length === 0 ||
      settings.sectionId.includes("."))
  ) {
    fail(`Extension settings declaration is invalid in ${directory}`);
  }
  if (
    manifest.chatgptx.main === undefined &&
    manifest.chatgptx.renderer === undefined &&
    settings === undefined
  ) {
    fail(`At least one extension entry is required in ${directory}`);
  }
}

async function buildBrowserEntry({
  entryPath,
  output,
  phase,
}) {
  if (!(await exists(entryPath))) {
    fail(`Missing ${phase} source: ${entryPath}`);
  }
  return build({
    absWorkingDir: repositoryRoot,
    bundle: true,
    charset: "utf8",
    format: "cjs",
    legalComments: "none",
    logLevel: "info",
    metafile: true,
    outfile: output,
    platform: "browser",
    plugins: [rejectObjcJsImport],
    sourcemap: "external",
    entryPoints: [entryPath],
    target: ["chrome151"],
  });
}

async function buildMainEntry({ entryPath, output }) {
  if (!(await exists(entryPath))) {
    fail(`Missing main source: ${entryPath}`);
  }
  return build({
    absWorkingDir: repositoryRoot,
    bundle: true,
    charset: "utf8",
    entryPoints: [entryPath],
    external: [
      "node:*",
      "electron",
      "electron/main",
      "electron/common",
    ],
    format: "cjs",
    legalComments: "none",
    logLevel: "info",
    metafile: true,
    outfile: output,
    platform: "node",
    plugins: [rejectObjcJsImport],
    sourcemap: "external",
    target: ["node24"],
  });
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function buildExtension(requestedDirectory) {
  const directory = path.resolve(requestedDirectory);
  const manifestFile = path.join(directory, "package.json");
  const manifest = await readJson(manifestFile);
  validateManifest(manifest, directory);

  const temporaryDirectory = await mkdtemp(
    path.join(directory, ".chatgptx-dist."),
  );
  const finalDirectory = path.join(directory, "dist");
  try {
    const main = manifest.chatgptx.main
      ? await buildMainEntry({
          entryPath: path.join(directory, "src", "main.ts"),
          output: path.join(temporaryDirectory, "main.cjs"),
        })
      : undefined;
    const renderer = manifest.chatgptx.renderer
      ? await buildBrowserEntry({
          entryPath: path.join(directory, "src", "renderer.ts"),
          output: path.join(temporaryDirectory, "renderer.cjs"),
          phase: "renderer",
        })
      : undefined;
    let settings;
    if (manifest.chatgptx.settings) {
      settings = await buildBrowserEntry({
        entryPath: path.join(directory, "src", "settings.ts"),
        output: path.join(temporaryDirectory, "settings.cjs"),
        phase: "settings",
      });
    }
    const packagedManifest = {
      id: manifest.id,
      name: manifest.displayName,
      version: manifest.version,
      description: manifest.description,
      ...(manifest.required === true ? { required: true } : {}),
      chatgptx: {
        ...manifest.chatgptx,
        ...(main ? { main: "main.cjs" } : {}),
        ...(renderer ? { renderer: "renderer.cjs" } : {}),
        ...(manifest.chatgptx.settings
          ? {
              settings: {
                ...manifest.chatgptx.settings,
                renderer: "settings.cjs",
              },
            }
          : {}),
      },
    };
    await writeJson(
      path.join(temporaryDirectory, "package.json"),
      packagedManifest,
    );
    await writeJson(path.join(temporaryDirectory, "build-meta.json"), {
      ...(main ? { main: main.metafile } : {}),
      ...(renderer ? { renderer: renderer.metafile } : {}),
      ...(settings ? { settings: settings.metafile } : {}),
    });
    await rm(finalDirectory, { force: true, recursive: true });
    await rename(temporaryDirectory, finalDirectory);
  } catch (error) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    throw error;
  }

  return { id: manifest.id, outputDirectory: finalDirectory };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const requestedDirectory = process.argv[2];
  if (!requestedDirectory) {
    console.error(
      "usage: node scripts/build-extension.mjs <extension-directory>",
    );
    process.exit(64);
  }
  if (process.argv.length > 3) {
    fail("Unexpected build arguments");
  }
  const result = await buildExtension(requestedDirectory);
  console.log(JSON.stringify(result));
}
