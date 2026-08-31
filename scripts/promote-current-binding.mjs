#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { expectedDownloadUrl } from "./resolve-appcast-versions.mjs";

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
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

export async function promoteCurrentBinding(options) {
  const repository = path.resolve(options.repository ?? process.cwd());
  if (typeof options.version !== "string" || !/^\d+(?:\.\d+)+$/.test(options.version)) {
    throw new TypeError("Promotion version must be numeric dot-separated text");
  }
  if (typeof options.appBuild !== "string" || !/^\d+$/.test(options.appBuild)) {
    throw new TypeError("Promotion app build must be numeric text");
  }
  if (options.downloadUrl !== expectedDownloadUrl(options.version)) {
    throw new TypeError("Promotion download URL does not match the exact version");
  }
  if (!Number.isSafeInteger(options.downloadLength) || options.downloadLength <= 0) {
    throw new TypeError("Promotion download length must be a positive safe integer");
  }
  const signature = Buffer.from(options.downloadEdSignature ?? "", "base64");
  if (
    signature.length !== 64 ||
    signature.toString("base64") !== options.downloadEdSignature
  ) {
    throw new TypeError("Promotion download signature must be canonical Ed25519 base64");
  }
  const indexFile = path.join(repository, "runtime", "bindings", "index.json");
  const index = JSON.parse(await readFile(indexFile, "utf8"));
  if (!exactKeys(index, ["schemaVersion", "current", "bindings"]) || index.schemaVersion !== 2) {
    throw new TypeError("Binding index schema is invalid");
  }
  const entry = index.bindings?.[options.version];
  if (
    !entry ||
    entry.version !== options.version ||
    entry.appBuild !== options.appBuild ||
    entry.downloadUrl !== options.downloadUrl ||
    entry.downloadLength !== options.downloadLength ||
    entry.downloadEdSignature !== options.downloadEdSignature ||
    typeof entry.appAsarSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(entry.appAsarSha256)
  ) {
    throw new TypeError("Promotion target does not match the exact indexed binding");
  }
  if (index.current === options.version) {
    return Object.freeze({ changed: false, version: options.version });
  }
  if (
    typeof index.current !== "string" ||
    !/^\d+(?:\.\d+)+$/.test(index.current) ||
    compareVersions(options.version, index.current) <= 0
  ) {
    throw new TypeError("Current promotion cannot select an older or equal binding");
  }
  const promoted = { ...index, current: options.version };
  await writeFile(indexFile, `${JSON.stringify(promoted, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return Object.freeze({ changed: true, version: options.version });
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || index + 1 >= argv.length) {
      throw new Error(`Invalid argument: ${key}`);
    }
    values[key.slice(2)] = argv[++index];
  }
  return {
    repository: values.repository,
    version: values.version,
    appBuild: values["app-build"],
    downloadUrl: values["download-url"],
    downloadLength: Number(values["download-length"]),
    downloadEdSignature: values["download-ed-signature"],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  promoteCurrentBinding(parseArguments(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${String(error?.message ?? error)}\n`);
      process.exitCode = 1;
    });
}
