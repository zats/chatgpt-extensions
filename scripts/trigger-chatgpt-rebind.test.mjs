import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertBatchLeaseAvailable,
  automaticRetryIsPending,
  backtestBatchId,
  canAutomaticallyRetry,
  classifyBatchIssue,
  decideBatchProgress,
  decideIssueRescue,
  decideQueuedBatchRecovery,
  issueBody,
  issueTitle,
  requestFromEvent,
  requestsFromSnapshot,
  retryLineageForRun,
  validateBatchMetadata,
  validateIssue,
  validateRequest,
} from "./trigger-chatgpt-rebind.mjs";

const signature = Buffer.alloc(64, 9).toString("base64");
const batchA = "c".repeat(64);
const batchB = "d".repeat(64);
const current = Object.freeze({
  schema: 2,
  mode: "current",
  version: "26.825.51511",
  appBuild: "7377",
  downloadUrl:
    "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.825.51511.zip",
  downloadLength: 595263123,
  downloadEdSignature: signature,
});

test("current request has an exact title and JSON body", () => {
  assert.equal(issueTitle(current), "ChatGPT 26.825.51511 (7377) binding [current]");
  assert.deepEqual(JSON.parse(issueBody(current)), current);
});

test("request rejects extra fields and mismatched download URLs", () => {
  assert.throws(() => validateRequest({ ...current, force: false }), /unexpected/);
  assert.throws(
    () => validateRequest({ ...current, downloadUrl: "https://example.com/app.zip" }),
    /downloadUrl must be/,
  );
});

test("backtest requires a snapshot identity and offset", () => {
  assert.throws(
    () => validateRequest({ ...current, mode: "backtest" }),
    /unexpected or missing/,
  );
  assert.doesNotThrow(() =>
    validateRequest({
      ...current,
      mode: "backtest",
      snapshotSha256: "a".repeat(64),
      batchId: batchA,
      offset: 4,
    }),
  );
});

test("issue validation rejects a title or body mismatch", () => {
  const issue = {
    number: 12,
    title: issueTitle(current),
    body: issueBody(current),
    labels: [{ name: "pending" }],
  };
  assert.equal(validateIssue(issue).issueNumber, 12);
  assert.throws(() => validateIssue({ ...issue, title: "wrong" }), /title must be/);
  assert.throws(
    () => validateIssue(issue, { ...current, mode: "correction" }),
    /does not match/,
  );
});

test("pending issue and trusted exact retry events validate", () => {
  const issue = {
    number: 12,
    title: issueTitle(current),
    body: issueBody(current),
    labels: [{ name: "chatgpt-binding" }, { name: "pending" }],
    user: { login: "zats" },
  };
  assert.equal(
    requestFromEvent("issues", {
      action: "reopened",
      repository: { owner: { login: "zats" } },
      issue,
    }).retry,
    false,
  );
  assert.equal(
    requestFromEvent("issues", {
      action: "opened",
      repository: { owner: { login: "zats" } },
      issue,
    }).retry,
    false,
  );
  assert.equal(
    requestFromEvent("issue_comment", {
      action: "created",
      repository: { owner: { login: "zats" } },
      comment: { body: "retry", author_association: "MEMBER" },
      issue: { ...issue, labels: [{ name: "failed" }] },
    }).retry,
    true,
  );
});

test("issue events cannot start backtests without trusted dispatch", () => {
  const request = {
    ...current,
    mode: "backtest",
    snapshotSha256: "a".repeat(64),
    batchId: batchA,
    offset: 0,
  };
  assert.throws(
    () =>
      requestFromEvent("issues", {
        action: "opened",
        issue: {
          number: 19,
          title: issueTitle(request),
          body: issueBody(request),
          labels: [{ name: "chatgpt-binding" }, { name: "pending" }],
          user: { login: "github-actions[bot]" },
        },
      }),
    /only current or correction/,
  );
});

test("current issue events require the configured worker actor", () => {
  const issue = {
    number: 22,
    title: issueTitle(current),
    body: issueBody(current),
    labels: [{ name: "chatgpt-binding" }, { name: "pending" }],
    user: { login: "untrusted-user" },
  };
  assert.throws(
    () =>
      requestFromEvent("issues", {
        action: "opened",
        repository: { owner: { login: "zats" } },
        issue,
      }),
    /not owned by zats/,
  );
});

test("trusted repository dispatch can mark an exact failed issue retry", () => {
  const result = requestFromEvent("repository_dispatch", {
    action: "chatgpt-rebind",
    client_payload: { ...current, issueNumber: 22, retry: true },
  });
  assert.equal(result.retry, true);
  assert.equal(result.issueNumber, 22);
  const automatic = requestFromEvent("repository_dispatch", {
    action: "chatgpt-rebind",
    client_payload: {
      ...current,
      issueNumber: 22,
      retry: true,
      automaticRetrySourceRunId: 100,
    },
  });
  assert.equal(automatic.automaticRetrySourceRunId, 100);
  assert.throws(
    () =>
      requestFromEvent("repository_dispatch", {
        action: "chatgpt-rebind",
        client_payload: {
          ...current,
          issueNumber: 22,
          automaticRetrySourceRunId: 100,
        },
      }),
    /positive retry lineage ID/,
  );
});

test("automatic retry is bounded to one lineage attempt", () => {
  assert.equal(canAutomaticallyRetry(100, 0), true);
  assert.equal(canAutomaticallyRetry(100, 100), false);
  assert.equal(canAutomaticallyRetry(101, 0), true);
});

test("old automatic markers do not consume a reopened run lineage", () => {
  const bot = (body) => ({ user: { login: "github-actions[bot]" }, body });
  const comments = [
    bot("<!-- chatgpt-rebind-auto-retry-v1 100 -->"),
    bot("<!-- chatgpt-rebind-run-lineage-v1 200 0 -->"),
    bot("<!-- chatgpt-rebind-run-lineage-v1 201 200 -->"),
  ];
  assert.equal(canAutomaticallyRetry(200, retryLineageForRun(comments, 200)), true);
  assert.equal(canAutomaticallyRetry(201, retryLineageForRun(comments, 201)), false);
});

test("settle-failed maps the completed run and marks its trusted issue failed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "settle-failed-test."));
  try {
    const gh = path.join(directory, "gh");
    const log = path.join(directory, "gh.log");
    const issues = path.join(directory, "issues.json");
    const comments = path.join(directory, "comments.jsonl");
    await writeFile(
      gh,
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
let input = "";
try { input = fs.readFileSync(0, "utf8"); } catch {}
fs.appendFileSync(process.env.GH_TEST_LOG, JSON.stringify({ args, input }) + "\\n");
if (args.some((value) => value.includes("/issues?state=open"))) {
  process.stdout.write(fs.readFileSync(process.env.GH_TEST_ISSUES));
} else if (args.some((value) => value.includes("/comments?per_page=100"))) {
  process.stdout.write(fs.readFileSync(process.env.GH_TEST_COMMENTS));
}
`,
    );
    await chmod(gh, 0o755);
    await writeFile(
      issues,
      JSON.stringify([[{
        number: 12,
        title: issueTitle(current),
        body: issueBody(current),
        state: "open",
        labels: [{ name: "chatgpt-binding" }, { name: "in-progress" }],
        user: { login: "zats" },
      }]]),
    );
    await writeFile(
      comments,
      `${JSON.stringify({
        id: 1,
        body: "Binding run started: https://github.com/zats/repo/actions/runs/700",
        user: { login: "github-actions[bot]" },
      })}\n`,
    );

    execFileSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "trigger-chatgpt-rebind.mjs"),
        "settle-failed",
        "--repository",
        "zats/repo",
        "--worker-actor",
        "zats",
        "--run-id",
        "700",
      ],
      {
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          GH_TEST_COMMENTS: comments,
          GH_TEST_ISSUES: issues,
          GH_TEST_LOG: log,
        },
      },
    );

    const records = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const status = records.find(({ args }) =>
      args.includes("PATCH") && args.some((value) => value.endsWith("/issues/12")),
    );
    const comment = records.find(({ args }) =>
      args.includes("POST") && args.some((value) => value.endsWith("/issues/12/comments")),
    );
    assert.deepEqual(JSON.parse(status.input).labels, ["chatgpt-binding", "failed"]);
    assert.match(JSON.parse(comment.input).body, /did not match the narrow transient-failure criteria/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed batch waits only while its bounded automatic retry is in delivery", () => {
  const bot = (body) => ({ user: { login: "github-actions[bot]" }, body });
  const comments = [
    bot("Binding run started: https://github.com/zats/repo/actions/runs/100"),
    bot("<!-- chatgpt-rebind-auto-retry-v1 100 -->"),
    bot("<!-- chatgpt-rebind-auto-retry-dispatch-v1 100 1 -->"),
  ];
  assert.equal(automaticRetryIsPending(comments), true);
  assert.equal(
    automaticRetryIsPending([
      ...comments,
      bot("<!-- chatgpt-rebind-auto-retry-dispatch-v1 100 2 -->"),
    ]),
    false,
  );
  assert.equal(
    automaticRetryIsPending([
      ...comments,
      bot("Binding run started: https://github.com/zats/repo/actions/runs/101"),
    ]),
    false,
  );
});

test("retry rejects whitespace, untrusted authors, and nonfailed issues", () => {
  const issue = {
    number: 12,
    title: issueTitle(current),
    body: issueBody(current),
    labels: [{ name: "failed" }],
    user: { login: "zats" },
  };
  assert.throws(() =>
    requestFromEvent("issue_comment", {
      action: "created",
      repository: { owner: { login: "zats" } },
      comment: { body: "retry\n", author_association: "MEMBER" },
      issue,
    }),
  );
  assert.throws(() =>
    requestFromEvent("issue_comment", {
      action: "created",
      repository: { owner: { login: "zats" } },
      comment: { body: "retry", author_association: "NONE" },
      issue,
    }),
  );
  assert.throws(() =>
    requestFromEvent("issue_comment", {
      action: "created",
      repository: { owner: { login: "zats" } },
      comment: { body: "retry", author_association: "OWNER" },
      issue: { ...issue, labels: [{ name: "pending" }] },
    }),
  );
});

test("one snapshot creates exact backtest requests", () => {
  const snapshot = {
    schemaVersion: 2,
    snapshotSha256: "b".repeat(64),
    builds: [0, 2, 4].map((offset) => ({
      offset,
      version: `26.825.${51511 - offset}`,
      appBuild: String(7377 - offset),
      downloadUrl: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.825.${51511 - offset}.zip`,
      downloadLength: 595263123 - offset,
      downloadEdSignature: signature,
    })),
  };
  assert.deepEqual(
    requestsFromSnapshot(snapshot, batchA).map(({ mode, offset }) => ({ mode, offset })),
    [
      { mode: "backtest", offset: 0 },
      { mode: "backtest", offset: 2 },
      { mode: "backtest", offset: 4 },
    ],
  );
});

test("batch terminal state requires an exact closed success and stops on failure", () => {
  assert.equal(
    classifyBatchIssue({ state: "open", labels: [{ name: "in-progress" }] }),
    "in-progress",
  );
  assert.equal(
    classifyBatchIssue({ state: "open", labels: [{ name: "success" }] }),
    "invalid",
  );
  assert.equal(
    classifyBatchIssue({ state: "closed", labels: [{ name: "success" }] }),
    "success",
  );
  assert.equal(
    classifyBatchIssue({ state: "open", labels: [{ name: "failed" }] }),
    "failed",
  );
  assert.equal(classifyBatchIssue({ state: "closed", labels: [] }), "failed");
});

test("batch progress dispatches only the first member after exact successes", () => {
  assert.deepEqual(decideBatchProgress(["queued", "queued", "queued"]), {
    action: "dispatch",
    index: 0,
  });
  assert.deepEqual(decideBatchProgress(["success", "queued", "queued"]), {
    action: "dispatch",
    index: 1,
  });
  assert.deepEqual(decideBatchProgress(["success", "in-progress", "queued"]), {
    action: "wait",
    index: 1,
  });
  assert.deepEqual(decideBatchProgress(["success", "failed", "queued"]), {
    action: "stop",
    index: 1,
  });
  assert.deepEqual(decideBatchProgress(["success", "success"]), {
    action: "complete",
  });
});

test("new batch rejects every active lease, including the same snapshot", () => {
  const request = {
    ...current,
    mode: "backtest",
    snapshotSha256: "b".repeat(64),
    batchId: batchA,
    offset: 0,
  };
  const issue = {
    state: "open",
    number: 41,
    title: issueTitle(request),
    body: issueBody(request),
    labels: [{ name: "chatgpt-binding" }, { name: "in-progress" }],
    user: { login: "github-actions[bot]" },
  };
  assert.throws(
    () => assertBatchLeaseAvailable([issue], "b".repeat(64)),
    /already active/,
  );
  assert.throws(
    () => assertBatchLeaseAvailable([issue], "c".repeat(64)),
    /already active/,
  );
});

test("rescuer redrives pending, waits for active, and recovers terminal success", () => {
  assert.equal(decideIssueRescue({ labels: [{ name: "pending" }] }), "redrive");
  assert.equal(
    decideIssueRescue(
      { labels: [{ name: "in-progress" }] },
      { status: "in_progress", conclusion: null },
    ),
    "wait",
  );
  assert.equal(
    decideIssueRescue(
      { labels: [{ name: "in-progress" }] },
      { status: "completed", conclusion: "success" },
    ),
    "recover",
  );
  assert.equal(
    decideIssueRescue(
      { labels: [{ name: "in-progress" }] },
      {
        status: "completed",
        conclusion: "failure",
        updated_at: "2026-08-31T10:00:00Z",
      },
      Date.parse("2026-08-31T11:00:00Z"),
    ),
    "fail",
  );
  assert.equal(decideIssueRescue({ labels: [{ name: "queued" }] }), "ignore");
  assert.equal(
    decideIssueRescue(
      { labels: [{ name: "failed" }] },
      undefined,
      Date.now(),
      { sourceRunId: 88, latestRunId: 88, dispatchAttempts: 1 },
    ),
    "redrive-retry",
  );
  assert.equal(
    decideIssueRescue(
      { labels: [{ name: "failed" }] },
      undefined,
      Date.now(),
      { sourceRunId: 88, latestRunId: 88, dispatchAttempts: 2 },
    ),
    "ignore",
  );
  assert.equal(
    decideIssueRescue(
      { labels: [{ name: "failed" }] },
      undefined,
      Date.now(),
      { sourceRunId: 88, latestRunId: 88, dispatchAttempts: 99 },
    ),
    "ignore",
  );
});

test("startup failure before a retry start marker permits one bounded redrive", () => {
  const failed = { labels: [{ name: "failed" }] };
  assert.equal(
    decideIssueRescue(failed, undefined, Date.now(), {
      sourceRunId: 401,
      latestRunId: 401,
      dispatchAttempts: 1,
    }),
    "redrive-retry",
  );
  assert.equal(
    decideIssueRescue(failed, undefined, Date.now(), {
      sourceRunId: 401,
      latestRunId: 401,
      dispatchAttempts: 2,
    }),
    "ignore",
  );
});

test("rescuer resumes a complete queued batch after runner loss", () => {
  const oldQueued = [0, 2, 4].map((offset) => ({
    state: "open",
    created_at: `2026-08-31T10:0${offset}:00Z`,
    labels: [{ name: "queued" }],
  }));
  assert.equal(
    decideQueuedBatchRecovery(
      oldQueued,
      true,
      Date.parse("2026-08-31T11:00:00Z"),
    ),
    "resume",
  );
});

test("rescuer releases a partial queued batch only after its grace period", () => {
  const partial = [
    {
      state: "open",
      created_at: "2026-08-31T10:00:00Z",
      labels: [{ name: "queued" }],
    },
    {
      state: "open",
      created_at: "2026-08-31T10:01:00Z",
      labels: [{ name: "queued" }],
    },
  ];
  assert.equal(
    decideQueuedBatchRecovery(
      partial,
      false,
      Date.parse("2026-08-31T10:20:00Z"),
    ),
    "wait",
  );
  assert.equal(
    decideQueuedBatchRecovery(
      partial,
      false,
      Date.parse("2026-08-31T11:00:00Z"),
    ),
    "fail-partial",
  );
});

test("batch metadata binds an exact issue sequence to one frozen snapshot", () => {
  const request = {
    ...current,
    mode: "backtest",
    snapshotSha256: "b".repeat(64),
    batchId: batchA,
    offset: 2,
  };
  const metadata = {
    schema: 1,
    batchId: request.batchId,
    snapshotSha256: request.snapshotSha256,
    index: 1,
    total: 3,
    issues: [10, 11, 12],
  };
  assert.equal(validateBatchMetadata(metadata, 11, request).index, 1);
  assert.throws(() => validateBatchMetadata(metadata, 12, request), /Invalid/);
  assert.throws(
    () => validateBatchMetadata({ ...metadata, batchId: batchB }, 11, request),
    /does not match/,
  );
});

test("same appcast snapshot gets a distinct identity for every workflow attempt", () => {
  const snapshot = "b".repeat(64);
  const first = backtestBatchId("zats/chatgpt-extensions", 100, 1, snapshot);
  const second = backtestBatchId("zats/chatgpt-extensions", 100, 2, snapshot);
  assert.notEqual(first, second);
  assert.equal(first, backtestBatchId("zats/chatgpt-extensions", 100, 1, snapshot));
});

test("a partial repeat cannot reuse terminal metadata from a prior same-snapshot batch", () => {
  const priorRequest = {
    ...current,
    mode: "backtest",
    snapshotSha256: "b".repeat(64),
    batchId: batchA,
    offset: 0,
  };
  const repeatedRequest = { ...priorRequest, batchId: batchB };
  const priorMetadata = {
    schema: 1,
    batchId: batchA,
    snapshotSha256: priorRequest.snapshotSha256,
    index: 0,
    total: 3,
    issues: [21, 22, 23],
  };
  assert.notEqual(issueBody(priorRequest), issueBody(repeatedRequest));
  assert.throws(
    () => validateBatchMetadata(priorMetadata, 21, repeatedRequest),
    /does not match/,
  );
});
