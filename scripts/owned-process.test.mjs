import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runOwnedCommand } from "./owned-process.mjs";

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test("owned command removes descendants after a successful leader exit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "owned-process-test."));
  const marker = path.join(root, "descendant-survived");
  const pidFile = path.join(root, "descendant.pid");
  try {
    const descendant = `
      const { writeFileSync } = require("node:fs");
      writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
      setTimeout(() => writeFileSync(${JSON.stringify(marker)}, "unsafe"), 500);
    `;
    const leader = `
      const { spawn } = require("node:child_process");
      const { existsSync } = require("node:fs");
      const child = spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], {
        stdio: "ignore",
      });
      child.unref();
      const deadline = Date.now() + 1000;
      while (!existsSync(${JSON.stringify(pidFile)}) && Date.now() < deadline) {}
    `;
    await runOwnedCommand(process.execPath, ["-e", leader], {
      stdio: "ignore",
      timeoutMilliseconds: 5_000,
    });
    assert.match(await readFile(pidFile, "utf8"), /^\d+$/);
    await sleep(700);
    await assert.rejects(access(marker), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
