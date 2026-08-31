interface Env {
  GITHUB_TOKEN: string;
  CHECK_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  GITHUB_ISSUE_AUTHOR: string;
  VERSION_CLAIMS: D1Database;
}

interface BindingIndexEntry {
  version: string;
  appBuild: string;
  appAsarSha256: string;
  downloadUrl: string;
  downloadLength: number;
  downloadEdSignature: string;
}

interface BindingIndex {
  schemaVersion: 2;
  current: string;
  bindings: Record<string, BindingIndexEntry>;
}

interface SparkleVersion {
  version: string;
  appBuild: string;
  downloadUrl: string;
  downloadLength: number;
  downloadEdSignature: string;
}

interface BindingManifestIdentity {
  adapterVersion: string;
}

type CheckOutcome =
  | "binding-exists"
  | "issue-exists"
  | "issue-created"
  | "issue-reopened"
  | "claim-active";

interface CheckResult {
  version: string;
  downloadUrl: string;
  outcome: CheckOutcome;
  issueNumber?: number;
}

interface ClaimRow {
  state: "creating" | "issue";
  issue_number: number | null;
  lease_expires_at: number;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  body: string | null;
  user?: {
    login?: string;
    type?: string;
  };
}

type CheckTrigger = "scheduled" | "http";

const feedUrl = "https://persistent.oaistatic.com/codex-app-prod/appcast.xml";
const pendingLabel = "pending";
const bindingLabel = "chatgpt-binding";
const userAgent = "chatgpt-extensions-version-watcher";
const requestTimeoutMilliseconds = 10_000;
const claimLeaseSeconds = 10 * 60;
const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const retryableMethods = new Set(["GET", "HEAD", "OPTIONS", "PATCH"]);
const readOnlyMethods = new Set(["GET", "HEAD", "OPTIONS"]);

class AmbiguousMutationError extends Error {
  readonly ambiguousMutation = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AmbiguousMutationError";
  }
}

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runLoggedCheck(env, "scheduled"));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/check") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    if (!authorized(request, env.CHECK_TOKEN)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      return Response.json(await runLoggedCheck(env, "http"));
    } catch (error) {
      return Response.json(
        { error: "check failed", message: errorMessage(error) },
        { status: 500 },
      );
    }
  },
};

function authorized(request: Request, token: string): boolean {
  return token.length >= 24 && request.headers.get("Authorization") === `Bearer ${token}`;
}

async function runLoggedCheck(env: Env, trigger: CheckTrigger): Promise<CheckResult> {
  console.log("[version-watcher] check started", { trigger });
  try {
    const result = await checkChatGptVersion(env);
    console.log("[version-watcher] check completed", { trigger, ...result });
    return result;
  } catch (error) {
    console.error("[version-watcher] check failed", {
      trigger,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error),
    });
    throw error;
  }
}

export async function checkChatGptVersion(env: Env): Promise<CheckResult> {
  if (!validIssueAuthor(env.GITHUB_ISSUE_AUTHOR)) {
    throw new Error("GITHUB_ISSUE_AUTHOR is invalid");
  }
  const versions = await readSparkleFeed();
  const latest = versions[0];
  if (!latest) throw new Error("Sparkle feed has no full arm64 ChatGPT archive");

  const index = await readBindingIndex(env);
  const currentBinding = index.bindings[index.current];
  if (!currentBinding) {
    throw new Error(`Current binding is missing from the index: ${index.current}`);
  }
  const currentManifest = await requireBindingManifest(env, currentBinding);
  const latestBinding = index.bindings[latest.version];
  if (latestBinding && latest.version !== index.current) {
    await requireBindingManifest(env, latestBinding);
  }
  if (
    latest.version === index.current &&
    latestBinding &&
    bindingMatchesFeed(latestBinding, latest)
  ) {
    const manifest = currentManifest;
    if (await hasExactImmutableRelease(env, latestBinding, manifest)) {
      return { ...latest, outcome: "binding-exists" };
    }
  }

  const exactBindingExists = latestBinding !== undefined &&
    bindingMatchesFeed(latestBinding, latest);
  const mode = exactBindingExists ? "current" : latestBinding ? "correction" : "current";

  const title = `ChatGPT ${latest.version} (${latest.appBuild}) binding [${mode}]`;
  const body = issueBody(latest, mode);
  const claimId = claimIdentity(latest);
  const existing = await findIssueByIdentity(env, title, body);
  if (existing?.state === "open") {
    await recordIssueClaim(env, claimId, existing.number);
    return { ...latest, outcome: "issue-exists", issueNumber: existing.number };
  }

  if (mode === "current" && exactBindingExists && latest.version !== index.current) {
    const correctionTitle =
      `ChatGPT ${latest.version} (${latest.appBuild}) binding [correction]`;
    const correctionBody = issueBody(latest, "correction");
    const correction = await findIssueByIdentity(env, correctionTitle, correctionBody);
    if (correction?.state === "open") {
      await recordIssueClaim(env, claimId, correction.number);
      return { ...latest, outcome: "claim-active", issueNumber: correction.number };
    }
  }

  if (existing?.state === "closed") {
    await ensureStatusLabels(env);
    await updateIssue(env, existing.number, {
      state: "open",
      labels: [bindingLabel, pendingLabel],
    });
    await recordIssueClaim(env, claimId, existing.number);
    return { ...latest, outcome: "issue-reopened", issueNumber: existing.number };
  }

  const previousClaim = await readClaim(env, claimId);
  if (previousClaim?.state === "issue" && previousClaim.issue_number) {
    const claimedIssue = await findIssueByNumber(env, previousClaim.issue_number);
    if (claimedIssue?.state === "open" &&
        trustedIssue(env, claimedIssue) &&
        issueMatches(claimedIssue, title, body)) {
      return {
        ...latest,
        outcome: "issue-exists",
        issueNumber: claimedIssue.number,
      };
    }
    if (claimedIssue?.state === "closed" &&
        trustedIssue(env, claimedIssue) &&
        issueMatches(claimedIssue, title, body)) {
      await ensureStatusLabels(env);
      await updateIssue(env, claimedIssue.number, {
        state: "open",
        labels: [bindingLabel, pendingLabel],
      });
      await recordIssueClaim(env, claimId, claimedIssue.number);
      return {
        ...latest,
        outcome: "issue-reopened",
        issueNumber: claimedIssue.number,
      };
    }
    await deleteIssueClaim(env, claimId);
  }

  const now = Math.floor(Date.now() / 1000);
  const claimed = await acquireClaim(env, claimId, now);
  if (!claimed) {
    const claim = await readClaim(env, claimId);
    return {
      ...latest,
      outcome: "claim-active",
      ...(claim?.issue_number ? { issueNumber: claim.issue_number } : {}),
    };
  }

  let trustedIssueCreated = false;
  try {
    await ensureStatusLabels(env);
    const issue = await createIssue(env, title, body);
    if (!trustedIssue(env, issue) || !issueMatches(issue, title, body)) {
      throw new AmbiguousMutationError(
        "The created issue does not have the configured trusted identity",
      );
    }
    trustedIssueCreated = true;
    await recordIssueClaim(env, claimId, issue.number);
    return { ...latest, outcome: "issue-created", issueNumber: issue.number };
  } catch (error) {
    if (!trustedIssueCreated && !isAmbiguousMutationError(error)) {
      await releaseClaim(env, claimId);
    }
    throw error;
  }
}

async function readBindingIndex(env: Env): Promise<BindingIndex> {
  const value = await githubRawJson<unknown>(env, "runtime/bindings/index.json");
  if (!isRecord(value) || value.schemaVersion !== 2 ||
      typeof value.current !== "string" || !versionPattern(value.current) ||
      !isRecord(value.bindings)) {
    throw new Error("runtime/bindings/index.json has an invalid schema");
  }
  const bindings: Record<string, BindingIndexEntry> = {};
  for (const [version, raw] of Object.entries(value.bindings)) {
    if (!versionPattern(version) || !isRecord(raw) || raw.version !== version ||
        typeof raw.appBuild !== "string" || raw.appBuild.length === 0 ||
        typeof raw.appAsarSha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.appAsarSha256) ||
        typeof raw.downloadUrl !== "string" || raw.downloadUrl !== archiveUrl(version) ||
        typeof raw.downloadLength !== "number" || !validDownloadLength(raw.downloadLength) ||
        typeof raw.downloadEdSignature !== "string" ||
          !validEdSignature(raw.downloadEdSignature)) {
      throw new Error(`Invalid binding index entry: ${version}`);
    }
    bindings[version] = {
      version,
      appBuild: raw.appBuild,
      appAsarSha256: raw.appAsarSha256,
      downloadUrl: raw.downloadUrl,
      downloadLength: raw.downloadLength,
      downloadEdSignature: raw.downloadEdSignature,
    };
  }
  if (!bindings[value.current]) {
    throw new Error(`Current binding is missing from the index: ${value.current}`);
  }
  return { schemaVersion: 2, current: value.current, bindings };
}

async function requireBindingManifest(
  env: Env,
  expected: BindingIndexEntry,
  ref = env.GITHUB_BRANCH,
): Promise<BindingManifestIdentity> {
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/` +
      `runtime/bindings/${encodeURIComponent(expected.version)}/manifest.json` +
      `?ref=${encodeURIComponent(ref)}`,
    { headers: { Accept: "application/vnd.github.raw+json" } },
  );
  if (!response.ok) {
    throw new Error(
      `Binding index references a missing manifest for ${expected.version}: ${response.status}`,
    );
  }
  const manifest: unknown = await response.json();
  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== 2 ||
    manifest.version !== expected.version ||
    manifest.appBuild !== expected.appBuild ||
    manifest.appAsarSha256 !== expected.appAsarSha256 ||
    manifest.downloadUrl !== expected.downloadUrl ||
    manifest.downloadLength !== expected.downloadLength ||
    manifest.downloadEdSignature !== expected.downloadEdSignature ||
    typeof manifest.apiVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.apiVersion) ||
    typeof manifest.adapterVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.adapterVersion) ||
    !isRecord(manifest.artifacts)
  ) {
    throw new Error(
      `Binding index references an invalid manifest for ${expected.version}`,
    );
  }
  return Object.freeze({ adapterVersion: manifest.adapterVersion });
}

async function hasExactImmutableRelease(
  env: Env,
  expected: BindingIndexEntry,
  manifest: BindingManifestIdentity,
): Promise<boolean> {
  const tag = `binding-${expected.version}-v${manifest.adapterVersion}`;
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`,
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `Binding release lookup failed for ${expected.version}: ${response.status} ${await response.text()}`,
    );
  }
  const release: unknown = await response.json();
  const baseName = `chatgpt-binding-${expected.version}-v${manifest.adapterVersion}.zip`;
  const expectedNames = [baseName, `${baseName}.sha256`].sort();
  if (
    !isRecord(release) ||
    release.tag_name !== tag ||
    release.draft !== false ||
    release.prerelease !== false ||
    release.immutable !== true ||
    !Array.isArray(release.assets) ||
    release.assets.length !== expectedNames.length
  ) {
    return false;
  }
  const assets = release.assets;
  const names = assets.map((asset) => isRecord(asset) ? asset.name : undefined).sort();
  if (
    names.some((name) => typeof name !== "string") ||
    names.some((name, index) => name !== expectedNames[index]) ||
    assets.some((asset) =>
      !isRecord(asset) ||
      asset.state !== "uploaded" ||
      typeof asset.digest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
    )
  ) {
    return false;
  }
  const archiveAsset = assets.find(
    (asset) => isRecord(asset) && asset.name === baseName,
  );
  const checksumAsset = assets.find(
    (asset) => isRecord(asset) && asset.name === `${baseName}.sha256`,
  );
  if (
    !isRecord(archiveAsset) ||
    !isRecord(checksumAsset) ||
    !Number.isSafeInteger(checksumAsset.id) ||
    typeof archiveAsset.digest !== "string" ||
    typeof checksumAsset.digest !== "string"
  ) {
    return false;
  }
  const checksumResponse = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/releases/assets/${checksumAsset.id}`,
    { headers: { Accept: "application/octet-stream" } },
  );
  if (!checksumResponse.ok) {
    throw new Error(
      `Binding checksum download failed for ${expected.version}: ${checksumResponse.status}`,
    );
  }
  const checksumBytes = new Uint8Array(await checksumResponse.arrayBuffer());
  const checksumDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", checksumBytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const archiveDigest = archiveAsset.digest.slice("sha256:".length);
  if (
    checksumAsset.digest !== `sha256:${checksumDigest}` ||
    new TextDecoder().decode(checksumBytes) !== `${archiveDigest}  ${baseName}\n`
  ) {
    return false;
  }
  const taggedManifest = await requireBindingManifest(env, expected, tag);
  if (taggedManifest.adapterVersion !== manifest.adapterVersion) {
    return false;
  }
  return true;
}

export async function readSparkleFeed(): Promise<readonly SparkleVersion[]> {
  const response = await fetchWithRetry(feedUrl, {
    headers: {
      Accept: "application/xml,text/xml,*/*",
      "User-Agent": `${userAgent}/1.0 (+https://github.com/zats/chatgpt-extensions)`,
    },
  });
  if (!response.ok) {
    throw new Error(`Sparkle feed failed: ${response.status} ${await response.text()}`);
  }
  return parseSparkleFeed(await response.text());
}

export function parseSparkleFeed(xml: string): readonly SparkleVersion[] {
  const results: SparkleVersion[] = [];
  const seen = new Set<string>();
  for (const itemMatch of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = itemMatch[1] ?? "";
    const title = elementText(item, "title");
    const version = elementText(item, "sparkle:shortVersionString");
    const appBuild = elementText(item, "sparkle:version");
    const hardware = elementText(item, "sparkle:hardwareRequirements");
    if (hardware !== "arm64" || !versionPattern(version) || seen.has(version)) continue;
    const directItem = item.replace(
      /<sparkle:deltas\b[^>]*>[\s\S]*?<\/sparkle:deltas>/gi,
      "",
    );
    const enclosure = [...directItem.matchAll(/<enclosure\b[^>]*>/gi)]
      .map((match) => match[0])
      .find((tag) => attribute(tag, "sparkle:deltaFrom") === "");
    if (!enclosure) continue;
    const expected = archiveUrl(version);
    const lengthText = attribute(enclosure, "length");
    const downloadLength = /^\d+$/.test(lengthText) ? Number(lengthText) : 0;
    const downloadEdSignature = attribute(enclosure, "sparkle:edSignature");
    const malformed = title !== version ||
      !/^\d+$/.test(appBuild) ||
      attribute(enclosure, "url") !== expected ||
      !validDownloadLength(downloadLength) ||
      !validEdSignature(downloadEdSignature);
    if (malformed) {
      if (results.length === 0) {
        throw new Error(`Newest full arm64 Sparkle item is malformed: ${version}`);
      }
      continue;
    }
    seen.add(version);
    results.push({
      version,
      appBuild,
      downloadUrl: expected,
      downloadLength,
      downloadEdSignature,
    });
  }
  return Object.freeze(results.map((value) => Object.freeze(value)));
}

async function githubRawJson<T>(env: Env, file: string): Promise<T> {
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${file}` +
      `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
    { headers: { Accept: "application/vnd.github.raw+json" } },
  );
  if (!response.ok) {
    throw new Error(`GitHub file read failed: ${response.status} ${await response.text()}`);
  }
  return response.json<T>();
}

async function findIssueByIdentity(
  env: Env,
  title: string,
  body: string,
): Promise<GitHubIssue | null> {
  const query = encodeURIComponent(
    `repo:${env.GITHUB_OWNER}/${env.GITHUB_REPO} is:issue ` +
      `author:${env.GITHUB_ISSUE_AUTHOR} in:title "${title}"`,
  );
  const result = await githubJson<{ items: GitHubIssue[] }>(
    env,
    `/search/issues?q=${query}&per_page=100`,
  );
  const trustedMatches = result.items.filter(
    (issue) => trustedIssue(env, issue) && issueMatches(issue, title, body),
  );
  if (trustedMatches.length > 1) {
    throw new Error(`Multiple trusted issues have the exact identity: ${title}`);
  }
  return trustedMatches[0] ?? null;
}

function trustedIssue(env: Env, issue: GitHubIssue): boolean {
  return issue.user?.login === env.GITHUB_ISSUE_AUTHOR &&
    (issue.user.type === "User" || issue.user.type === "Bot");
}

function validIssueAuthor(value: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value);
}

function issueMatches(issue: GitHubIssue, title: string, body: string): boolean {
  return issue.title === title && issue.body === body;
}

async function findIssueByNumber(env: Env, issueNumber: number): Promise<GitHubIssue | null> {
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}`,
  );
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    throw new Error(`Issue lookup failed: ${response.status} ${await response.text()}`);
  }
  return response.json<GitHubIssue>();
}

async function ensureStatusLabels(env: Env): Promise<void> {
  const repository = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const labels = [
    {
      name: bindingLabel,
      color: "1D76DB",
      description: "ChatGPT exact-build binding automation",
    },
    {
      name: pendingLabel,
      color: "D4C5F9",
      description: "Waiting for binding generation",
    },
  ];
  for (const label of labels) {
    const response = await githubFetch(
      env,
      `${repository}/labels/${encodeURIComponent(label.name)}`,
    );
    if (response.ok) continue;
    if (response.status !== 404) {
      throw new Error(
        `Label lookup failed for ${label.name}: ${response.status} ${await response.text()}`,
      );
    }
    await githubJson(env, `${repository}/labels`, {
      method: "POST",
      body: JSON.stringify(label),
    });
  }
}

async function createIssue(env: Env, title: string, body: string): Promise<GitHubIssue> {
  return githubJson(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: [bindingLabel, pendingLabel] }),
  });
}

async function updateIssue(
  env: Env,
  issueNumber: number,
  update: { state: "open"; labels: string[] },
): Promise<void> {
  await githubJson(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

async function acquireClaim(env: Env, version: string, now: number): Promise<boolean> {
  const result = await env.VERSION_CLAIMS.prepare(
    `INSERT INTO version_claims(version, state, issue_number, lease_expires_at, updated_at)
     VALUES (?, 'creating', NULL, ?, ?)
     ON CONFLICT(version) DO UPDATE SET
       state = 'creating', issue_number = NULL, lease_expires_at = excluded.lease_expires_at,
       updated_at = excluded.updated_at
     WHERE version_claims.state = 'creating'
       AND version_claims.lease_expires_at <= excluded.updated_at`,
  ).bind(version, now + claimLeaseSeconds, now).run();
  return (result.meta.changes ?? 0) === 1;
}

async function readClaim(env: Env, version: string): Promise<ClaimRow | null> {
  return env.VERSION_CLAIMS.prepare(
    "SELECT state, issue_number, lease_expires_at FROM version_claims WHERE version = ?",
  ).bind(version).first<ClaimRow>();
}

async function recordIssueClaim(env: Env, version: string, issueNumber: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.VERSION_CLAIMS.prepare(
    `INSERT INTO version_claims(version, state, issue_number, lease_expires_at, updated_at)
     VALUES (?, 'issue', ?, 0, ?)
     ON CONFLICT(version) DO UPDATE SET state = 'issue', issue_number = excluded.issue_number,
       lease_expires_at = 0, updated_at = excluded.updated_at`,
  ).bind(version, issueNumber, now).run();
}

async function releaseClaim(env: Env, version: string): Promise<void> {
  await env.VERSION_CLAIMS.prepare(
    "DELETE FROM version_claims WHERE version = ? AND state = 'creating'",
  ).bind(version).run();
}

async function deleteIssueClaim(env: Env, version: string): Promise<void> {
  await env.VERSION_CLAIMS.prepare(
    "DELETE FROM version_claims WHERE version = ? AND state = 'issue'",
  ).bind(version).run();
}

async function githubJson<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const response = await githubFetch(env, path, init);
  const method = (init.method ?? "GET").toUpperCase();
  if (!response.ok) {
    const message = `GitHub request failed: ${response.status} ${await response.text()}`;
    if (!retryableMethods.has(method) && isAmbiguousStatus(response.status)) {
      throw new AmbiguousMutationError(message);
    }
    throw new Error(message);
  }
  try {
    return await response.json<T>();
  } catch (error) {
    if (!readOnlyMethods.has(method)) {
      throw new AmbiguousMutationError(
        `The successful ${method} response body is invalid`,
        { cause: error },
      );
    }
    throw error;
  }
}

function githubFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetchWithRetry(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": userAgent,
      "X-GitHub-Api-Version": "2026-03-10",
      ...init.headers,
    },
  });
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown;
  const method = (init.method ?? "GET").toUpperCase();
  const retryable = retryableMethods.has(method);
  const attempts = retryable ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (!isRetryableResponse(response) || attempt === attempts) return response;
      await response.body?.cancel();
      lastError = new Error(`retryable HTTP ${response.status}`);
      await retryDelay(response, attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        if (!retryable) {
          throw new AmbiguousMutationError(
            `The ${method} request result is unknown`,
            { cause: error },
          );
        }
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
    if (!(lastError instanceof Error && lastError.message.startsWith("retryable HTTP"))) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

function isRetryableResponse(response: Response): boolean {
  return retryableStatuses.has(response.status) ||
    (response.status === 403 && response.headers.has("Retry-After"));
}

function isAmbiguousStatus(status: number): boolean {
  return retryableStatuses.has(status) || status >= 500;
}

async function retryDelay(response: Response, attempt: number): Promise<void> {
  const header = response.headers.get("Retry-After");
  const seconds = header && /^\d+$/.test(header) ? Number(header) : undefined;
  const milliseconds = seconds === undefined
    ? attempt * 1_000
    : Math.min(seconds * 1_000, 30_000);
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isAmbiguousMutationError(error: unknown): boolean {
  return error instanceof AmbiguousMutationError ||
    (isRecord(error) && error.ambiguousMutation === true);
}

function issueBody(
  latest: SparkleVersion,
  mode: "current" | "correction",
): string {
  return JSON.stringify({
    schema: 2,
    mode,
    version: latest.version,
    appBuild: latest.appBuild,
    downloadUrl: latest.downloadUrl,
    downloadLength: latest.downloadLength,
    downloadEdSignature: latest.downloadEdSignature,
  }, null, 2);
}

function bindingMatchesFeed(
  binding: BindingIndexEntry,
  feed: SparkleVersion,
): boolean {
  return binding.version === feed.version &&
    binding.appBuild === feed.appBuild &&
    binding.downloadUrl === feed.downloadUrl &&
    binding.downloadLength === feed.downloadLength &&
    binding.downloadEdSignature === feed.downloadEdSignature;
}

function claimIdentity(version: SparkleVersion): string {
  return [
    version.version,
    version.appBuild,
    String(version.downloadLength),
    version.downloadEdSignature,
  ].join("@");
}

function archiveUrl(version: string): string {
  return `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-${version}.zip`;
}

function versionPattern(value: string): boolean {
  return /^\d+(?:\.\d+)+$/.test(value);
}

function validDownloadLength(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validEdSignature(value: string): boolean {
  if (!/^[A-Za-z0-9+/]{86}==$/.test(value)) return false;
  try {
    return atob(value).length === 64;
  } catch {
    return false;
  }
}

function elementText(xml: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  const value = match?.[1];
  return value === undefined ? "" : xmlDecode(value.trim());
}

function attribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`(?:^|\\s)${escaped}=(["'])(.*?)\\1`, "i"));
  const value = match?.[2];
  return value === undefined ? "" : xmlDecode(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function xmlDecode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
