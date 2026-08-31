import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { encryptHandoff, generateHandoffKeys } from "./auth-handoff.mjs";

const source = {
  repository: "zats/chatgpt-extensions",
  runId: "12345",
  runAttempt: 1,
  targetEnvironment: "codex-agent",
  targetSecret: "CODEX_AGENT_AUTH_JSON",
};

async function runRefresh(current, candidate) {
  const root = await mkdtemp(path.join(os.tmpdir(), "refresh-auth-test."));
  const input = path.join(root, "input");
  const encrypted = path.join(root, "encrypted");
  const bin = path.join(root, "bin");
  await mkdir(input);
  await mkdir(bin);
  const publicKey = path.join(root, "public.pem");
  const privateKey = path.join(root, "private.pem");
  const currentFile = path.join(root, "current.json");
  await writeFile(path.join(input, "agent.json"), `${JSON.stringify(candidate)}\n`);
  await writeFile(currentFile, `${JSON.stringify(current)}\n`);
  await generateHandoffKeys(publicKey, privateKey);
  await encryptHandoff(publicKey, input, encrypted, source, ["agent"]);
  const mockGh = path.join(bin, "gh");
  await writeFile(
    mockGh,
    `#!/bin/bash
set -euo pipefail
body="$(cat)"
printf '%s\t%s\n' "$*" "$body" >> "$MOCK_GH_LOG"
`,
  );
  await chmod(mockGh, 0o755);
  const log = path.join(root, "gh.log");
  const result = spawnSync(
    path.resolve(import.meta.dirname, "refresh-auth-handoff.sh"),
    [
      encrypted,
      privateKey,
      currentFile,
      "agent",
      source.repository,
      source.runId,
      String(source.runAttempt),
      source.targetEnvironment,
      source.targetSecret,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GH_TOKEN: "test-token",
        MOCK_GH_LOG: log,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: root,
      },
    },
  );
  return { root, result, log };
}

const current = {
  last_refresh: "2026-08-31T12:00:00Z",
  tokens: { access_token: "current-access", refresh_token: "current-refresh" },
};

test("newer handoff writes authoritative mirror before the live secret", async () => {
  const candidate = {
    last_refresh: "2026-08-31T12:01:00Z",
    tokens: { access_token: "new-access", refresh_token: "new-refresh" },
  };
  const value = await runRefresh(current, candidate);
  try {
    assert.equal(value.result.status, 0, value.result.stderr);
    const lines = (await readFile(value.log, "utf8")).trim().split("\n");
    assert.match(
      lines[0],
      /^secret set CURRENT_AUTH_JSON --repo zats\/chatgpt-extensions --env codex-agent-refresh\t/,
    );
    assert.match(
      lines[1],
      /^secret set CODEX_AGENT_AUTH_JSON --repo zats\/chatgpt-extensions --env codex-agent\t/,
    );
    assert.match(lines[0], /new-refresh/);
    assert.match(lines[1], /new-refresh/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("stale handoff heals the live secret from the authoritative mirror", async () => {
  const candidate = {
    last_refresh: "2026-08-31T11:59:00Z",
    tokens: { access_token: "stale-access", refresh_token: "stale-refresh" },
  };
  const value = await runRefresh(current, candidate);
  try {
    assert.equal(value.result.status, 0, value.result.stderr);
    const lines = (await readFile(value.log, "utf8")).trim().split("\n");
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^secret set CODEX_AGENT_AUTH_JSON .* --env codex-agent\t/);
    assert.match(lines[0], /current-refresh/);
    assert.doesNotMatch(lines[0], /stale-refresh/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
