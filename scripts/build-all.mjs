#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildExtension } from "./build-extension.mjs";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extensionsRoot = path.join(repositoryRoot, "extensions");
if (process.argv.length > 2) {
  throw new Error("Unexpected build arguments");
}
const entries = await readdir(extensionsRoot, { withFileTypes: true });
const directories = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(extensionsRoot, entry.name))
  .sort();

for (const directory of directories) {
  const result = await buildExtension(directory);
  console.log(`${result.id}: ${result.outputDirectory}`);
}
