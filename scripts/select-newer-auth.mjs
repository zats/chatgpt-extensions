#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

function refreshNanoseconds(value) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value ?? "");
  if (!match) throw new TypeError("Authentication last_refresh is invalid");
  const milliseconds = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(milliseconds)) throw new TypeError("Authentication last_refresh is invalid");
  return BigInt(milliseconds) * 1_000_000n + BigInt((match[2] ?? "").padEnd(9, "0"));
}
function validateAuthentication(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Authentication must be an object");
  }
  if (!value.tokens || typeof value.tokens !== "object" || Array.isArray(value.tokens)) {
    throw new TypeError("Authentication tokens must be an object");
  }
  refreshNanoseconds(value.last_refresh);
  return value;
}

export function selectNewerAuthentication(current, candidate) {
  const left = validateAuthentication(current);
  const right = validateAuthentication(candidate);
  if (isDeepStrictEqual(left.tokens, right.tokens)) return "same";
  return refreshNanoseconds(right.last_refresh) > refreshNanoseconds(left.last_refresh)
    ? "newer"
    : "stale";
}

async function main() {
  const [currentFile, candidateFile] = process.argv.slice(2);
  if (!currentFile || !candidateFile) {
    throw new Error("usage: select-newer-auth.mjs <current.json> <candidate.json>");
  }
  const result = selectNewerAuthentication(
    JSON.parse(await readFile(currentFile, "utf8")),
    JSON.parse(await readFile(candidateFile, "utf8")),
  );
  process.stdout.write(`${result}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
