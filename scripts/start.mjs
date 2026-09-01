#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertNoChatGptXProcess,
  createLaunchConfiguration,
  defaultProductExtensionDirectories,
  extensionIdentities,
  extensionSelections,
  inspectChatGptApp,
  ownedRuntimeProcesses,
  processRows,
  readBoundedJsonFile,
  readRuntimeRecords,
  readSession,
  rendererDocumentActivationReady,
  runtimeFailures,
  sanitizedLaunchEnvironment,
  sanitizedStockLaunchEnvironment,
  selectBinding,
  sessionMarkerFile,
  sleep,
  spawnChatGpt,
  stopOwnedProcesses,
  waitForActivation,
  waitForJson,
  writeJsonAtomic,
  writeSession,
} from "./runtime-launch.mjs";
import {
  assertRichContentDiagnostics,
  assertRichContentUnmountDiagnostics,
  assertRichProbeLifecycle,
  richProbeDisposalEvents,
  richProbeInteractionEvents,
  summarizeRichProbeReadiness,
} from "./rich-message-gate.mjs";

const defaultApp = "/Applications/ChatGPT.app";
const repositoryRoot = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);
const requiredGateExtensionIds = Object.freeze([
  "extensions",
  "native-main-probe",
  "reactions",
  "thread-colors",
  "ui-surface-probe",
  "rich-message-probe",
]);
const requiredThreadFixtureColumns = Object.freeze([
  "id",
  "rollout_path",
  "created_at",
  "updated_at",
  "source",
  "model_provider",
  "cwd",
  "title",
  "sandbox_policy",
  "approval_mode",
  "tokens_used",
  "has_user_event",
  "archived",
  "cli_version",
  "first_user_message",
  "memory_mode",
  "model",
  "reasoning_effort",
  "thread_source",
  "preview",
  "recency_at",
  "history_mode",
]);
const nativeProbeNodeSha256 =
  "a28a20cd7a09cc9be1dcec47b3a301baabe4b1ea0583ece756542eb937a2b762";
const nativeProbeFoundation =
  "/System/Library/Frameworks/Foundation.framework/Foundation";
const nativeProbeObjcInput = "ChatGPTX native main probe";
const safeErrorNames = new Set([
  "AbortError",
  "AggregateError",
  "Error",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
  "URIError",
]);
const safeGateFailureCodes = new Set([
  "deterministic-thread-fixture",
  "exact-binding",
  "extension-activation",
  "native-main-live-probe",
  "no-runtime-failures",
  "product-extension-live-interactions",
  "product-extension-real-ui-interactions",
  "remove-gate-session",
  "rich-message-diagnostics",
  "rich-message-events",
  "rich-message-live-interactions",
  "rich-message-unmount-diagnostics",
  "rich-message-unmount-events",
  "run-gate",
  "stock-profile-warmup",
  "stop-owned-processes",
  "ui-surface-live-interactions",
  "ui-surface-diagnostics",
  "ui-surface-events",
  "ui-surface-suggestion",
  "ui-surface-announcement",
  "ui-surface-sidebar",
  "ui-surface-product-menu",
  "ui-surface-home-composer",
  "ui-surface-thread-row",
  "ui-surface-thread-composer",
]);
const safeGateRuntimeEventNames = Object.freeze([
  "electron-intercepted",
  "exact-build-verified",
  "main-extension-host-failed",
  "main-extensions-activated",
  "product-extension-probe-failed",
  "product-extension-probe-passed",
  "product-extension-probe-skipped",
  "product-extension-real-ui-probe-failed",
  "product-extension-real-ui-probe-passed",
  "product-extension-real-ui-probe-skipped",
  "renderer-bootstrap-error",
  "renderer-channel-connect-failed",
  "renderer-channel-disconnect-failed",
  "renderer-channel-inject-failed",
  "renderer-entry-registered",
  "renderer-entry-registration-failed",
  "renderer-host-injection-failed",
  "renderer-injected",
  "rich-content-probe-failed",
  "rich-content-probe-mounted",
  "rich-content-probe-skipped",
  "rich-content-probe-unmount-failed",
  "rich-content-probe-unmounted",
  "runtime-loaded",
  "ui-surface-probe-failed",
  "ui-surface-probe-passed",
  "ui-surface-probe-skipped",
]);
const safeRichProbeEventNames = new Set([
  ...richProbeInteractionEvents,
  ...richProbeDisposalEvents,
]);

function safeErrorName(error) {
  const name = typeof error?.name === "string" ? error.name : "Error";
  return safeErrorNames.has(name) ? name : "Error";
}

export function safeGateFailure(code, error) {
  if (!safeGateFailureCodes.has(code)) {
    throw new TypeError("Gate failure code is not allowlisted");
  }
  return Object.freeze({ code, errorName: safeErrorName(error) });
}

export function summarizeGateRuntimeEvents(records) {
  const counts = Object.create(null);
  for (const record of Array.isArray(records) ? records : []) {
    if (!safeGateRuntimeEventNames.includes(record?.event)) continue;
    counts[record.event] = (counts[record.event] ?? 0) + 1;
  }
  return Object.freeze(
    Object.fromEntries(
      safeGateRuntimeEventNames.flatMap((name) =>
        counts[name] ? [[name, counts[name]]] : [],
      ),
    ),
  );
}

export function summarizeRichProbeEventSequence(events) {
  return Object.freeze(
    (Array.isArray(events) ? events : [])
      .flatMap((event) =>
        safeRichProbeEventNames.has(event?.name) ? [event.name] : [],
      )
      .slice(0, 256),
  );
}

export function summarizeGateRichProbeReadiness(
  records,
  diagnosticCandidates = [],
  rendererDocumentId,
) {
  const runtimeRecord = (Array.isArray(records) ? records : []).findLast(
    (record) =>
      [
        "rich-content-probe-failed",
        "rich-content-probe-mounted",
        "rich-content-probe-unmount-failed",
        "rich-content-probe-unmounted",
      ].includes(record?.event) &&
      (rendererDocumentId === undefined ||
        record?.diagnostics?.rendererDocumentId === rendererDocumentId),
  );
  for (const diagnostics of [
    runtimeRecord?.diagnostics,
    ...(Array.isArray(diagnosticCandidates) ? diagnosticCandidates : []),
  ]) {
    if (
      rendererDocumentId !== undefined &&
      diagnostics?.rendererDocumentId !== rendererDocumentId
    ) {
      continue;
    }
    const readiness = summarizeRichProbeReadiness(diagnostics);
    if (readiness) return readiness;
  }
  return undefined;
}

export function assertProbeDocumentIdentity(
  diagnostics,
  rendererDocumentId,
  description,
) {
  if (
    typeof rendererDocumentId !== "string" ||
    rendererDocumentId.length === 0 ||
    diagnostics?.rendererDocumentId !== rendererDocumentId
  ) {
    throw new Error(`${description} came from a different renderer document`);
  }
  return diagnostics;
}

export async function waitForCurrentRendererDiagnostics(
  file,
  description,
  logDirectory,
  identities,
  timeoutMilliseconds = 15_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const diagnostics = await waitForJson(
      file,
      description,
      Math.max(1, deadline - Date.now()),
    );
    const documentId = diagnostics?.rendererDocumentId;
    if (
      typeof documentId === "string" &&
      documentId.length > 0 &&
      rendererDocumentActivationReady(
        readRuntimeRecords(logDirectory),
        identities,
        documentId,
      )
    ) {
      return diagnostics;
    }
    await sleep(50);
  }
  throw new Error(`${description} did not belong to an active renderer document`);
}

export function summarizeNativeMainEvidence(value) {
  return Object.freeze({
    verified: true,
    rendererConnections: value.channel.connectedRenderers.length,
    rendererInvocations: value.channel.rendererToMainInvokes.length,
    targetedEvent: true,
    broadcastEvent: true,
    cancellationObserved: true,
    resourcesReleased: true,
  });
}

export function summarizeUiSurfaceEvidence(diagnostics, events) {
  return Object.freeze({
    verified: true,
    interactions: diagnostics.results.length,
    lifecycleEvents: events.events.length,
    homeState: true,
    threadState: true,
  });
}

export function summarizeProductExtensionEvidence() {
  return Object.freeze({
    verified: true,
    threadColorApplied: true,
    reactionApplied: true,
  });
}

export function summarizeProductExtensionRealUiEvidence() {
  return Object.freeze({
    verified: true,
    realDom: true,
    headerColorApplied: true,
    activityLayoutVerified: true,
    standardLayoutVerified: true,
    cloudLayoutVerified: true,
    reactionApplied: true,
    settingsVerified: true,
  });
}

function usage(error) {
  if (error) console.error(error);
  console.error(
    [
      "usage:",
      "  node scripts/start.mjs start [--app <ChatGPT.app>] [--binding <dir>] [--extension <dist>]... [--codex-home <dir>] [--user-data-dir <dir>]",
      "  node scripts/start.mjs status <session>",
      "  node scripts/start.mjs stop <session>",
      "  node scripts/start.mjs run-gate --app <ChatGPT.app> --binding <dir> --codex-home <dir> --extension <dist>... --result <file> [--user-data-dir <dir>]",
    ].join("\n"),
  );
  process.exitCode = 64;
}

export function parseLaunchArguments(arguments_, options = {}) {
  const values = {
    app: options.defaultApp ?? defaultApp,
    binding: undefined,
    codexHome: undefined,
    extensions: [],
    result: undefined,
    userDataDir: undefined,
    timeoutMilliseconds: 120_000,
  };
  const once = new Set();
  const named = new Map([
    ["--app", "app"],
    ["--binding", "binding"],
    ["--codex-home", "codexHome"],
    ["--result", "result"],
    ["--user-data-dir", "userDataDir"],
    ["--timeout-ms", "timeoutMilliseconds"],
  ]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--extension") {
      const value = arguments_[++index];
      if (!value || value.startsWith("--")) throw new TypeError("--extension requires a value");
      values.extensions.push(path.resolve(options.cwd ?? process.cwd(), value));
      continue;
    }
    const key = named.get(argument);
    if (!key || once.has(argument)) throw new TypeError(`Invalid or duplicate option: ${argument}`);
    once.add(argument);
    const value = arguments_[++index];
    if (!value || value.startsWith("--")) throw new TypeError(`${argument} requires a value`);
    if (key === "timeoutMilliseconds") {
      values[key] = Number(value);
      if (!Number.isInteger(values[key]) || values[key] < 1_000) {
        throw new TypeError("--timeout-ms must be an integer of at least 1000");
      }
    } else {
      values[key] = path.resolve(options.cwd ?? process.cwd(), value);
    }
  }
  return Object.freeze({
    ...values,
    extensions: Object.freeze(values.extensions),
  });
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  return fs.realpathSync(directory);
}

function resolveCodexHome(requested, requireAuthentication) {
  const directory = fs.realpathSync(
    requested ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
  );
  if (!fs.statSync(directory).isDirectory()) throw new Error("CODEX_HOME is not a directory");
  if (requireAuthentication) {
    const authFile = fs.realpathSync(path.join(directory, "auth.json"));
    const status = fs.statSync(authFile);
    if (!status.isFile() || (status.mode & 0o077) !== 0) {
      throw new Error("CODEX_HOME auth.json must be a private regular file");
    }
  }
  return directory;
}

const maximumAuthenticationBytes = 1024 * 1024;

function privateCodexHome(directory, label) {
  const requested = path.resolve(directory);
  const requestedStatus = fs.lstatSync(requested);
  if (
    requestedStatus.isSymbolicLink() ||
    !requestedStatus.isDirectory() ||
    (requestedStatus.mode & 0o077) !== 0
  ) {
    throw new Error(`${label} must be a private directory, not a symbolic link`);
  }
  return fs.realpathSync(requested);
}

function privateAuthenticationFile(directory, label) {
  const codexHome = privateCodexHome(directory, label);
  const authFile = path.join(codexHome, "auth.json");
  const status = fs.lstatSync(authFile);
  if (
    status.isSymbolicLink() ||
    !status.isFile() ||
    (status.mode & 0o077) !== 0 ||
    status.size < 1 ||
    status.size > maximumAuthenticationBytes
  ) {
    throw new Error(
      `${label} auth.json must be a private regular file of at most 1 MiB`,
    );
  }
  return Object.freeze({ codexHome, authFile, status });
}

export function resolveIsolatedGateCodexHome(requested) {
  const authentication = privateAuthenticationFile(
    requested,
    "Isolated gate CODEX_HOME",
  );
  let document;
  try {
    document = JSON.parse(fs.readFileSync(authentication.authFile, "utf8"));
  } catch {
    throw new Error("Isolated gate auth.json must contain valid JSON");
  }
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Isolated gate auth.json must contain a JSON object");
  }
  const marker = path.join(
    authentication.codexHome,
    ".chatgpt-extensions-isolated-live-gate",
  );
  const markerStatus = fs.lstatSync(marker);
  const homeStatus = fs.statSync(authentication.codexHome);
  if (
    markerStatus.isSymbolicLink() ||
    !markerStatus.isFile() ||
    markerStatus.size !== 0 ||
    (markerStatus.mode & 0o077) !== 0 ||
    markerStatus.uid !== homeStatus.uid ||
    authentication.status.uid !== homeStatus.uid
  ) {
    throw new Error("Live gate CODEX_HOME is not an isolated owned directory");
  }
  return authentication.codexHome;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function gateRolloutRecords(id, title, timestamp, completedAt) {
  return [
    {
      timestamp,
      type: "session_meta",
      payload: {
        id,
        session_id: id,
        timestamp,
        cwd: repositoryRoot,
        originator: "chatgpt-extensions-gate",
        cli_version: "chatgpt-extensions-gate",
        source: "cli",
        model_provider: "openai",
        base_instructions: { text: "" },
        git: null,
        history_mode: "legacy",
        memory_mode: "disabled",
        thread_source: "user",
        context_window: { window_id: id },
      },
    },
    {
      timestamp,
      type: "event_msg",
      payload: { type: "task_started", turn_id: id },
    },
    {
      timestamp,
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: title }],
      },
    },
    {
      timestamp,
      type: "event_msg",
      payload: {
        type: "user_message",
        message: title,
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
    {
      timestamp,
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: `${title} assistant response`,
        phase: "final_answer",
      },
    },
    {
      timestamp,
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: `${title} assistant response` },
        ],
        phase: "final_answer",
      },
    },
    {
      timestamp,
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: id,
        last_agent_message: `${title} assistant response`,
        completed_at: completedAt,
        duration_ms: 1,
        time_to_first_token_ms: 1,
      },
    },
  ];
}

export function seedGateThreads(codexHome) {
  const stateFile = fs.realpathSync(path.join(codexHome, "state_5.sqlite"));
  const sessionDirectory = ensurePrivateDirectory(
    path.join(codexHome, "sessions", "chatgpt-extensions-gate"),
  );
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const fixtures = [0, 1].map((index) => {
    const id = crypto.randomUUID();
    const title = `ChatGPT Extensions gate fixture ${index + 1}`;
    const createdAt = nowSeconds - index;
    const timestamp = new Date(createdAt * 1_000).toISOString();
    const rolloutPath = path.join(sessionDirectory, `rollout-${id}.jsonl`);
    const records = gateRolloutRecords(id, title, timestamp, createdAt);
    fs.writeFileSync(
      rolloutPath,
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    return Object.freeze({ id, title, createdAt, rolloutPath });
  });
  const statements = fixtures.map((fixture) => `
    INSERT INTO threads (
      id, rollout_path, created_at, updated_at, source, model_provider, cwd,
      title, sandbox_policy, approval_mode, tokens_used, has_user_event,
      archived, cli_version, first_user_message, memory_mode, model,
      reasoning_effort, thread_source, preview, recency_at, history_mode
    ) VALUES (
      ${sqlString(fixture.id)}, ${sqlString(fixture.rolloutPath)},
      ${fixture.createdAt}, ${fixture.createdAt}, 'cli', 'openai',
      ${sqlString(repositoryRoot)}, ${sqlString(fixture.title)},
      '{"type":"disabled"}', 'never', 0, 1, 0,
      'chatgpt-extensions-gate', ${sqlString(fixture.title)}, 'disabled',
      'gpt-5.6-sol', 'low', 'user', ${sqlString(fixture.title)},
      ${fixture.createdAt}, 'legacy'
    );
  `).join("\n");
  execFileSync("/usr/bin/sqlite3", [stateFile, `BEGIN;${statements}COMMIT;`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return Object.freeze(fixtures);
}

export function threadFixtureSchemaReady(stateFile, executeSqlite = execFileSync) {
  if (typeof stateFile !== "string" || stateFile.length === 0) return false;
  try {
    const status = fs.lstatSync(stateFile);
    if (!status.isFile() || status.isSymbolicLink()) return false;
    const rows = executeSqlite(
      "/usr/bin/sqlite3",
      [
        "-init",
        "/dev/null",
        "-batch",
        "-noheader",
        "-list",
        "-readonly",
        stateFile,
        "PRAGMA busy_timeout=1000; SELECT name FROM pragma_table_info('threads') ORDER BY cid;",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2_000,
      },
    );
    const columns = new Set(
      rows
        .trim()
        .split("\n")
        .filter(Boolean),
    );
    return requiredThreadFixtureColumns.every((column) => columns.has(column));
  } catch {
    return false;
  }
}

export async function waitForThreadFixtureSchema(
  stateFile,
  childPid,
  timeoutMilliseconds,
  dependencies = {},
) {
  const now = dependencies.now ?? Date.now;
  const schemaReady = dependencies.schemaReady ?? threadFixtureSchemaReady;
  const assertProcessAlive = dependencies.assertProcessAlive ?? ((pid) => {
    process.kill(pid, 0);
  });
  const wait = dependencies.wait ?? sleep;
  const deadline = now() + Math.min(timeoutMilliseconds, 60_000);
  while (now() < deadline) {
    if (schemaReady(stateFile)) return stateFile;
    try {
      assertProcessAlive(childPid);
    } catch (error) {
      if (error?.code === "ESRCH") {
        throw new Error("Stock ChatGPT exited before it initialized the threads schema");
      }
      throw error;
    }
    await wait(100);
  }
  throw new Error("Stock ChatGPT did not initialize the required threads schema");
}

async function warmGateCodexHome(
  identity,
  layout,
  metadata,
  codexHome,
  timeoutMilliseconds,
) {
  const environment = sanitizedStockLaunchEnvironment(process.env, codexHome);
  const child = spawnChatGpt(identity, {
    session: metadata.session,
    userDataDir: layout.userDataDir,
    environment,
  });
  const stateFile = path.join(codexHome, "state_5.sqlite");
  let failure;
  try {
    await waitForThreadFixtureSchema(
      stateFile,
      child.pid,
      timeoutMilliseconds,
    );
  } catch (error) {
    failure = error;
  }
  try {
    await stopOwnedProcesses(metadata);
  } catch (error) {
    failure = failure
      ? new AggregateError([failure, error], "Stock ChatGPT warm-up failed")
      : error;
  }
  if (failure) throw failure;
  if (!threadFixtureSchemaReady(stateFile)) {
    throw new Error("Stock ChatGPT threads schema was not ready after shutdown");
  }
  return stateFile;
}

function createSessionLayout(session, requestedUserDataDirectory) {
  const directory = ensurePrivateDirectory(session);
  const userDataDir = ensurePrivateDirectory(
    requestedUserDataDirectory ?? path.join(directory, "electron-profile"),
  );
  const storageDirectory = ensurePrivateDirectory(path.join(directory, "extension-state"));
  const logDirectory = ensurePrivateDirectory(path.join(directory, "log"));
  return Object.freeze({ directory, userDataDir, storageDirectory, logDirectory });
}

function launchMetadata(layout, identity, binding, codexHome, configurationFile, kind, pid) {
  return Object.freeze({
    kind,
    appPath: identity.appPath,
    appContents: identity.contents,
    executable: identity.executable,
    bundleIdentifier: identity.bundleIdentifier,
    signingIdentifier: identity.signingIdentifier,
    teamIdentifier: identity.teamIdentifier,
    appVersion: identity.appVersion,
    appBuild: identity.appBuild,
    appAsarSha256: identity.appAsarSha256,
    bindingVersion: binding.appVersion,
    bindingManifestFile: binding.manifestFile,
    bindingManifestSha256: binding.manifestDigest,
    bindingDownloadLength: binding.downloadLength,
    bindingDownloadEdSignature: binding.downloadEdSignature,
    codexHome,
    userDataDir: layout.userDataDir,
    storageDirectory: layout.storageDirectory,
    logDirectory: layout.logDirectory,
    configurationFile,
    pid,
    startedAt: new Date().toISOString(),
  });
}

async function start(options) {
  assertNoChatGptXProcess(processRows());
  const session = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "chatgpt-extensions",
    "v5",
  );
  const layout = createSessionLayout(session, options.userDataDir);
  const marker = path.join(layout.directory, sessionMarkerFile);
  if (fs.existsSync(marker)) {
    const previous = readSession(layout.directory);
    if (ownedRuntimeProcesses(previous).length > 0) {
      throw new Error(`A v5 ChatGPT session is already running: ${layout.directory}`);
    }
  }
  fs.rmSync(layout.logDirectory, { recursive: true, force: true });
  ensurePrivateDirectory(layout.logDirectory);
  const identity = inspectChatGptApp(options.app);
  const binding = selectBinding(identity, options.binding);
  const codexHome = resolveCodexHome(options.codexHome, false);
  const selections = extensionSelections([
    ...defaultProductExtensionDirectories,
    ...options.extensions,
  ]);
  const identities = extensionIdentities(selections);
  const configurationFile = path.join(layout.directory, "launch.json");
  writeJsonAtomic(
    configurationFile,
    createLaunchConfiguration(binding, layout.storageDirectory, selections),
  );
  const environment = sanitizedLaunchEnvironment(process.env, {
    codexHome,
    configurationFile,
    logDirectory: layout.logDirectory,
  });
  const pending = launchMetadata(
    layout,
    identity,
    binding,
    codexHome,
    configurationFile,
    "persistent",
    null,
  );
  writeSession(layout.directory, pending);
  const child = spawnChatGpt(identity, {
    session: layout.directory,
    userDataDir: layout.userDataDir,
    environment,
  });
  const metadata = { ...pending, pid: child.pid };
  try {
    writeSession(layout.directory, metadata);
    const activation = await waitForActivation(metadata, identities, options.timeoutMilliseconds);
    console.log(`Session: ${layout.directory}`);
    console.log(`Process ID: ${child.pid}`);
    console.log(`Binding: ${binding.appVersion} (${binding.manifestDigest})`);
    console.log(`Activated entries: ${identities.flatMap((entry) => [
      ...(entry.main ? [`${entry.id}:main`] : []),
      ...entry.phases.map((phase) => `${entry.id}:${phase}`),
    ]).join(", ")}`);
    return activation;
  } catch (error) {
    try {
      await stopOwnedProcesses(metadata);
    } catch (stopError) {
      throw new AggregateError(
        [error, stopError],
        "v5 activation failed and its ChatGPT process could not be stopped",
      );
    }
    throw error;
  }
}

async function waitForRichEventLog(directory, unmounted, selectedFile) {
  const deadline = Date.now() + 30_000;
  let lastFailure;
  while (Date.now() < deadline) {
    let files = selectedFile ? [selectedFile] : [];
    if (!selectedFile && fs.existsSync(directory)) {
      files = fs.readdirSync(directory)
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.join(directory, name));
    }
    for (const file of files) {
      try {
        const events = readBoundedJsonFile(file).events;
        assertRichProbeLifecycle(events, unmounted);
        return { file, events };
      } catch (error) {
        lastFailure =
          typeof error?.message === "string"
            ? error.message
            : safeErrorName(error);
      }
    }
    await sleep(100);
  }
  throw new Error(
    `Timed out waiting for Rich Message Probe events: ${
      lastFailure ?? "no event file was ready"
    }`,
  );
}

const uiComposerActionPlacements = Object.freeze([
  "composer.footer.leading",
  "composer.footer.trailing",
  "composer.action-bar.leading",
  "composer.action-bar.trailing",
  "composer.utility.leading",
  "composer.utility.trailing",
]);
const uiComposerRenderPoints = Object.freeze([
  ...uiComposerActionPlacements,
  "composer.attachments",
]);
const uiComposerThreadActionPlacements = Object.freeze([
  "composer.footer.leading",
  "composer.footer.trailing",
]);
const uiComposerThreadRenderPoints = Object.freeze([
  ...uiComposerThreadActionPlacements,
  "composer.attachments",
]);

export function assertUiSurfaceEvents(value) {
  const requiredOnce = [
    "suggestion.activate",
    "announcement.primary",
    "announcement.dismiss",
    "sidebar.select",
    "product-menu.activate",
  ];
  const names = value?.events?.map((event, index) => {
    if (event?.sequence !== index + 1) throw new Error("UI Surface Probe sequence is invalid");
    return event.name;
  });
  const count = (name) => names?.filter((candidate) => candidate === name).length ?? 0;
  const missing = requiredOnce.filter((name) => count(name) < 1);
  for (const placement of uiComposerActionPlacements) {
    const name = `composer-action.${placement}.activate`;
    const minimum = uiComposerThreadActionPlacements.includes(placement) ? 2 : 1;
    if (count(name) < minimum) missing.push(name);
  }
  for (const point of uiComposerRenderPoints) {
    const stateCount = uiComposerThreadRenderPoints.includes(point) ? 2 : 1;
    const remainsMounted = uiComposerThreadRenderPoints.includes(point) ? 1 : 0;
    for (const [event, minimum] of [
      ["mount", stateCount * 2],
      ["invalidate", stateCount],
      ["activate", stateCount],
      ["dispose", stateCount * 2 - remainsMounted],
    ]) {
      const name = `composer-render.${point}.${event}`;
      if (count(name) < minimum) missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(`UI Surface Probe missed events: ${missing.join(", ")}`);
  }
}

export function uiSurfaceInteractionReady(result) {
  if (result?.kind === "render") {
    return (
      result.ownerFound === true &&
      result.invalidateFound === true &&
      result.invalidateClicked === true &&
      result.oldDisconnected === true &&
      result.replaced === true &&
      result.actionFound === true &&
      result.actionClicked === true
    );
  }
  if (result?.kind === "dismiss") {
    return (
      result.found === true &&
      result.clicked === true &&
      result.removed === true
    );
  }
  return (
    result?.found === true &&
    result.clicked === true &&
    result.changed === true
  );
}

export function assertUiSurfaceDiagnostics(value) {
  const results = value?.results;
  const states = value?.states;
  const missing = [];
  if (
    typeof value?.rendererDocumentId !== "string" ||
    value.rendererDocumentId.length === 0
  ) {
    missing.push("rendererDocumentId");
  }
  if (
    typeof value?.eventFile !== "string" ||
    !/^events-[A-Za-z0-9_-]+\.json$/.test(value.eventFile)
  ) {
    missing.push("eventFile");
  }
  if (!Array.isArray(results) || results.length !== 23) missing.push("results");
  for (const state of ["home", "thread"]) {
    const stateValue = states?.[state];
    if (!Array.isArray(stateValue?.missingActions) || stateValue.missingActions.length > 0) {
      missing.push(`${state}.actions`);
    }
    if (!Array.isArray(stateValue?.missingRenders) || stateValue.missingRenders.length > 0) {
      missing.push(`${state}.renders`);
    }
    if (state === "thread" && stateValue?.threadRowFound !== true) {
      missing.push("thread.row");
    }
  }
  for (const result of Array.isArray(results) ? results : []) {
    if (!uiSurfaceInteractionReady(result)) {
      missing.push(`${result?.state}.${result?.name}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `UI Surface Probe diagnostics are incomplete (${missing.join(", ")})`,
    );
  }
}

export function uiSurfaceDiagnosticFailureCode(value) {
  const results = value?.results;
  const states = value?.states;
  if (!Array.isArray(results) || results.length !== 23) {
    return "ui-surface-diagnostics";
  }
  const incomplete = results.find(
    (result) => !uiSurfaceInteractionReady(result),
  );
  if (incomplete) {
    if (incomplete.name === "suggestion") return "ui-surface-suggestion";
    if (incomplete.name?.startsWith("announcement-")) {
      return "ui-surface-announcement";
    }
    if (incomplete.name === "sidebar") return "ui-surface-sidebar";
    if (incomplete.name === "product-menu") return "ui-surface-product-menu";
    if (incomplete.name?.startsWith("composer-")) {
      return incomplete.state === "thread"
        ? "ui-surface-thread-composer"
        : "ui-surface-home-composer";
    }
    return "ui-surface-diagnostics";
  }
  if (
    states?.home?.missingActions?.length > 0 ||
    states?.home?.missingRenders?.length > 0
  ) {
    return "ui-surface-home-composer";
  }
  if (states?.thread?.threadRowFound !== true) {
    return "ui-surface-thread-row";
  }
  if (
    states?.thread?.missingActions?.length > 0 ||
    states?.thread?.missingRenders?.length > 0
  ) {
    return "ui-surface-thread-composer";
  }
  return "ui-surface-diagnostics";
}

async function waitForUiSurfaceEvents(file, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const value = readBoundedJsonFile(file);
      assertUiSurfaceEvents(value);
      return value;
    } catch {}
    await sleep(50);
  }
  throw new Error("Timed out waiting for UI Surface Probe events");
}

export function assertNativeMainProbeEvidence(value, expectations = {}) {
  const missing = [];
  const extension = value?.extension;
  const main = value?.main;
  const runtime = main?.runtime;
  const document = value?.renderer?.document;
  const channel = value?.channel;
  const owner = channel?.owner;
  const cancellation = channel?.cancellation;
  const nonEmpty = (candidate) =>
    typeof candidate === "string" && candidate.length > 0;
  const digest = (candidate) =>
    typeof candidate === "string" && /^[a-f0-9]{64}$/.test(candidate);
  const eventMatches = (event, type) =>
    event?.type === type &&
    event?.rendererId === document?.id &&
    event?.nonce === document?.id;

  if (value?.schemaVersion !== 1) missing.push("schemaVersion");
  if (value?.status !== "passed") missing.push("status");
  if (
    extension?.id !== "native-main-probe" ||
    !nonEmpty(extension?.instanceId) ||
    extension?.version !== "0.1.0" ||
    !digest(extension?.manifestDigest)
  ) {
    missing.push("extension");
  }
  if (main?.electron?.sameSingleton !== true) {
    missing.push("electron.singleton");
  }
  if (
    main?.objc?.framework !== nativeProbeFoundation ||
    main?.objc?.className !== "NSString" ||
    main?.objc?.input !== nativeProbeObjcInput ||
    main?.objc?.output !== nativeProbeObjcInput ||
    main?.objc?.roundTrip !== true
  ) {
    missing.push("objc.NSString");
  }
  if (
    main?.node?.input !== "native-main-probe" ||
    main?.node?.sha256 !== nativeProbeNodeSha256 ||
    main?.node?.processType !== "browser" ||
    !nonEmpty(main?.node?.version)
  ) {
    missing.push("node.main");
  }
  if (
    runtime?.apiVersion !== "0.2.0" ||
    !nonEmpty(runtime?.appVersion) ||
    !nonEmpty(runtime?.appBuild) ||
    !nonEmpty(runtime?.electronVersion) ||
    !nonEmpty(runtime?.chromiumVersion) ||
    runtime?.nodeVersion !== main?.node?.version ||
    !nonEmpty(runtime?.nodeModuleAbi) ||
    runtime?.objcJsVersion !== "1.5.0" ||
    !["arm64", "x64"].includes(runtime?.architecture) ||
    runtime?.platform !== "macos"
  ) {
    missing.push("runtime.info");
  }
  if (
    (expectations.appVersion !== undefined &&
      runtime?.appVersion !== expectations.appVersion) ||
    (expectations.appBuild !== undefined &&
      runtime?.appBuild !== expectations.appBuild) ||
    runtime?.binding?.targetAppVersion !== runtime?.appVersion ||
    runtime?.binding?.targetAppBuild !== runtime?.appBuild ||
    (expectations.adapterVersion !== undefined &&
      runtime?.binding?.adapterVersion !== expectations.adapterVersion) ||
    !digest(runtime?.binding?.adapterDigest) ||
    !digest(runtime?.binding?.publicApiDigest) ||
    !digest(runtime?.binding?.evidenceDigest)
  ) {
    missing.push("runtime.binding");
  }
  if (
    runtime?.extension?.id !== extension?.id ||
    runtime?.extension?.instanceId !== extension?.instanceId ||
    runtime?.extension?.version !== extension?.version ||
    runtime?.extension?.manifestDigest !== extension?.manifestDigest
  ) {
    missing.push("runtime.extension");
  }
  if (
    !nonEmpty(document?.id) ||
    !nonEmpty(document?.windowId) ||
    !Number.isInteger(document?.webContentsId) ||
    !nonEmpty(document?.url) ||
    !nonEmpty(value?.renderer?.extensionInstanceId)
  ) {
    missing.push("renderer.document");
  }
  if (
    !Array.isArray(runtime?.windows) ||
    !runtime.windows.some((window) => window?.id === document?.windowId)
  ) {
    missing.push("runtime.windows");
  }
  if (
    !Array.isArray(channel?.connectedRenderers) ||
    !channel.connectedRenderers.some(
      (renderer) =>
        renderer?.id === document?.id &&
        renderer?.windowId === document?.windowId &&
        renderer?.webContentsId === document?.webContentsId &&
        renderer?.url === document?.url,
    ) ||
    channel?.listedCallerByIdentity !== true
  ) {
    missing.push("renderers.listRenderers");
  }
  if (
    owner?.windowId !== document?.windowId ||
    owner?.webContentsId !== document?.webContentsId ||
    owner?.ownerWebContentsIsElectronLookup !== true ||
    owner?.ownerWindowIsElectronLookup !== true ||
    owner?.ownerWindowContainsWebContents !== true
  ) {
    missing.push("getOwner.identity");
  }
  if (
    JSON.stringify(channel?.rendererToMainInvokes) !==
      JSON.stringify(["begin", "cancel", "finalize"])
  ) {
    missing.push("renderer.invoke");
  }
  if (!eventMatches(channel?.targetedEvent, "targeted")) {
    missing.push("main.targeted-event");
  }
  if (!eventMatches(channel?.broadcastEvent, "broadcast")) {
    missing.push("main.broadcast-event");
  }
  if (
    cancellation?.invokeRejected !== true ||
    !nonEmpty(cancellation?.rendererErrorName) ||
    cancellation?.observedByMain !== true ||
    !eventMatches(cancellation?.observedEvent, "cancel-observed")
  ) {
    missing.push("invoke.cancellation");
  }
  if (
    !Number.isInteger(main?.resources?.blocker?.id) ||
    main?.resources?.blocker?.type !== "prevent-app-suspension" ||
    main?.resources?.blocker?.started !== true ||
    main?.resources?.blocker?.released !== true ||
    main?.resources?.blocker?.stopped !== true ||
    main?.resources?.deferredCleanup?.runs !== 1
  ) {
    missing.push("native.resource-release");
  }
  if (missing.length > 0) {
    throw new Error(
      `Native Main Probe evidence is incomplete (${missing.join(", ")})`,
    );
  }
  return value;
}

export function assertProductExtensionDiagnostics(value) {
  const threadColors = value?.threadColors;
  const header = threadColors?.header;
  const sidebarRow = threadColors?.sidebarRow;
  const stored = threadColors?.stored;
  const reactions = value?.reactions;
  const valid =
    threadColors?.colorActionFound === true &&
    threadColors?.colorActionClicked === true &&
    header?.properties?.["--header-background-color"] === "#3A83F7" &&
    header?.backgroundAttribute === true &&
    typeof header?.backgroundStyle === "string" &&
    header.backgroundStyle.length > 0 &&
    sidebarRow?.registrationFound === true &&
    sidebarRow?.viewFound === true &&
    sidebarRow?.indicatorFound === true &&
    sidebarRow?.width === "3px" &&
    sidebarRow?.height === "100%" &&
    typeof sidebarRow?.background === "string" &&
    sidebarRow.background.length > 0 &&
    stored?.thread?.scope === "execution" &&
    stored.thread.hostId === "local" &&
    stored.thread.threadId === "chatgptx-product-extension-probe" &&
    stored?.selection?.type === "preset" &&
    stored.selection.id === "blue" &&
    reactions?.actionFound === true &&
    reactions?.actionClicked === true &&
    reactions?.actionId === "reactions.reaction-1" &&
    reactions?.actionOrigin === "reactions" &&
    reactions?.label === "👍" &&
    reactions?.persisted?.annotation === "User reacted with 👍" &&
    reactions.persisted.selectedText ===
      "ChatGPTX product reaction probe selection" &&
    reactions.persisted.submit === false;
  if (!valid) {
    throw new Error("Product extension diagnostics are incomplete");
  }
}

export function assertProductExtensionRealUiDiagnostics(value) {
  const thread = value?.thread;
  const threadColors = value?.threadColors;
  const header = threadColors?.header;
  const stored = threadColors?.stored;
  const cloud = threadColors?.cloud;
  const reactions = value?.reactions;
  const settings = value?.settings;
  const fillsActualRow = (layout) =>
    layout?.indicatorFillsRow === true &&
    Math.abs(
      (layout?.indicator?.top ?? Number.NaN) -
        (layout?.row?.top ?? Number.NaN),
    ) <= 0.5 &&
    Math.abs(
      (layout?.indicator?.bottom ?? Number.NaN) -
        (layout?.row?.bottom ?? Number.NaN),
    ) <= 0.5 &&
    Math.abs(
      (layout?.indicator?.height ?? Number.NaN) -
        (layout?.row?.height ?? Number.NaN),
    ) <= 0.5;
  const layoutMissing = (layout) =>
    layout?.rowFound !== true ||
    layout?.titleTriggerFound !== true ||
    layout?.indicatorFound !== true ||
    layout?.indicatorCount !== 1 ||
    layout?.uncoloredRowFound !== true ||
    !fillsActualRow(layout) ||
    layout?.coloredAndUncoloredTitlesAligned !== true ||
    layout?.indicatorBackground !== "rgb(58, 131, 247)" ||
    Math.abs((layout?.indicator?.width ?? 0) - 3) > 0.5 ||
    Math.abs((layout?.titleGap ?? Number.NaN) - 3) > 0.75;
  const invalid =
    value?.validationPassed !== true ||
    value?.realDom !== true ||
    thread?.scope !== "execution" ||
    typeof thread?.hostId !== "string" ||
    thread.hostId.length === 0 ||
    typeof thread?.threadId !== "string" ||
    thread.threadId.length === 0 ||
    thread.threadId === "chatgptx-product-extension-probe" ||
    typeof thread?.title !== "string" ||
    thread.title.length === 0 ||
    thread?.signedInHeaderTitleFound !== true ||
    threadColors?.nativeMenuTrigger !== true ||
    threadColors?.nativeMenuAction !== true ||
    threadColors?.nativeFlyoutAction !== true ||
    header?.found !== true ||
    header?.titleFound !== true ||
    header?.blueRegionFound !== true ||
    header?.background !== "rgb(58, 131, 247)" ||
    layoutMissing(threadColors?.activity) ||
    layoutMissing(threadColors?.standard) ||
    threadColors?.activityRowIsTaller !== true ||
    cloud?.scope !== "cloud" ||
    cloud?.menuActionFound !== true ||
    cloud?.menuActionClicked !== true ||
    cloud?.ownerMatched !== true ||
    layoutMissing(cloud?.layout) ||
    cloud?.stored?.scope !== "cloud" ||
    cloud?.stored?.selection?.type !== "preset" ||
    cloud.stored.selection.id !== "blue" ||
    stored?.thread?.scope !== thread.scope ||
    stored.thread.hostId !== thread.hostId ||
    stored.thread.threadId !== thread.threadId ||
    stored?.selection?.type !== "preset" ||
    stored.selection.id !== "blue" ||
    reactions?.targetFound !== true ||
    typeof reactions?.selectedText !== "string" ||
    reactions.selectedText.length === 0 ||
    reactions?.actionFound !== true ||
    reactions?.actionVisible !== true ||
    reactions?.nativeToolbarFound !== true ||
    reactions?.sharesNativeActionComponent !== true ||
    reactions?.creationCountAfter !== reactions?.creationCountBefore + 1 ||
    reactions?.composerAnnotationFound !== true ||
    reactions?.persisted?.annotation !== "User reacted with 👍" ||
    reactions.persisted.selectedText !== reactions.selectedText ||
    reactions.persisted.submit !== false ||
    settings?.opened !== true ||
    settings?.searchFieldFound !== true ||
    settings?.queryAccepted !== true ||
    settings?.queryClearedAfterSelection !== true ||
    settings?.searchResultFound !== true ||
    settings?.searchResultClicked !== true ||
    settings?.selectedPane !== "extensions.installed" ||
    settings?.threadColorsVisible !== true ||
    settings?.refreshControlAbsent !== true ||
    settings?.globalErrorAbsent !== true;
  if (invalid) {
    throw new Error("Real product extension UI diagnostics are incomplete");
  }
}

async function runGate(options) {
  if (!options.result) throw new TypeError("run-gate requires --result");
  fs.mkdirSync(path.dirname(options.result), { recursive: true });
  const gates = [];
  let session;
  let metadata;
  let warmMetadata;
  let layout;
  let runtimeEventCounts;
  let richEventFile;
  let richEventSequence;
  let richProbeReadiness;
  let richDiagnostics;
  let unmountDiagnostics;
  let failure;
  let failureCode;
  let activeGate = "run-gate";
  try {
    if (!options.binding) throw new TypeError("run-gate requires --binding");
    if (!options.codexHome) throw new TypeError("run-gate requires --codex-home");
    assertNoChatGptXProcess(processRows());
    session = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "chatgpt-extensions-gate."));
    fs.chmodSync(session, 0o700);
    layout = createSessionLayout(session, options.userDataDir);
    activeGate = "exact-binding";
    const identity = inspectChatGptApp(options.app);
    const binding = selectBinding(identity, options.binding);
    const codexHome = resolveIsolatedGateCodexHome(options.codexHome);
    const selections = extensionSelections(options.extensions);
    const identities = extensionIdentities(selections);
    const ids = new Set(identities.map((entry) => entry.id));
    const missingIds = requiredGateExtensionIds.filter((id) => !ids.has(id));
    if (missingIds.length > 0) {
      throw new Error(`run-gate requires extension packages: ${missingIds.join(", ")}`);
    }
    gates.push({
      name: "exact-binding",
      status: "passed",
      evidence: {
        appVersion: identity.appVersion,
        appBuild: identity.appBuild,
        appAsarSha256: identity.appAsarSha256,
        bundleIdentifier: identity.bundleIdentifier,
        signingIdentifier: identity.signingIdentifier,
        teamIdentifier: identity.teamIdentifier,
        bindingManifestSha256: binding.manifestDigest,
        downloadLength: binding.downloadLength,
        downloadEdSignature: binding.downloadEdSignature,
      },
    });
    warmMetadata = Object.freeze({
      session,
      appContents: identity.contents,
      userDataDir: layout.userDataDir,
    });
    activeGate = "stock-profile-warmup";
    await warmGateCodexHome(
      identity,
      layout,
      warmMetadata,
      codexHome,
      options.timeoutMilliseconds,
    );
    warmMetadata = undefined;
    gates.push({
      name: "stock-profile-warmup",
      status: "passed",
      evidence: { initializedState: true, stopped: true },
    });
    activeGate = "deterministic-thread-fixture";
    const fixtureThreads = seedGateThreads(codexHome);
    gates.push({
      name: "deterministic-thread-fixture",
      status: "passed",
      evidence: {
        count: fixtureThreads.length,
      },
    });
    activeGate = "extension-activation";
    fs.writeFileSync(path.join(session, ".chatgptx-extension-test"), "chatgptx-extension-test-v1\n", { mode: 0o600 });
    fs.writeFileSync(path.join(session, "rich-content-probe"), "enabled\n", { mode: 0o600 });
    fs.writeFileSync(path.join(session, "ui-surface-probe"), "enabled\n", { mode: 0o600 });
    fs.writeFileSync(path.join(session, "product-extension-probe"), "enabled\n", { mode: 0o600 });
    fs.writeFileSync(path.join(session, "product-extension-real-ui-probe"), "enabled\n", { mode: 0o600 });
    const configurationFile = path.join(session, "launch.json");
    writeJsonAtomic(
      configurationFile,
      createLaunchConfiguration(binding, layout.storageDirectory, selections),
    );
    const environment = sanitizedLaunchEnvironment(process.env, {
      codexHome,
      configurationFile,
      logDirectory: layout.logDirectory,
      testRoot: session,
    });
    const pending = launchMetadata(
      layout,
      identity,
      binding,
      codexHome,
      configurationFile,
      "gate",
      null,
    );
    writeSession(session, pending);
    const child = spawnChatGpt(identity, {
      session,
      userDataDir: layout.userDataDir,
      environment,
    });
    metadata = { ...pending, pid: child.pid };
    writeSession(session, metadata);
    await waitForActivation(metadata, identities, options.timeoutMilliseconds);
    for (const identityEntry of identities) {
      if (identityEntry.main) {
        gates.push({ name: `activation:${identityEntry.id}:main`, status: "passed" });
      }
      for (const phase of identityEntry.phases) {
        gates.push({ name: `activation:${identityEntry.id}:${phase}`, status: "passed" });
      }
    }

    activeGate = "native-main-live-probe";
    const nativeMainEvidence = await waitForJson(
      path.join(
        layout.storageDirectory,
        "native-main-probe",
        "evidence.json",
      ),
      "Native Main Probe evidence",
      options.timeoutMilliseconds,
    );
    assertNativeMainProbeEvidence(nativeMainEvidence, {
      appVersion: identity.appVersion,
      appBuild: identity.appBuild,
      adapterVersion: binding.adapterVersion,
    });
    gates.push({
      name: "native-main-live-probe",
      status: "passed",
      evidence: summarizeNativeMainEvidence(nativeMainEvidence),
    });

    activeGate = "rich-message-diagnostics";
    richDiagnostics = await waitForCurrentRendererDiagnostics(
      path.join(session, "rich-content-diagnostics.json"),
      "rich-content interaction diagnostics",
      layout.logDirectory,
      identities,
      options.timeoutMilliseconds,
    );
    assertRichContentDiagnostics(richDiagnostics);
    const probeDocumentId = richDiagnostics.rendererDocumentId;
    if (
      !rendererDocumentActivationReady(
        readRuntimeRecords(layout.logDirectory),
        identities,
        probeDocumentId,
      )
    ) {
      throw new Error(
        "The Rich Message Probe document did not activate every renderer entry",
      );
    }
    const eventDirectory = path.join(
      layout.storageDirectory,
      "rich-message-probe",
      "events",
    );
    richEventFile = path.join(eventDirectory, richDiagnostics.eventFile);
    activeGate = "rich-message-events";
    let richEvents = await waitForRichEventLog(
      eventDirectory,
      false,
      richEventFile,
    );
    fs.writeFileSync(
      path.join(session, "rich-content-unmount-request"),
      `${probeDocumentId}\n`,
      { mode: 0o600 },
    );
    activeGate = "rich-message-unmount-events";
    richEvents = await waitForRichEventLog(eventDirectory, true, richEvents.file);
    activeGate = "rich-message-unmount-diagnostics";
    unmountDiagnostics = await waitForJson(
      path.join(session, "rich-content-unmount-diagnostics.json"),
      "rich-content unmount diagnostics",
      options.timeoutMilliseconds,
    );
    assertProbeDocumentIdentity(
      unmountDiagnostics,
      probeDocumentId,
      "Rich Message Probe unmount diagnostics",
    );
    if (unmountDiagnostics.eventFile !== richDiagnostics.eventFile) {
      throw new Error(
        "Rich Message Probe unmount diagnostics used a different event file",
      );
    }
    assertRichContentDiagnostics(unmountDiagnostics);
    assertRichContentUnmountDiagnostics(unmountDiagnostics);
    gates.push({
      name: "rich-message-live-interactions",
      status: "passed",
      evidence: {
        lifecycleEvents: richEvents.events.length,
        verified: true,
      },
    });

    activeGate = "ui-surface-diagnostics";
    const uiDiagnostics = await waitForJson(
      path.join(session, "ui-surface-diagnostics.json"),
      "UI surface interaction diagnostics",
      options.timeoutMilliseconds,
    );
    assertProbeDocumentIdentity(
      uiDiagnostics,
      probeDocumentId,
      "UI Surface Probe diagnostics",
    );
    activeGate = uiSurfaceDiagnosticFailureCode(uiDiagnostics);
    assertUiSurfaceDiagnostics(uiDiagnostics);
    activeGate = "ui-surface-events";
    const uiEvents = await waitForUiSurfaceEvents(
      path.join(
        layout.storageDirectory,
        "ui-surface-probe",
        uiDiagnostics.eventFile,
      ),
      options.timeoutMilliseconds,
    );
    gates.push({
      name: "ui-surface-live-interactions",
      status: "passed",
      evidence: summarizeUiSurfaceEvidence(uiDiagnostics, uiEvents),
    });

    activeGate = "product-extension-live-interactions";
    const productDiagnostics = await waitForJson(
      path.join(session, "product-extension-diagnostics.json"),
      "product extension diagnostics",
      options.timeoutMilliseconds,
    );
    assertProbeDocumentIdentity(
      productDiagnostics,
      probeDocumentId,
      "Product extension diagnostics",
    );
    assertProductExtensionDiagnostics(productDiagnostics);
    gates.push({
      name: "product-extension-live-interactions",
      status: "passed",
      evidence: summarizeProductExtensionEvidence(),
    });

    activeGate = "product-extension-real-ui-interactions";
    const productRealUiDiagnostics = await waitForJson(
      path.join(session, "product-extension-real-ui-diagnostics.json"),
      "real product extension UI diagnostics",
      options.timeoutMilliseconds,
    );
    assertProbeDocumentIdentity(
      productRealUiDiagnostics,
      probeDocumentId,
      "Real product extension UI diagnostics",
    );
    assertProductExtensionRealUiDiagnostics(productRealUiDiagnostics);
    gates.push({
      name: "product-extension-real-ui-interactions",
      status: "passed",
      evidence: summarizeProductExtensionRealUiEvidence(),
    });

    activeGate = "no-runtime-failures";
    await sleep(500);
    const failures = runtimeFailures(readRuntimeRecords(layout.logDirectory));
    if (failures.length > 0) {
      const events = [...new Set(failures.map((record) => record.event))].sort();
      throw new Error(`Runtime reported late failure events: ${events.join(", ")}`);
    }
    gates.push({ name: "no-runtime-failures", status: "passed" });
  } catch (error) {
    failure = error;
    failureCode = activeGate;
    if (layout) {
      const runtimeRecords = readRuntimeRecords(layout.logDirectory);
      runtimeEventCounts = summarizeGateRuntimeEvents(runtimeRecords);
      richProbeReadiness = summarizeGateRichProbeReadiness(runtimeRecords, [
        unmountDiagnostics,
        richDiagnostics,
      ], richDiagnostics?.rendererDocumentId);
    }
    if (richEventFile) {
      try {
        richEventSequence = summarizeRichProbeEventSequence(
          readBoundedJsonFile(richEventFile).events,
        );
      } catch {
        // The fixed phase code and runtime event counts remain sufficient.
      }
    }
    gates.push({
      name: "run-gate",
      status: "failed",
      failure: safeGateFailure(failureCode, error),
    });
  } finally {
    const cleanupTargets = [metadata, warmMetadata].filter(Boolean);
    for (const cleanupMetadata of cleanupTargets) {
      try {
        await stopOwnedProcesses(cleanupMetadata);
      } catch (error) {
        if (!failure) {
          failure = error;
          failureCode = "stop-owned-processes";
        }
        gates.push({
          name: "stop-owned-processes",
          status: "failed",
          failure: safeGateFailure("stop-owned-processes", error),
        });
      }
    }
    const ownedProcesses = cleanupTargets.flatMap((cleanupMetadata) =>
      ownedRuntimeProcesses(cleanupMetadata),
    );
    if (session && ownedProcesses.length === 0) {
      try {
        const canonicalTemporary = fs.realpathSync(os.tmpdir());
        const canonicalSession = fs.realpathSync(session);
        if (
          path.dirname(canonicalSession) !== canonicalTemporary ||
          !path.basename(canonicalSession).startsWith("chatgpt-extensions-gate.")
        ) {
          throw new Error("Gate session is outside its safe temporary root");
        }
        fs.rmSync(canonicalSession, { recursive: true, force: false });
      } catch (error) {
        if (!failure) {
          failure = error;
          failureCode = "remove-gate-session";
        }
        gates.push({
          name: "remove-gate-session",
          status: "failed",
          failure: safeGateFailure("remove-gate-session", error),
        });
      }
    }
    const result = {
      status: failure ? "failed" : "passed",
      gates,
      ...(failure
        ? { failure: safeGateFailure(failureCode, failure) }
        : {}),
      ...(failure && runtimeEventCounts
        ? { runtimeEventCounts }
        : {}),
      ...(failure && richEventSequence
        ? { richEventSequence }
        : {}),
      ...(failure && richProbeReadiness
        ? { richProbeReadiness }
        : {}),
    };
    writeJsonAtomic(options.result, result);
  }
  if (failure) throw failure;
  console.log(`Gate result: ${options.result}`);
}

async function main(arguments_) {
  const [command, ...rest] = arguments_;
  if (command === "start") {
    await start(parseLaunchArguments(rest));
    return;
  }
  if (command === "run-gate") {
    await runGate(parseLaunchArguments(rest));
    return;
  }
  if (command === "status" || command === "stop") {
    if (rest.length !== 1) return usage(`${command} requires one session path`);
    const metadata = readSession(path.resolve(rest[0]));
    if (command === "status") {
      console.log(JSON.stringify({
        session: metadata.session,
        processes: ownedRuntimeProcesses(metadata),
        runtimeFailures: runtimeFailures(readRuntimeRecords(metadata.logDirectory)),
      }));
    } else {
      await stopOwnedProcesses(metadata);
      console.log(`Stopped: ${metadata.session}`);
    }
    return;
  }
  usage();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
