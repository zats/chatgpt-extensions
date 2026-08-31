import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { verifyEd25519Payload } from "./verify-sparkle-signature.mjs";

test("Ed25519 archive verification rejects tampering and signature mismatch", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const payload = Buffer.from("exact archive bytes");
  const signature = crypto.sign(null, payload, privateKey).toString("base64");
  const rawPublicKey = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64");
  assert.equal(verifyEd25519Payload(payload, signature, rawPublicKey), true);
  assert.equal(
    verifyEd25519Payload(Buffer.from("tampered archive bytes"), signature, rawPublicKey),
    false,
  );
  const other = crypto.generateKeyPairSync("ed25519").privateKey;
  const otherSignature = crypto.sign(null, payload, other).toString("base64");
  assert.equal(verifyEd25519Payload(payload, otherSignature, rawPublicKey), false);
});
test("Ed25519 verification rejects noncanonical input", () => {
  assert.throws(
    () => verifyEd25519Payload(Buffer.alloc(0), "not-base64", "not-base64"),
    /canonical base64/,
  );
});
