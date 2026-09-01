#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { expectedDownloadUrl } from "./resolve-appcast-versions.mjs";
import { shouldRetryTransientFailure } from "./retry-transient-rebind-failure.mjs";

export const requestModes = Object.freeze(["current", "backtest", "correction"]);
export const statusLabels = Object.freeze([
  "pending",
  "in-progress",
  "failed",
  "success",
]);

const digestPattern = /^[a-f0-9]{64}$/;
const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const fixedBacktestOffsets = Object.freeze([0, 2, 4]);
const queuedBatchGraceMilliseconds = 30 * 60_000;

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function validateRequest(value) {
  if (!plainObject(value)) throw new TypeError("Rebind request must be an object");
  if (!requestModes.includes(value.mode)) {
    throw new TypeError("Rebind mode must be current, backtest, or correction");
  }
  const expectedKeys = ["schema", "mode", "version", "downloadUrl"];
  expectedKeys.push("appBuild", "downloadLength", "downloadEdSignature");
  if (value.mode === "backtest") expectedKeys.push("snapshotSha256", "batchId", "offset");
  if (!exactKeys(value, expectedKeys)) {
    throw new TypeError(
      `Rebind ${value.mode} request has unexpected or missing fields`,
    );
  }
  if (value.schema !== 2) throw new TypeError("Rebind request schema must be 2");
  if (typeof value.appBuild !== "string" || !/^\d+$/.test(value.appBuild)) {
    throw new TypeError("Rebind appBuild must be numeric text");
  }
  if (!Number.isSafeInteger(value.downloadLength) || value.downloadLength <= 0) {
    throw new TypeError("Rebind downloadLength must be a positive safe integer");
  }
  const signature = Buffer.from(value.downloadEdSignature ?? "", "base64");
  if (signature.length !== 64 || signature.toString("base64") !== value.downloadEdSignature) {
    throw new TypeError("Rebind downloadEdSignature must be one canonical Ed25519 signature");
  }
  const expectedUrl = expectedDownloadUrl(value.version);
  if (value.downloadUrl !== expectedUrl) {
    throw new TypeError(`Rebind downloadUrl must be ${expectedUrl}`);
  }
  if (value.mode === "backtest") {
    if (!digestPattern.test(value.snapshotSha256)) {
      throw new TypeError("Backtest snapshotSha256 must be a lowercase SHA-256 digest");
    }
    if (!Number.isSafeInteger(value.offset) || value.offset < 0) {
      throw new TypeError("Backtest offset must be a non-negative integer");
    }
    if (!digestPattern.test(value.batchId)) {
      throw new TypeError("Backtest batchId must be a lowercase SHA-256 digest");
    }
  }
  return Object.freeze({ ...value });
}

export function issueTitle(request) {
  const value = validateRequest(request);
  return `ChatGPT ${value.version} (${value.appBuild}) binding [${value.mode}]`;
}

export function issueBody(request) {
  return `${JSON.stringify(validateRequest(request), null, 2)}\n`;
}

function labelsOf(issue) {
  if (!Array.isArray(issue?.labels)) return [];
  return issue.labels.map((label) =>
    typeof label === "string" ? label : label?.name,
  );
}

function validateIssueActor(issue, request, workerActor) {
  const expected = request.mode === "backtest" ? "github-actions[bot]" : workerActor;
  if (!expected || issue?.user?.login !== expected) {
    throw new TypeError(`Rebind ${request.mode} issue is not owned by ${expected ?? "the trusted worker"}`);
  }
}

export function validateIssue(issue, expectedRequest) {
  if (!plainObject(issue) || !Number.isSafeInteger(issue.number) || issue.number <= 0) {
    throw new TypeError("Rebind issue has no positive issue number");
  }
  if (issue.pull_request !== undefined || issue.pullRequest !== undefined) {
    throw new TypeError("A pull request cannot be a rebind issue");
  }
  let request;
  try {
    request = validateRequest(JSON.parse(issue.body));
  } catch (error) {
    throw new TypeError(`Rebind issue body must be exact JSON: ${error.message}`);
  }
  if (issue.title !== issueTitle(request)) {
    throw new TypeError(`Rebind issue title must be ${issueTitle(request)}`);
  }
  if (expectedRequest !== undefined) {
    const expected = validateRequest(expectedRequest);
    if (!isDeepStrictEqual(request, expected)) {
      throw new TypeError("Rebind issue body does not match the requested build");
    }
  }
  return Object.freeze({
    issueNumber: issue.number,
    labels: Object.freeze(labelsOf(issue)),
    request,
  });
}

export function requestFromEvent(eventName, event) {
  if (!plainObject(event)) throw new TypeError("GitHub event must be an object");
  if (eventName === "issues") {
    if (!["opened", "reopened"].includes(event.action)) {
      throw new TypeError("Issue event must open or reopen the issue");
    }
    const validated = validateIssue(event.issue);
    validateIssueActor(event.issue, validated.request, event.repository?.owner?.login);
    if (!["current", "correction"].includes(validated.request.mode)) {
      throw new TypeError("Issue events can start only current or correction rebinds");
    }
    if (
      !validated.labels.includes("chatgpt-binding") ||
      !validated.labels.includes("pending")
    ) {
      throw new TypeError("Rebind issue must have chatgpt-binding and pending labels");
    }
    return Object.freeze({ ...validated, retry: false });
  }
  if (eventName === "issue_comment") {
    if (event.action !== "created" || event.comment?.body !== "retry") {
      throw new TypeError("Retry comment must be exactly retry");
    }
    if (!trustedAssociations.has(event.comment?.author_association)) {
      throw new TypeError("Retry author is not a trusted repository collaborator");
    }
    const validated = validateIssue(event.issue);
    validateIssueActor(event.issue, validated.request, event.repository?.owner?.login);
    if (!validated.labels.includes("failed")) {
      throw new TypeError("Retry is allowed only on a failed rebind issue");
    }
    return Object.freeze({ ...validated, retry: true });
  }
  if (eventName === "repository_dispatch") {
    if (event.action !== "chatgpt-rebind") {
      throw new TypeError("repository_dispatch action must be chatgpt-rebind");
    }
    const payload = event.client_payload;
    if (!plainObject(payload) || !Number.isSafeInteger(payload.issueNumber) || payload.issueNumber <= 0) {
      throw new TypeError("repository_dispatch requires a positive issueNumber");
    }
    const expectedPayloadKeys = ["issueNumber", "request"];
    if (Object.hasOwn(payload, "retry")) expectedPayloadKeys.push("retry");
    if (Object.hasOwn(payload, "automaticRetrySourceRunId")) {
      expectedPayloadKeys.push("automaticRetrySourceRunId");
    }
    if (!exactKeys(payload, expectedPayloadKeys)) {
      throw new TypeError("repository_dispatch has unexpected or missing fields");
    }
    const {
      issueNumber,
      request: requestValue,
      retry = false,
      automaticRetrySourceRunId,
    } = payload;
    if (typeof retry !== "boolean") {
      throw new TypeError("repository_dispatch retry must be boolean");
    }
    if (
      automaticRetrySourceRunId !== undefined &&
      (!retry ||
        !Number.isSafeInteger(automaticRetrySourceRunId) ||
        automaticRetrySourceRunId <= 0)
    ) {
      throw new TypeError("Automatic retry source run must be a positive retry lineage ID");
    }
    return Object.freeze({
      issueNumber,
      labels: Object.freeze([]),
      request: validateRequest(requestValue),
      retry,
      automaticRetrySourceRunId,
    });
  }
  if (eventName === "workflow_dispatch") {
    const input = event.inputs;
    if (!plainObject(input) || !/^\d+$/.test(input.issue_number ?? "")) {
      throw new TypeError("workflow_dispatch requires a positive issue_number");
    }
    const mode = input.mode;
    const request = {
      schema: 2,
      mode,
      version: input.version,
      appBuild: input.app_build,
      downloadUrl: input.download_url,
      downloadLength: Number(input.download_length),
      downloadEdSignature: input.download_ed_signature,
      ...(mode === "backtest"
        ? {
            snapshotSha256: input.snapshot_sha256,
            batchId: input.batch_id,
            offset: Number(input.offset),
          }
        : {}),
    };
    const issueNumber = Number(input.issue_number);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
      throw new TypeError("workflow_dispatch issue_number must be positive");
    }
    return Object.freeze({
      issueNumber,
      labels: Object.freeze([]),
      request: validateRequest(request),
      retry: false,
    });
  }
  throw new TypeError(`Unsupported GitHub event: ${eventName}`);
}

export function repositoryDispatchBody(
  request,
  issueNumber,
  retry = false,
  automaticRetrySourceRunId,
) {
  const validatedRequest = validateRequest(request);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new TypeError("Repository dispatch issue number must be positive");
  }
  if (typeof retry !== "boolean") {
    throw new TypeError("Repository dispatch retry must be boolean");
  }
  if (
    automaticRetrySourceRunId !== undefined &&
    (!retry ||
      !Number.isSafeInteger(automaticRetrySourceRunId) ||
      automaticRetrySourceRunId <= 0)
  ) {
    throw new TypeError("Repository dispatch retry lineage must be positive");
  }
  return Object.freeze({
    event_type: "chatgpt-rebind",
    client_payload: Object.freeze({
      request: validatedRequest,
      issueNumber,
      ...(retry ? { retry: true } : {}),
      ...(automaticRetrySourceRunId
        ? { automaticRetrySourceRunId }
        : {}),
    }),
  });
}

export function requestsFromSnapshot(snapshot, batchId, offsets = fixedBacktestOffsets) {
  if (
    !plainObject(snapshot) ||
    snapshot.schemaVersion !== 2 ||
    !digestPattern.test(snapshot.snapshotSha256 ?? "") ||
    !Array.isArray(snapshot.builds)
  ) {
    throw new TypeError("Invalid appcast snapshot");
  }
  if (!digestPattern.test(batchId ?? "")) {
    throw new TypeError("Backtest batch attempt has no exact identity");
  }
  return offsets.map((offset) => {
    const build = snapshot.builds.find((candidate) => candidate?.offset === offset);
    if (!build) throw new Error(`Appcast snapshot has no offset ${offset}`);
    return validateRequest({
      schema: 2,
      mode: "backtest",
      version: build.version,
      appBuild: build.appBuild,
      downloadUrl: build.downloadUrl,
      downloadLength: build.downloadLength,
      downloadEdSignature: build.downloadEdSignature,
      snapshotSha256: snapshot.snapshotSha256,
      batchId,
      offset,
    });
  });
}

function runGh(arguments_, options = {}) {
  const result = spawnSync("gh", arguments_, {
    encoding: "utf8",
    input: options.input,
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
    stdio: options.input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`gh ${arguments_.join(" ")} timed out after 120 seconds`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`gh ${arguments_.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function bindingIssues(repository, state = "all") {
  return JSON.parse(
    runGh([
      "api",
      "--paginate",
      "--slurp",
      `repos/${repository}/issues?state=${state}&labels=chatgpt-binding&per_page=100`,
    ]),
  ).flat();
}

async function ensureLabels(repository) {
  const definitions = [
    ["chatgpt-binding", "5319e7", "Automated exact-build ChatGPT binding"],
    ["pending", "d4c5f9", "Waiting for binding generation"],
    ["in-progress", "fbca04", "Binding generation is running"],
    ["failed", "d73a4a", "Binding generation failed"],
    ["success", "0e8a16", "Binding generation and publication succeeded"],
    ["queued", "bfdadc", "Waiting for an earlier binding in the same frozen batch"],
  ];
  for (const [name, color, description] of definitions) {
    runGh([
      "label",
      "create",
      name,
      "--repo",
      repository,
      "--color",
      color,
      "--description",
      description,
      "--force",
    ]);
  }
}

async function createOrReuseIssue(repository, request, status = "pending") {
  const title = issueTitle(request);
  const pages = bindingIssues(repository);
  const matches = pages.filter((issue) => !issue.pull_request && issue.title === title);
  const exactMatches = matches.filter((issue) => {
    try {
      validateIssue(issue, request);
      return true;
    } catch {
      return false;
    }
  });
  if (exactMatches.length > 1) throw new Error(`Multiple exact rebind issues have title ${title}`);
  if (exactMatches.length === 1) {
    const issue = exactMatches[0];
    if (issue.user?.login !== "github-actions[bot]") {
      throw new Error(`Existing rebind issue ${issue.number} is not bot-owned`);
    }
    validateIssue(issue, request);
    const liveLabels = labelsOf(issue);
    if (["queued", "pending", "in-progress"].some((label) => liveLabels.includes(label))) {
      return issue.number;
    }
    if (issue.state === "closed") {
      runGh(["issue", "reopen", String(issue.number), "--repo", repository]);
    }
    setIssueStatus(repository, issue.number, status);
    return issue.number;
  }

  const temporary = await mkdtemp(path.join(os.tmpdir(), "chatgpt-rebind-issue."));
  try {
    const bodyFile = path.join(temporary, "body.json");
    await writeFile(bodyFile, issueBody(request), { encoding: "utf8", mode: 0o600 });
    const output = runGh([
      "issue",
      "create",
      "--repo",
      repository,
      "--title",
      title,
      "--body-file",
      bodyFile,
      "--label",
      `chatgpt-binding,${status}`,
    ]).trim();
    const match = /\/(\d+)$/.exec(output);
    if (!match) throw new Error(`Could not read issue number from ${output}`);
    return Number(match[1]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function dispatch(
  repository,
  request,
  issueNumber,
  retry = false,
  automaticRetrySourceRunId,
) {
  const payload = JSON.stringify(
    repositoryDispatchBody(request, issueNumber, retry, automaticRetrySourceRunId),
  );
  runGh(
    ["api", "--method", "POST", `repos/${repository}/dispatches`, "--input", "-"],
    { input: payload },
  );
}

function batchComment(metadata) {
  return `<!-- chatgpt-rebind-batch-v1\n${JSON.stringify(metadata)}\n-->`;
}

export function validateBatchMetadata(value, issueNumber, request) {
  if (
    !plainObject(value) ||
    !exactKeys(value, ["schema", "batchId", "snapshotSha256", "index", "total", "issues"]) ||
    value.schema !== 1 ||
    !digestPattern.test(value.batchId ?? "") ||
    !digestPattern.test(value.snapshotSha256 ?? "") ||
    !Number.isSafeInteger(value.index) ||
    !Number.isSafeInteger(value.total) ||
    value.index < 0 ||
    value.total !== fixedBacktestOffsets.length ||
    !Array.isArray(value.issues) ||
    value.issues.length !== value.total ||
    value.issues.some(
      (candidate, index) =>
        !Number.isSafeInteger(candidate) ||
        candidate <= 0 ||
        value.issues.indexOf(candidate) !== index,
    ) ||
    value.issues[value.index] !== issueNumber
  ) {
    throw new TypeError("Invalid rebind batch metadata");
  }
  const validatedRequest = validateRequest(request);
  if (
    validatedRequest.mode !== "backtest" ||
    validatedRequest.batchId !== value.batchId ||
    validatedRequest.snapshotSha256 !== value.snapshotSha256
  ) {
    throw new TypeError("Batch metadata does not match the exact backtest request");
  }
  return Object.freeze({ ...value, issues: Object.freeze([...value.issues]) });
}

function metadataFromComments(comments, issueNumber, request) {
  if (!Array.isArray(comments)) throw new TypeError("Issue comments must be an array");
  const candidates = comments.flatMap((comment) => {
    if (comment?.user?.login !== "github-actions[bot]" || typeof comment.body !== "string") {
      return [];
    }
    const match = /^<!-- chatgpt-rebind-batch-v1\n([^\n]+)\n-->$/.exec(comment.body);
    if (!match) return [];
    return [{ id: comment.id, value: JSON.parse(match[1]) }];
  });
  if (candidates.length === 0) throw new Error(`Issue ${issueNumber} has no trusted batch metadata`);
  candidates.sort((left, right) => left.id - right.id);
  return validateBatchMetadata(candidates.at(-1).value, issueNumber, request);
}

function liveIssue(repository, issueNumber) {
  return JSON.parse(runGh(["api", `repos/${repository}/issues/${issueNumber}`]));
}

function issueComments(repository, issueNumber) {
  const output = runGh([
    "api",
    "--paginate",
    `repos/${repository}/issues/${issueNumber}/comments?per_page=100`,
    "--jq",
    '.[] | select(.user.login == "github-actions[bot]") | {id, body, created_at, user: {login: .user.login}}',
  ]).trim();
  if (output === "") return [];
  return output.split("\n").map((line) => JSON.parse(line));
}

function setIssueStatus(repository, issueNumber, status) {
  runGh(
    ["api", "--method", "PATCH", `repos/${repository}/issues/${issueNumber}`, "--input", "-"],
    { input: JSON.stringify({ labels: ["chatgpt-binding", status] }) },
  );
}

async function continueBatch(repository, issueNumber, outcome) {
  if (!['success', 'failed'].includes(outcome)) {
    throw new TypeError("Batch outcome must be success or failed");
  }
  const current = liveIssue(repository, issueNumber);
  const validatedCurrent = validateIssue(current);
  if (validatedCurrent.request.mode !== "backtest") return;
  if (current.user?.login !== "github-actions[bot]") {
    throw new Error(`Batch issue ${issueNumber} is not bot-owned`);
  }
  const metadata = metadataFromComments(
    issueComments(repository, issueNumber),
    issueNumber,
    validatedCurrent.request,
  );
  const sequence = [];
  for (let index = 0; index < metadata.total; index += 1) {
    const memberNumber = metadata.issues[index];
    const member = liveIssue(repository, memberNumber);
    if (member.user?.login !== "github-actions[bot]") {
      throw new Error(`Batch issue ${memberNumber} is not bot-owned`);
    }
    const validatedMember = validateIssue(member);
    const memberMetadata = metadataFromComments(
      issueComments(repository, memberNumber),
      memberNumber,
      validatedMember.request,
    );
    if (
      memberMetadata.batchId !== metadata.batchId ||
      memberMetadata.snapshotSha256 !== metadata.snapshotSha256 ||
      memberMetadata.index !== index ||
      memberMetadata.total !== metadata.total ||
      JSON.stringify(memberMetadata.issues) !== JSON.stringify(metadata.issues)
    ) {
      throw new Error(`Batch issue ${memberNumber} does not match its trusted sequence`);
    }
    sequence.push({
      issue: member,
      request: validatedMember.request,
      state: classifyBatchIssue(member),
    });
  }
  if (sequence[metadata.index].state !== outcome) {
    throw new Error(`Batch issue ${issueNumber} is not terminal ${outcome}`);
  }
  await applyBatchProgress(repository, metadata, sequence);
}

async function applyBatchProgress(repository, metadata, sequence) {
  const decision = decideBatchProgress(sequence.map(({ state }) => state));
  if (decision.action === "stop") {
    for (let index = decision.index + 1; index < sequence.length; index += 1) {
      if (sequence[index].state === "queued") {
        const memberNumber = metadata.issues[index];
        setIssueStatus(repository, memberNumber, "failed");
        runGh([
          "issue",
          "comment",
          String(memberNumber),
          "--repo",
          repository,
          "--body",
          `Batch stopped because predecessor issue ${metadata.issues[decision.index]} failed.`,
        ]);
      }
    }
    return;
  }
  if (decision.action === "dispatch") {
    const memberNumber = metadata.issues[decision.index];
    setIssueStatus(repository, memberNumber, "pending");
    await dispatch(repository, sequence[decision.index].request, memberNumber);
  }
}

function completeBatchSequence(repository, issues, batchId) {
  const members = [];
  for (const issue of issues) {
    if (issue.user?.login !== "github-actions[bot]") continue;
    let validated;
    try {
      validated = validateIssue(issue);
    } catch {
      continue;
    }
    if (
      validated.request.mode === "backtest" &&
      validated.request.batchId === batchId
    ) {
      members.push({ issue, request: validated.request });
    }
  }
  const byNumber = new Map(members.map((member) => [member.issue.number, member]));
  let expectedMetadata;
  const metadataByNumber = new Map();
  for (const member of members) {
    const comments = issueComments(repository, member.issue.number);
    let metadata;
    try {
      metadata = metadataFromComments(
        comments,
        member.issue.number,
        member.request,
      );
    } catch {
      continue;
    }
    metadataByNumber.set(member.issue.number, metadata);
    expectedMetadata ??= metadata;
  }
  if (!expectedMetadata) return undefined;
  const sequence = [];
  for (let index = 0; index < expectedMetadata.total; index += 1) {
    const issueNumber = expectedMetadata.issues[index];
    const member = byNumber.get(issueNumber);
    const metadata = metadataByNumber.get(issueNumber);
    if (
      !member ||
      !metadata ||
      metadata.batchId !== expectedMetadata.batchId ||
      metadata.snapshotSha256 !== expectedMetadata.snapshotSha256 ||
      metadata.index !== index ||
      metadata.total !== expectedMetadata.total ||
      JSON.stringify(metadata.issues) !== JSON.stringify(expectedMetadata.issues) ||
      member.request.offset !== fixedBacktestOffsets[index]
    ) {
      return undefined;
    }
    sequence.push({
      issue: member.issue,
      request: member.request,
      state: classifyBatchIssue(member.issue),
    });
  }
  return Object.freeze({ metadata: expectedMetadata, sequence: Object.freeze(sequence) });
}

export function decideQueuedBatchRecovery(issues, metadataComplete, now = Date.now()) {
  if (!Array.isArray(issues) || issues.length === 0 || typeof metadataComplete !== "boolean") {
    throw new TypeError("Queued batch recovery input is invalid");
  }
  const createdTimes = issues.map((issue) => Date.parse(issue?.created_at ?? ""));
  if (
    createdTimes.some((createdAt) => !Number.isFinite(createdAt)) ||
    issues.some((issue) => classifyBatchIssue(issue) !== "queued")
  ) {
    throw new TypeError("Queued batch recovery requires exact queued issue timestamps");
  }
  const newestIssue = Math.max(...createdTimes);
  if (now - newestIssue < queuedBatchGraceMilliseconds) return "wait";
  return metadataComplete ? "resume" : "fail-partial";
}

export function classifyBatchIssue(issue) {
  if (!plainObject(issue) || !["open", "closed"].includes(issue.state)) {
    throw new TypeError("Batch issue has no valid state");
  }
  const labels = labelsOf(issue);
  if (labels.includes("failed")) return "failed";
  if (issue.state === "closed" && labels.includes("success")) return "success";
  if (issue.state === "closed") return "failed";
  if (labels.includes("in-progress")) return "in-progress";
  if (labels.includes("pending")) return "pending";
  if (labels.includes("queued")) return "queued";
  return "invalid";
}

export function decideBatchProgress(states) {
  if (!Array.isArray(states) || states.length === 0) {
    throw new TypeError("Batch states must be a non-empty array");
  }
  const valid = new Set(["success", "failed", "queued", "pending", "in-progress"]);
  if (states.some((state) => !valid.has(state))) {
    throw new TypeError("Batch has an invalid member state");
  }
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index];
    if (state === "success") continue;
    if (state === "failed") return Object.freeze({ action: "stop", index });
    if (state === "queued") return Object.freeze({ action: "dispatch", index });
    return Object.freeze({ action: "wait", index });
  }
  return Object.freeze({ action: "complete" });
}

export function assertBatchLeaseAvailable(issues, batchId) {
  if (!Array.isArray(issues) || !digestPattern.test(batchId ?? "")) {
    throw new TypeError("Batch lease input is invalid");
  }
  const activeBatches = new Set();
  for (const issue of issues) {
    if (
      issue?.state !== "open" ||
      issue?.user?.login !== "github-actions[bot]" ||
      !labelsOf(issue).some((label) => ["queued", "pending", "in-progress"].includes(label))
    ) {
      continue;
    }
    let validated;
    try {
      validated = validateIssue(issue);
    } catch {
      continue;
    }
    if (validated.request.mode === "backtest") {
      activeBatches.add(validated.request.batchId);
    }
  }
  if (activeBatches.size > 0) {
    throw new Error(`A frozen backtest batch is already active: ${[...activeBatches].join(", ")}`);
  }
}

export function decideIssueRescue(issue, run, now = Date.now(), retryContext) {
  const labels = labelsOf(issue);
  if (labels.includes("failed")) {
    const sourceRunId = retryContext?.sourceRunId;
    const latestRunId = retryContext?.latestRunId;
    const isSameSource =
      Number.isSafeInteger(sourceRunId) &&
      (sourceRunId === latestRunId || (sourceRunId === 0 && latestRunId === undefined));
    return isSameSource && (retryContext?.dispatchAttempts ?? 0) < 2
      ? "redrive-retry"
      : "ignore";
  }
  if (labels.includes("queued") || labels.includes("success")) {
    return "ignore";
  }
  if (labels.includes("pending")) {
    return (retryContext?.pendingRedriveAttempts ?? 0) < 1
      ? "redrive"
      : "fail";
  }
  if (!labels.includes("in-progress")) return "ignore";
  if (!run) {
    return (retryContext?.pendingRedriveAttempts ?? 0) < 1
      ? "retry"
      : "fail";
  }
  if (run.status !== "completed") return "wait";
  if (run.conclusion === "success") return "recover";
  const completedAt = Date.parse(run.updated_at ?? "");
  if (Number.isFinite(completedAt) && now - completedAt < 30 * 60_000) return "wait";
  if (retryContext?.transientFailure === true) return "retry-transient";
  return "fail";
}

function latestStartedRunId(comments) {
  const ids = comments.flatMap((comment) => {
    if (comment?.user?.login !== "github-actions[bot]" || typeof comment.body !== "string") {
      return [];
    }
    const match = /\/actions\/runs\/(\d+)/.exec(comment.body);
    return match ? [Number(match[1])] : [];
  });
  return ids.at(-1);
}

function recentRescueMarker(comments, now = Date.now()) {
  return comments.some((comment) => {
    if (comment?.user?.login !== "github-actions[bot]" || typeof comment.body !== "string") {
      return false;
    }
    const match = /^<!-- chatgpt-rebind-rescue-v1 (\d+) -->$/.exec(comment.body);
    return match && now - Number(match[1]) < 20 * 60_000;
  });
}

export function pendingRedriveAttempts(comments, cycleStartedAt) {
  if (!Array.isArray(comments) || !Number.isFinite(cycleStartedAt)) {
    throw new TypeError("Pending redrive history requires one issue cycle boundary");
  }
  return comments.filter((comment) => {
    if (comment?.user?.login !== "github-actions[bot]" || typeof comment.body !== "string") {
      return false;
    }
    const createdAt = Date.parse(comment.created_at ?? "");
    return (
      Number.isFinite(createdAt) &&
      createdAt >= cycleStartedAt &&
      /^<!-- chatgpt-rebind-pending-redrive-v1 [1-9]\d* -->$/.test(comment.body)
    );
  }).length;
}

function issueCycleStartedAt(repository, issue) {
  let startedAt = Date.parse(issue?.created_at ?? "");
  if (!Number.isFinite(startedAt)) {
    throw new TypeError(`Issue ${issue?.number ?? "unknown"} has no creation time`);
  }
  const output = runGh([
    "api",
    "--paginate",
    `repos/${repository}/issues/${issue.number}/timeline?per_page=100`,
    "--jq",
    '.[] | select(.event == "reopened") | .created_at',
  ]).trim();
  for (const value of output === "" ? [] : output.split("\n")) {
    const reopenedAt = Date.parse(value);
    if (Number.isFinite(reopenedAt) && reopenedAt > startedAt) startedAt = reopenedAt;
  }
  return startedAt;
}

function transientFailureForRun(repository, run) {
  if (
    !run ||
    run.status !== "completed" ||
    !["failure", "startup_failure", "stale"].includes(run.conclusion)
  ) {
    return false;
  }
  if (["startup_failure", "stale"].includes(run.conclusion)) {
    return shouldRetryTransientFailure(run, [], []);
  }
  const pages = JSON.parse(
    runGh([
      "api",
      "--paginate",
      "--slurp",
      `repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`,
    ]),
  );
  const jobs = pages
    .flatMap((page) => page?.jobs ?? [])
    .filter((job) => job?.status === "completed");
  const annotations = jobs.flatMap((job) =>
    JSON.parse(
      runGh([
        "api",
        "--paginate",
        "--slurp",
        `repos/${repository}/check-runs/${job.id}/annotations?per_page=100`,
      ]),
    ).flat(),
  );
  return shouldRetryTransientFailure(run, jobs, annotations);
}

function latestAutomaticRetry(comments) {
  const markers = comments.flatMap((comment) => {
    if (comment?.user?.login !== "github-actions[bot]" || typeof comment.body !== "string") {
      return [];
    }
    const match = /^<!-- chatgpt-rebind-auto-retry-v1 (\d+) -->$/.exec(comment.body);
    return match ? [Number(match[1])] : [];
  });
  return markers.at(-1);
}

export function retryLineageForRun(comments, runId) {
  const parents = comments.flatMap((comment) => {
    if (comment?.user?.login !== "github-actions[bot]" || typeof comment.body !== "string") {
      return [];
    }
    const match = /^<!-- chatgpt-rebind-run-lineage-v1 (\d+) (\d+) -->$/.exec(
      comment.body,
    );
    return match && Number(match[1]) === runId ? [Number(match[2])] : [];
  });
  if (parents.length !== 1) return undefined;
  return parents[0];
}

function automaticRetryDispatchAttempts(comments, sourceRunId) {
  if (!Number.isSafeInteger(sourceRunId) || sourceRunId < 0) return 0;
  const attempts = comments.flatMap((comment) => {
    if (comment?.user?.login !== "github-actions[bot]" || typeof comment.body !== "string") {
      return [];
    }
    const match = /^<!-- chatgpt-rebind-auto-retry-dispatch-v1 (\d+) (\d+) -->$/.exec(
      comment.body,
    );
    if (!match || Number(match[1]) !== sourceRunId) return [];
    return [Number(match[2])];
  });
  return attempts.length > 0 ? Math.max(...attempts) : 0;
}

export function automaticRetryIsPending(comments) {
  const sourceRunId = latestAutomaticRetry(comments);
  return (
    Number.isSafeInteger(sourceRunId) &&
    latestStartedRunId(comments) === sourceRunId &&
    automaticRetryDispatchAttempts(comments, sourceRunId) < 2
  );
}

export function canAutomaticallyRetry(runId, automaticParentRunId) {
  return (
    Number.isSafeInteger(runId) &&
    runId > 0 &&
    automaticParentRunId === 0
  );
}

function recordAutomaticRetryDispatch(repository, issueNumber, sourceRunId, attempt) {
  if (
    !Number.isSafeInteger(sourceRunId) ||
    sourceRunId < 0 ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    attempt > 2
  ) {
    throw new TypeError("Automatic retry dispatch marker is invalid");
  }
  addIssueComment(
    repository,
    issueNumber,
    `<!-- chatgpt-rebind-auto-retry-dispatch-v1 ${sourceRunId} ${attempt} -->`,
  );
}

function addIssueComment(repository, issueNumber, body) {
  runGh(
    [
      "api",
      "--method",
      "POST",
      `repos/${repository}/issues/${issueNumber}/comments`,
      "--input",
      "-",
    ],
    { input: JSON.stringify({ body }) },
  );
}

function exactBindingOnMain(repository, request) {
  const reference = JSON.parse(runGh(["api", `repos/${repository}/git/ref/heads/main`]));
  const sourceSha = reference.object?.sha;
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "")) return undefined;
  let manifestResponse;
  try {
    manifestResponse = JSON.parse(
      runGh([
        "api",
        `repos/${repository}/contents/runtime/bindings/${request.version}/manifest.json?ref=${sourceSha}`,
      ]),
    );
  } catch {
    return undefined;
  }
  const manifest = JSON.parse(
    Buffer.from(manifestResponse.content ?? "", "base64").toString("utf8"),
  );
  return manifest.version === request.version &&
    manifest.appBuild === request.appBuild &&
    manifest.downloadUrl === request.downloadUrl &&
    manifest.downloadLength === request.downloadLength &&
    manifest.downloadEdSignature === request.downloadEdSignature
    ? sourceSha
    : undefined;
}

async function rescueRepository(repository, workerActor) {
  const issues = bindingIssues(repository);
  const reconciledBatches = new Set();
  for (const issue of issues) {
    if (issue.user?.login !== "github-actions[bot]") continue;
    let validated;
    try {
      validated = validateIssue(issue);
    } catch {
      continue;
    }
    if (validated.request.mode !== "backtest") continue;
    const state = classifyBatchIssue(issue);
    if (state !== "success" && state !== "failed") continue;
    const comments = issueComments(repository, issue.number);
    if (state === "failed" && automaticRetryIsPending(comments)) continue;
    let metadata;
    try {
      metadata = metadataFromComments(
        comments,
        issue.number,
        validated.request,
      );
    } catch {
      continue;
    }
    if (reconciledBatches.has(metadata.batchId)) continue;
    await continueBatch(repository, issue.number, state);
    reconciledBatches.add(metadata.batchId);
  }

  const refreshedIssues = bindingIssues(repository);
  const queuedByBatch = new Map();
  for (const issue of refreshedIssues) {
    if (
      issue.state !== "open" ||
      issue.user?.login !== "github-actions[bot]" ||
      classifyBatchIssue(issue) !== "queued"
    ) {
      continue;
    }
    let validated;
    try {
      validated = validateIssue(issue);
    } catch {
      continue;
    }
    if (validated.request.mode !== "backtest") continue;
    const queued = queuedByBatch.get(validated.request.batchId) ?? [];
    queued.push(issue);
    queuedByBatch.set(validated.request.batchId, queued);
  }
  for (const [batchId, queuedIssues] of queuedByBatch) {
    const complete = completeBatchSequence(repository, refreshedIssues, batchId);
    const action = decideQueuedBatchRecovery(
      queuedIssues,
      complete !== undefined,
    );
    if (action === "wait") continue;
    if (action === "resume") {
      await applyBatchProgress(repository, complete.metadata, complete.sequence);
      continue;
    }
    const hasLiveMember = refreshedIssues.some((issue) => {
      let validated;
      try {
        validated = validateIssue(issue);
      } catch {
        return false;
      }
      return (
        validated.request.mode === "backtest" &&
        validated.request.batchId === batchId &&
        ["pending", "in-progress"].includes(classifyBatchIssue(issue))
      );
    });
    if (hasLiveMember) continue;
    for (const issue of queuedIssues) {
      setIssueStatus(repository, issue.number, "failed");
      addIssueComment(
        repository,
        issue.number,
        "Incomplete frozen batch metadata after the 30-minute creation grace period; the stale batch lease was released.",
      );
    }
  }

  for (const listed of bindingIssues(repository, "open")) {
    let validated;
    try {
      validated = validateIssue(listed);
      validateIssueActor(listed, validated.request, workerActor);
    } catch {
      continue;
    }
    const comments = issueComments(repository, listed.number);
    if (recentRescueMarker(comments)) continue;
    const runId = latestStartedRunId(comments);
    const automaticRetrySource = latestAutomaticRetry(comments);
    const automaticRetryDispatchCount = automaticRetryDispatchAttempts(
      comments,
      automaticRetrySource,
    );
    const run = runId
      ? JSON.parse(runGh(["api", `repos/${repository}/actions/runs/${runId}`]))
      : undefined;
    const labels = labelsOf(listed);
    const pendingAttempts =
      labels.includes("pending") || (labels.includes("in-progress") && !run)
        ? pendingRedriveAttempts(
            comments,
            issueCycleStartedAt(repository, listed),
          )
        : 0;
    const retryContext = {
      sourceRunId: automaticRetrySource,
      latestRunId: runId,
      dispatchAttempts: automaticRetryDispatchCount,
      pendingRedriveAttempts: pendingAttempts,
    };
    let decision = decideIssueRescue(listed, run, Date.now(), retryContext);
    if (decision === "fail" && run) {
      decision = decideIssueRescue(listed, run, Date.now(), {
        ...retryContext,
        transientFailure: transientFailureForRun(repository, run),
      });
    }
    if (["ignore", "wait"].includes(decision)) continue;
    if (decision === "redrive") {
      addIssueComment(
        repository,
        listed.number,
        `<!-- chatgpt-rebind-rescue-v1 ${Date.now()} -->`,
      );
      addIssueComment(
        repository,
        listed.number,
        `<!-- chatgpt-rebind-pending-redrive-v1 ${retryContext.pendingRedriveAttempts + 1} -->`,
      );
      await dispatch(repository, validated.request, listed.number);
      continue;
    }
    if (decision === "redrive-retry") {
      addIssueComment(
        repository,
        listed.number,
        `<!-- chatgpt-rebind-rescue-v1 ${Date.now()} -->`,
      );
      recordAutomaticRetryDispatch(
        repository,
        listed.number,
        automaticRetrySource,
        automaticRetryDispatchCount + 1,
      );
      await dispatch(
        repository,
        validated.request,
        listed.number,
        true,
        automaticRetrySource,
      );
      continue;
    }
    if (decision === "retry-transient") {
      await retryTransientRun(repository, workerActor, runId);
      continue;
    }
    if (decision === "recover") {
      addIssueComment(
        repository,
        listed.number,
        `<!-- chatgpt-rebind-rescue-v1 ${Date.now()} -->`,
      );
      const landedSha = exactBindingOnMain(repository, validated.request);
      if (landedSha) {
        addIssueComment(repository, listed.number, `Landed binding SHA: ${landedSha}`);
      }
      addIssueComment(
        repository,
        listed.number,
        `<!-- chatgpt-rebind-auto-retry-v1 ${runId} -->`,
      );
      recordAutomaticRetryDispatch(repository, listed.number, runId, 1);
      setIssueStatus(repository, listed.number, "failed");
      await dispatch(repository, validated.request, listed.number, true, runId);
      continue;
    }
    if (decision === "retry") {
      addIssueComment(
        repository,
        listed.number,
        `<!-- chatgpt-rebind-rescue-v1 ${Date.now()} -->`,
      );
      addIssueComment(
        repository,
        listed.number,
        `<!-- chatgpt-rebind-pending-redrive-v1 ${retryContext.pendingRedriveAttempts + 1} -->`,
      );
      setIssueStatus(repository, listed.number, "pending");
      addIssueComment(
        repository,
        listed.number,
        "No run was recorded for this in-progress issue. The rescuer restored pending state and redrove the exact request.",
      );
      await dispatch(repository, validated.request, listed.number);
      continue;
    }
    setIssueStatus(repository, listed.number, "failed");
    addIssueComment(
      repository,
      listed.number,
      runId
        ? `Binding run ${runId} ended with ${run?.conclusion ?? "an unknown failure"}. Automatic transient reruns are bounded; a trusted collaborator can comment exactly \`retry\`.`
        : "No rebind run started after one bounded dispatch redrive. A trusted collaborator can comment exactly `retry`.",
    );
    if (validated.request.mode === "backtest") {
      await continueBatch(repository, listed.number, "failed");
    }
  }
}

function trustedIssueForRun(repository, workerActor, runId) {
  const matches = [];
  for (const issue of bindingIssues(repository, "open")) {
    let validated;
    try {
      validated = validateIssue(issue);
      validateIssueActor(issue, validated.request, workerActor);
    } catch {
      continue;
    }
    const comments = issueComments(repository, issue.number);
    if (latestStartedRunId(comments) === runId) {
      matches.push({ issue, request: validated.request, comments });
    }
  }
  if (matches.length !== 1) {
    throw new Error(`Run ${runId} must map to exactly one trusted rebind issue`);
  }
  return matches[0];
}

async function settleFailedRun(repository, workerActor, runId) {
  const match = trustedIssueForRun(repository, workerActor, runId);
  setIssueStatus(repository, match.issue.number, "failed");
  addIssueComment(
    repository,
    match.issue.number,
    `Binding run ${runId} did not match the narrow transient-failure criteria. A trusted collaborator can comment exactly \`retry\`.`,
  );
  if (match.request.mode === "backtest") {
    await continueBatch(repository, match.issue.number, "failed");
  }
}

async function retryTransientRun(repository, workerActor, runId) {
  const match = trustedIssueForRun(repository, workerActor, runId);
  if (!canAutomaticallyRetry(runId, retryLineageForRun(match.comments, runId))) {
    setIssueStatus(repository, match.issue.number, "failed");
    addIssueComment(
      repository,
      match.issue.number,
      "The one automatic fresh-base or transient retry was already used. A trusted collaborator can comment exactly `retry`.",
    );
    if (match.request.mode === "backtest") {
      await continueBatch(repository, match.issue.number, "failed");
    }
    return;
  }
  addIssueComment(
    repository,
    match.issue.number,
    `<!-- chatgpt-rebind-auto-retry-v1 ${runId} -->`,
  );
  addIssueComment(
    repository,
    match.issue.number,
    `<!-- chatgpt-rebind-rescue-v1 ${Date.now()} -->`,
  );
  recordAutomaticRetryDispatch(repository, match.issue.number, runId, 1);
  setIssueStatus(repository, match.issue.number, "failed");
  await dispatch(repository, match.request, match.issue.number, true, runId);
}

export function backtestBatchId(repository, runId, runAttempt, snapshotSha256) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") ||
    !/^\d+$/.test(String(runId ?? "")) ||
    !/^[1-9]\d*$/.test(String(runAttempt ?? "")) ||
    !digestPattern.test(snapshotSha256 ?? "")
  ) {
    throw new TypeError("Backtest batch attempt identity is invalid");
  }
  return crypto
    .createHash("sha256")
    .update(`${repository}\0${runId}\0${runAttempt}\0${snapshotSha256}`)
    .digest("hex");
}

function parseCli(argv) {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || index + 1 >= argv.length) {
      throw new Error(`Invalid argument: ${key}`);
    }
    options[key.slice(2)] = argv[++index];
  }
  return { command, options };
}

async function writeValidatedEvent(options) {
  const eventName = options["event-name"];
  const event = JSON.parse(await readFile(options.event, "utf8"));
  const result = requestFromEvent(eventName, event);
  await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  if (options["github-output"]) {
    const lines = [
      `mode=${result.request.mode}`,
      `version=${result.request.version}`,
      `app-build=${result.request.appBuild}`,
      `download-url=${result.request.downloadUrl}`,
      `download-length=${result.request.downloadLength}`,
      `download-ed-signature=${result.request.downloadEdSignature}`,
      `issue-number=${result.issueNumber}`,
      `retry=${result.retry}`,
      `automatic-retry-source-run-id=${result.automaticRetrySourceRunId ?? ""}`,
      `snapshot-sha256=${result.request.snapshotSha256 ?? ""}`,
      `batch-id=${result.request.batchId ?? ""}`,
      `offset=${result.request.offset ?? ""}`,
    ];
    await writeFile(options["github-output"], `${lines.join("\n")}\n`, {
      encoding: "utf8",
      flag: "a",
    });
  }
}

async function validateLiveIssue(options) {
  const result = JSON.parse(await readFile(options.request, "utf8"));
  const issue = JSON.parse(await readFile(options.issue, "utf8"));
  const validated = validateIssue(issue, result.request);
  validateIssueActor(issue, validated.request, options["worker-actor"]);
  if (!validated.labels.includes("chatgpt-binding")) {
    throw new TypeError("Live issue has no chatgpt-binding label");
  }
  const requiredStatus = result.retry ? "failed" : "pending";
  if (!validated.labels.includes(requiredStatus)) {
    throw new TypeError(`Live issue no longer has the ${requiredStatus} label`);
  }
  if (issue.state !== "open") throw new TypeError("Live rebind issue must be open");
}

async function main() {
  const { command, options } = parseCli(process.argv.slice(2));
  if (command === "validate-event") {
    if (!options.event || !options.output || !options["event-name"]) {
      throw new Error("validate-event requires --event-name, --event, and --output");
    }
    await writeValidatedEvent(options);
    return;
  }
  if (command === "validate-live-issue") {
    if (!options.request || !options.issue || !options["worker-actor"]) {
      throw new Error("validate-live-issue requires --request, --issue, and --worker-actor");
    }
    await validateLiveIssue(options);
    return;
  }
  if (command === "continue-batch") {
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository ?? "") ||
      !/^\d+$/.test(options["issue-number"] ?? "") ||
      !["success", "failed"].includes(options.outcome)
    ) {
      throw new Error("continue-batch requires --repository, --issue-number, and --outcome");
    }
    await continueBatch(
      options.repository,
      Number(options["issue-number"]),
      options.outcome,
    );
    return;
  }
  if (command === "rescue") {
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository ?? "") ||
      !/^[A-Za-z0-9_.-]+$/.test(options["worker-actor"] ?? "")
    ) {
      throw new Error("rescue requires --repository and --worker-actor");
    }
    await rescueRepository(options.repository, options["worker-actor"]);
    return;
  }
  if (["retry-transient", "settle-failed"].includes(command)) {
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository ?? "") ||
      !/^[A-Za-z0-9_.-]+$/.test(options["worker-actor"] ?? "") ||
      !/^\d+$/.test(options["run-id"] ?? "")
    ) {
      throw new Error(`${command} requires --repository, --worker-actor, and --run-id`);
    }
    const operation = command === "retry-transient"
      ? retryTransientRun
      : settleFailedRun;
    await operation(
      options.repository,
      options["worker-actor"],
      Number(options["run-id"]),
    );
    return;
  }
  if (command !== "batch") {
    throw new Error("usage: trigger-chatgpt-rebind.mjs batch --snapshot <json> --repository <owner/repo>");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository ?? "")) {
    throw new Error("--repository must be owner/repository");
  }
  if (!options.snapshot) throw new Error("--snapshot is required");
  const snapshot = JSON.parse(await readFile(options.snapshot, "utf8"));
  if (options.offsets !== undefined) {
    throw new Error("Backtest offsets are fixed at 0,2,4");
  }
  const batchId = backtestBatchId(
    options.repository,
    process.env.GITHUB_RUN_ID,
    process.env.GITHUB_RUN_ATTEMPT,
    snapshot.snapshotSha256,
  );
  const requests = requestsFromSnapshot(snapshot, batchId);
  await ensureLabels(options.repository);
  assertBatchLeaseAvailable(bindingIssues(options.repository, "open"), batchId);
  const issueNumbers = [];
  for (const request of requests) {
    const issueNumber = await createOrReuseIssue(options.repository, request, "queued");
    issueNumbers.push(issueNumber);
    process.stdout.write(`${request.version}\t${issueNumber}\n`);
  }
  for (let index = 0; index < requests.length; index += 1) {
    const metadata = {
      schema: 1,
      batchId,
      snapshotSha256: snapshot.snapshotSha256,
      index,
      total: requests.length,
      issues: issueNumbers,
    };
    runGh(
      [
        "api",
        "--method",
        "POST",
        `repos/${options.repository}/issues/${issueNumbers[index]}/comments`,
        "--input",
        "-",
      ],
      { input: JSON.stringify({ body: batchComment(metadata) }) },
    );
  }
  const memberStates = issueNumbers.map((issueNumber) =>
    classifyBatchIssue(liveIssue(options.repository, issueNumber)),
  );
  const decision = decideBatchProgress(memberStates);
  if (decision.action === "dispatch") {
    const issueNumber = issueNumbers[decision.index];
    setIssueStatus(options.repository, issueNumber, "pending");
    await dispatch(options.repository, requests[decision.index], issueNumber);
  } else if (decision.action === "stop") {
    await continueBatch(
      options.repository,
      issueNumbers[decision.index],
      "failed",
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
