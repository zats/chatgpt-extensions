#!/usr/bin/env node

import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const keyContext = Buffer.from("chatgpt-extensions-v5-auth-handoff-v2");

function encode(value) {
  return Buffer.from(value).toString("base64");
}

function decode(value) {
  if (typeof value !== "string") throw new TypeError("Invalid handoff envelope");
  return Buffer.from(value, "base64");
}

async function writePrivateFile(file, contents) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600);
}

function validateLabels(labels) {
  if (
    !Array.isArray(labels) ||
    labels.length === 0 ||
    labels.some((label) => !/^[a-z][a-z0-9-]*$/.test(label))
  ) {
    throw new TypeError("Handoff labels must be lowercase identifiers");
  }
}

function validateSourceContext(source) {
  if (
    !source ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository ?? "") ||
    !/^\d+$/.test(source.runId ?? "") ||
    !Number.isSafeInteger(source.runAttempt) ||
    source.runAttempt <= 0 ||
    !/^[A-Za-z0-9_.-]+$/.test(source.targetEnvironment ?? "") ||
    !/^[A-Z][A-Z0-9_]*$/.test(source.targetSecret ?? "")
  ) {
    throw new TypeError("Handoff source context is invalid");
  }
  return source;
}

function authenticatedContext(source, role) {
  validateSourceContext(source);
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      repository: source.repository,
      sourceRunId: source.runId,
      sourceRunAttempt: source.runAttempt,
      targetEnvironment: source.targetEnvironment,
      targetSecret: source.targetSecret,
      role,
    }),
  );
}

export async function generateHandoffKeys(publicFile, privateFile) {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  await writePrivateFile(
    privateFile,
    privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  await writeFile(publicFile, publicKey.export({ format: "pem", type: "spki" }), {
    mode: 0o644,
  });
}

export async function encryptHandoff(keyFile, inputRoot, outputRoot, source, labels) {
  validateLabels(labels);
  validateSourceContext(source);
  const recipient = createPublicKey(await readFile(keyFile, "utf8"));
  if (recipient.asymmetricKeyType !== "x25519") {
    throw new TypeError("Handoff public key must be X25519");
  }
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  await chmod(outputRoot, 0o700);
  for (const label of labels) {
    const plaintext = await readFile(path.join(inputRoot, `${label}.json`));
    const ephemeral = generateKeyPairSync("x25519");
    const salt = randomBytes(32);
    const nonce = randomBytes(12);
    const sharedSecret = diffieHellman({
      privateKey: ephemeral.privateKey,
      publicKey: recipient,
    });
    const key = hkdfSync("sha256", sharedSecret, salt, keyContext, 32);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const aad = authenticatedContext(source, label);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = {
      schemaVersion: 2,
      repository: source.repository,
      sourceRunId: source.runId,
      sourceRunAttempt: source.runAttempt,
      targetEnvironment: source.targetEnvironment,
      targetSecret: source.targetSecret,
      role: label,
      ephemeralPublicKey: encode(
        ephemeral.publicKey.export({ format: "der", type: "spki" }),
      ),
      salt: encode(salt),
      nonce: encode(nonce),
      authenticationTag: encode(cipher.getAuthTag()),
      ciphertext: encode(ciphertext),
    };
    await writePrivateFile(
      path.join(outputRoot, `${label}.json`),
      `${JSON.stringify(envelope)}\n`,
    );
  }
}

export async function decryptHandoff(keyFile, inputRoot, outputRoot, source, labels) {
  validateLabels(labels);
  validateSourceContext(source);
  const recipient = createPrivateKey(await readFile(keyFile, "utf8"));
  if (recipient.asymmetricKeyType !== "x25519") {
    throw new TypeError("Handoff private key must be X25519");
  }
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  await chmod(outputRoot, 0o700);
  for (const label of labels) {
    const envelope = JSON.parse(
      await readFile(path.join(inputRoot, `${label}.json`), "utf8"),
    );
    const expectedContext = JSON.parse(authenticatedContext(source, label));
    if (
      envelope.schemaVersion !== expectedContext.schemaVersion ||
      envelope.repository !== expectedContext.repository ||
      envelope.sourceRunId !== expectedContext.sourceRunId ||
      envelope.sourceRunAttempt !== expectedContext.sourceRunAttempt ||
      envelope.targetEnvironment !== expectedContext.targetEnvironment ||
      envelope.targetSecret !== expectedContext.targetSecret ||
      envelope.role !== expectedContext.role
    ) {
      throw new TypeError("Handoff envelope does not match its authenticated source context");
    }
    const ephemeralPublicKey = createPublicKey({
      key: decode(envelope.ephemeralPublicKey),
      format: "der",
      type: "spki",
    });
    if (ephemeralPublicKey.asymmetricKeyType !== "x25519") {
      throw new TypeError("Invalid handoff public key");
    }
    const key = hkdfSync(
      "sha256",
      diffieHellman({ privateKey: recipient, publicKey: ephemeralPublicKey }),
      decode(envelope.salt),
      keyContext,
      32,
    );
    const decipher = createDecipheriv("aes-256-gcm", key, decode(envelope.nonce));
    decipher.setAAD(authenticatedContext(source, label));
    decipher.setAuthTag(decode(envelope.authenticationTag));
    const plaintext = Buffer.concat([
      decipher.update(decode(envelope.ciphertext)),
      decipher.final(),
    ]);
    await writePrivateFile(path.join(outputRoot, `${label}.json`), plaintext);
  }
}

async function main() {
  const [
    operation,
    keyFile,
    inputRoot,
    outputRoot,
    repository,
    runId,
    runAttemptText,
    targetEnvironment,
    targetSecret,
    ...labels
  ] = process.argv.slice(2);
  if (operation === "generate" && keyFile && inputRoot && !outputRoot) {
    await generateHandoffKeys(keyFile, inputRoot);
    return;
  }
  if (
    !keyFile ||
    !inputRoot ||
    !outputRoot ||
    !repository ||
    !runId ||
    !/^\d+$/.test(runAttemptText ?? "") ||
    !targetEnvironment ||
    !targetSecret ||
    labels.length === 0
  ) {
    throw new Error(
      "usage: auth-handoff.mjs generate <public.pem> <private.pem> | <encrypt|decrypt> <key.pem> <input-root> <output-root> <repository> <run-id> <run-attempt> <target-environment> <target-secret> <label>...",
    );
  }
  const source = {
    repository,
    runId,
    runAttempt: Number(runAttemptText),
    targetEnvironment,
    targetSecret,
  };
  if (operation === "encrypt") {
    await encryptHandoff(keyFile, inputRoot, outputRoot, source, labels);
  } else if (operation === "decrypt") {
    await decryptHandoff(keyFile, inputRoot, outputRoot, source, labels);
  } else {
    throw new Error("Auth handoff operation must be generate, encrypt, or decrypt");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
