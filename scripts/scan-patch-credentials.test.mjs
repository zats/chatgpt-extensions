import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanFiles, scanPatch } from "./scan-patch-credentials.mjs";

test("credential values and token-shaped additions fail without printing values", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "credential-scan-test."));
  try {
    const secret = path.join(root, "auth.json");
    const patch = path.join(root, "binding.patch");
    await writeFile(secret, JSON.stringify({ tokens: { access_token: "private-value-123" } }));
    await writeFile(patch, "+safe\n");
    await assert.doesNotReject(scanPatch(patch, [secret]));
    await writeFile(patch, "+private-value-123\n");
    await assert.rejects(scanPatch(patch, [secret]), /value from a credential/);
    await writeFile(patch, '+{"refresh_token":"not-a-real-token"}\n');
    await assert.rejects(scanPatch(patch, [secret]), /credential-shaped/);
    await writeFile(patch, "+safe again\n");
    await assert.doesNotReject(scanFiles([patch], [secret]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
