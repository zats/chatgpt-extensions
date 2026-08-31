import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decryptHandoff,
  encryptHandoff,
  generateHandoffKeys,
} from "./auth-handoff.mjs";

test("authentication handoff round-trips and rejects tampering", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "auth-handoff-test."));
  try {
    const input = path.join(root, "input");
    const encrypted = path.join(root, "encrypted");
    const output = path.join(root, "output");
    const publicKey = path.join(root, "public.pem");
    const privateKey = path.join(root, "private.pem");
    await mkdir(input);
    const auth = `${JSON.stringify({ last_refresh: "2026-08-31T12:00:00Z", tokens: { access_token: "private" } })}\n`;
    const source = {
      repository: "zats/chatgpt-extensions",
      runId: "12345",
      runAttempt: 2,
      targetEnvironment: "codex-agent",
      targetSecret: "CODEX_AGENT_AUTH_JSON",
    };
    await writeFile(path.join(input, "agent.json"), auth);
    await generateHandoffKeys(publicKey, privateKey);
    await encryptHandoff(publicKey, input, encrypted, source, ["agent"]);
    assert.notEqual(await readFile(path.join(encrypted, "agent.json"), "utf8"), auth);
    await decryptHandoff(privateKey, encrypted, output, source, ["agent"]);
    assert.equal(await readFile(path.join(output, "agent.json"), "utf8"), auth);

    const envelopeFile = path.join(encrypted, "agent.json");
    const envelope = JSON.parse(await readFile(envelopeFile, "utf8"));
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -4)}AAAA`;
    await writeFile(envelopeFile, JSON.stringify(envelope));
    await assert.rejects(
      decryptHandoff(
        privateKey,
        encrypted,
        path.join(root, "tampered"),
        source,
        ["agent"],
      ),
    );
    await assert.rejects(
      decryptHandoff(
        privateKey,
        encrypted,
        path.join(root, "replayed"),
        { ...source, runId: "12346" },
        ["agent"],
      ),
      /source context/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("handoff encrypts arbitrary patch bytes with bound context", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-handoff-test."));
  try {
    const input = path.join(root, "input");
    const encrypted = path.join(root, "encrypted");
    const output = path.join(root, "output");
    const publicKey = path.join(root, "public.pem");
    const privateKey = path.join(root, "private.pem");
    const patch = Buffer.from("diff --git a/file b/file\n+private bytes\n", "utf8");
    const source = {
      repository: "zats/chatgpt-extensions",
      runId: "98765",
      runAttempt: 3,
      targetEnvironment: "codex-agent-refresh",
      targetSecret: "RAW_BINDING_PATCH",
    };
    await mkdir(input);
    await writeFile(path.join(input, "patch.json"), patch);
    await generateHandoffKeys(publicKey, privateKey);
    await encryptHandoff(publicKey, input, encrypted, source, ["patch"]);
    assert.notDeepEqual(await readFile(path.join(encrypted, "patch.json")), patch);
    await decryptHandoff(privateKey, encrypted, output, source, ["patch"]);
    assert.deepEqual(await readFile(path.join(output, "patch.json")), patch);
    await assert.rejects(
      decryptHandoff(
        privateKey,
        encrypted,
        path.join(root, "wrong-context"),
        { ...source, targetSecret: "OTHER_PATCH" },
        ["patch"],
      ),
      /source context/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
