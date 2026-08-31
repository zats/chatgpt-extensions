#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function collectStrings(value, output) {
  if (typeof value === "string") {
    if (value.length >= 8) output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
}

export async function scanFiles(candidateFiles, secretFiles) {
  const secrets = new Set();
  for (const secretFile of secretFiles) {
    collectStrings(JSON.parse(await readFile(secretFile, "utf8")), secrets);
  }
  for (const candidateFile of candidateFiles) {
    const candidate = await readFile(candidateFile, "utf8");
    for (const secret of secrets) {
      if (candidate.includes(secret)) {
        throw new Error("Generated output contains a value from a credential document");
      }
    }
    const suspicious = [
      /\bsk-[A-Za-z0-9_-]{16,}/,
      /["'](?:access_token|refresh_token|id_token)["']\s*:/i,
      /\bBearer\s+[A-Za-z0-9._~-]{16,}/i,
    ];
    if (suspicious.some((expression) => expression.test(candidate))) {
      throw new Error("Generated output contains credential-shaped text");
    }
  }
}

export async function scanPatch(patchFile, secretFiles) {
  return scanFiles([patchFile], secretFiles);
}

async function main() {
  const candidateFiles = [];
  const secretFiles = [];
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[++index];
    if (!value || (argument !== "--candidate" && argument !== "--secret")) {
      throw new Error("usage: scan-patch-credentials.mjs --candidate <file>... --secret <credential-json>...");
    }
    (argument === "--candidate" ? candidateFiles : secretFiles).push(value);
  }
  if (candidateFiles.length === 0 || secretFiles.length === 0) {
    throw new Error("At least one candidate and one credential document are required");
  }
  await scanFiles(candidateFiles, secretFiles);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
