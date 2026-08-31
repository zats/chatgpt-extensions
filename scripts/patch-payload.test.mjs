import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { packPatch, unpackPatch } from "./patch-payload.mjs";

test("patch payload round-trips and detects changed metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patch-payload-test."));
  try {
    const patch = path.join(root, "binding.patch");
    const payload = path.join(root, "payload.json");
    const restored = path.join(root, "restored.patch");
    const bytes = Buffer.from("diff --git a/file b/file\n+new bytes\n", "utf8");
    await writeFile(patch, bytes);
    const packed = await packPatch(patch, payload);
    assert.equal(packed.byteLength, bytes.length);
    await unpackPatch(payload, restored);
    assert.deepEqual(await readFile(restored), bytes);

    const changed = JSON.parse(await readFile(payload, "utf8"));
    changed.byteLength += 1;
    await writeFile(payload, `${JSON.stringify(changed)}\n`);
    await assert.rejects(unpackPatch(payload, restored), /integrity check/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
