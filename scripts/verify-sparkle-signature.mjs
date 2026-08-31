#!/usr/bin/env node

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const sparklePublicEdKey = "mNfr1v9t63BfgDtlw4C8lRvSY6uMggIXABDOCi3tS6k=";
const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");

function canonicalBase64(value, bytes, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be base64 text`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== bytes || decoded.toString("base64") !== value) {
    throw new TypeError(`${label} is not canonical base64 for ${bytes} bytes`);
  }
  return decoded;
}
export function verifyEd25519Payload(payload, signatureBase64, publicKeyBase64) {
  const signature = canonicalBase64(signatureBase64, 64, "Sparkle signature");
  const rawPublicKey = canonicalBase64(publicKeyBase64, 32, "Sparkle public key");
  const publicKey = crypto.createPublicKey({
    key: Buffer.concat([spkiPrefix, rawPublicKey]),
    format: "der",
    type: "spki",
  });
  return crypto.verify(null, payload, publicKey, signature);
}

export async function verifySparkleArchive(archive, signatureBase64) {
  const payload = await readFile(archive);
  if (!verifyEd25519Payload(payload, signatureBase64, sparklePublicEdKey)) {
    throw new Error("Sparkle Ed25519 signature does not match the exact archive");
  }
}

async function main() {
  const [archive, signature] = process.argv.slice(2);
  if (!archive || !signature) {
    throw new Error("usage: verify-sparkle-signature.mjs <archive> <base64-signature>");
  }
  await verifySparkleArchive(archive, signature);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
