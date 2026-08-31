#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writePrivateFile(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600);
}

export async function packPatch(patchFile, payloadFile) {
  const patch = await readFile(patchFile);
  const value = {
    schemaVersion: 1,
    byteLength: patch.length,
    sha256: digest(patch),
    patchBase64: patch.toString("base64"),
  };
  await writePrivateFile(payloadFile, `${JSON.stringify(value)}\n`);
  return value;
}

export async function unpackPatch(payloadFile, patchFile) {
  const value = JSON.parse(await readFile(payloadFile, "utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !==
      "byteLength,patchBase64,schemaVersion,sha256" ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength <= 0 ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    typeof value.patchBase64 !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value.patchBase64,
    )
  ) {
    throw new TypeError("Encrypted patch payload is invalid");
  }
  const patch = Buffer.from(value.patchBase64, "base64");
  if (
    patch.toString("base64") !== value.patchBase64 ||
    patch.length !== value.byteLength ||
    digest(patch) !== value.sha256
  ) {
    throw new TypeError("Encrypted patch payload integrity check failed");
  }
  await writePrivateFile(patchFile, patch);
  return value;
}

async function main() {
  const [operation, input, output] = process.argv.slice(2);
  if (!input || !output || !["pack", "unpack"].includes(operation)) {
    throw new Error("usage: patch-payload.mjs <pack|unpack> <input> <output>");
  }
  if (operation === "pack") await packPatch(input, output);
  else await unpackPatch(input, output);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
