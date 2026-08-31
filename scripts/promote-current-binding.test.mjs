import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { promoteCurrentBinding } from "./promote-current-binding.mjs";

const signature = Buffer.alloc(64, 12).toString("base64");
const exact = Object.freeze({
  version: "26.1.2",
  appBuild: "123",
  appAsarSha256: "a".repeat(64),
  downloadUrl:
    "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.1.2.zip",
  downloadLength: 123456,
  downloadEdSignature: signature,
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "binding-promotion-test."));
  const directory = path.join(root, "runtime", "bindings");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "index.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      current: "26.1.0",
      bindings: { [exact.version]: exact },
    })}\n`,
  );
  return root;
}

test("promotion changes only the current selector for an exact indexed binding", async () => {
  const root = await fixture();
  try {
    const result = await promoteCurrentBinding({ repository: root, ...exact });
    const index = JSON.parse(
      await readFile(path.join(root, "runtime", "bindings", "index.json"), "utf8"),
    );
    assert.equal(result.changed, true);
    assert.equal(index.current, exact.version);
    assert.deepEqual(index.bindings[exact.version], exact);
    assert.equal(
      (await promoteCurrentBinding({ repository: root, ...exact })).changed,
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("promotion rejects a request that differs from the indexed exact build", async () => {
  const root = await fixture();
  try {
    await assert.rejects(
      promoteCurrentBinding({ repository: root, ...exact, appBuild: "124" }),
      /does not match/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("promotion cannot demote the selected current binding", async () => {
  const root = await fixture();
  try {
    const indexFile = path.join(root, "runtime", "bindings", "index.json");
    const index = JSON.parse(await readFile(indexFile, "utf8"));
    index.current = "26.2.0";
    await writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`);
    await assert.rejects(
      promoteCurrentBinding({ repository: root, ...exact }),
      /cannot select an older or equal binding/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
