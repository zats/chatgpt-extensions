#!/usr/bin/env node

import { chmod, lstat, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runOwnedCommand } from "./owned-process.mjs";
import {
  richProbeDisposalEvents,
  richProbeInteractionEvents,
} from "./rich-message-gate.mjs";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const requiredLiveGates = Object.freeze([
  "stock-profile-warmup",
  "deterministic-thread-fixture",
  "exact-binding",
  "native-main-live-probe",
  "rich-message-live-interactions",
  "ui-surface-live-interactions",
  "product-extension-live-interactions",
  "product-extension-real-ui-interactions",
  "no-runtime-failures",
]);
const defaultExtensionDirectories = Object.freeze([
  "extensions/extensions/dist",
  "extensions/reactions/dist",
  "extensions/thread-colors/dist",
  "test-fixtures/native-main-probe/dist",
  "test-fixtures/ui-surface-probe/dist",
  "test-fixtures/rich-message-probe/dist",
]);
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
const safeLauncherFailureCodes = new Set([
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
const safeRuntimeEventNames = Object.freeze([
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
const safeRichProbeStages = new Set([
  "registration-readiness",
  "owner-render",
  "mounted",
  "interacted",
]);
const safeRichProbeGroupKeys = Object.freeze({
  registrations: Object.freeze([
    "assistantDirective",
    "assistantContentReference",
    "assistantCodeBlock",
    "conversationItem",
  ]),
  owners: Object.freeze([
    "assistantDirective",
    "assistantContentReference",
    "assistantMarkdown",
    "assistantCodeBlock",
    "localConversationItem",
    "cloudConversationItem",
    "driftFree",
    "cloudOwnerReady",
  ]),
  fallbacks: Object.freeze([
    "assistantDirective",
    "assistantContentReference",
    "assistantCodeBlock",
    "conversationItemLocal",
    "conversationItemCloud",
  ]),
  interactions: Object.freeze([
    "directive",
    "directiveContainer",
    "contentReference",
    "codeBlock",
    "streamingCodeBlock",
    "conversationItem",
    "groupedConversationItem",
    "cloudConversationItem",
  ]),
});
const maximumDiagnosticJsonBytes = 10 * 1024 * 1024;
const maximumMetadataJsonBytes = 1024 * 1024;

async function readBoundedJsonFile(file, maximumBytes) {
  const status = await lstat(file);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new TypeError("JSON input must be a regular file");
  }
  if (status.size < 1 || status.size > maximumBytes) {
    throw new RangeError("JSON input exceeds its size limit");
  }
  return JSON.parse(await readFile(file, "utf8"));
}

function safeErrorName(error) {
  const name = typeof error?.name === "string" ? error.name : "Error";
  return safeErrorNames.has(name) ? name : "Error";
}

function allowedLauncherGateNames(expectations = {}) {
  return Object.freeze([
    ...requiredLiveGates,
    ...(expectations.activationGates ?? []),
  ]);
}

function safeRuntimeEventCounts(value) {
  return Object.freeze(
    Object.fromEntries(
      safeRuntimeEventNames.flatMap((name) => {
        const count = value?.[name];
        return Number.isSafeInteger(count) && count > 0
          ? [[name, count]]
          : [];
      }),
    ),
  );
}

function safeRichProbeEventSequence(value) {
  return Object.freeze(
    (Array.isArray(value) ? value : [])
      .flatMap((name) =>
        safeRichProbeEventNames.has(name) ? [name] : [],
      )
      .slice(0, 256),
  );
}

function exactBooleanMap(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some((key) => typeof value[key] !== "boolean")
  ) {
    return undefined;
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

export function safeRichProbeReadiness(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const topLevelKeys = [
    "stage",
    "mounted",
    "registrations",
    "owners",
    "fallbacks",
    "interactions",
  ];
  if (
    Object.keys(value).sort().join("\0") !== [...topLevelKeys].sort().join("\0") ||
    !safeRichProbeStages.has(value.stage) ||
    typeof value.mounted !== "boolean"
  ) {
    return undefined;
  }
  const registrations = exactBooleanMap(
    value.registrations,
    safeRichProbeGroupKeys.registrations,
  );
  const owners = exactBooleanMap(value.owners, safeRichProbeGroupKeys.owners);
  const fallbacks = exactBooleanMap(
    value.fallbacks,
    safeRichProbeGroupKeys.fallbacks,
  );
  const interactions = exactBooleanMap(
    value.interactions,
    safeRichProbeGroupKeys.interactions,
  );
  if (!registrations || !owners || !fallbacks || !interactions) {
    return undefined;
  }
  return Object.freeze({
    stage: value.stage,
    mounted: value.mounted,
    registrations,
    owners,
    fallbacks,
    interactions,
  });
}

function summarizedPassedGateEvidence(name, evidence, expectations) {
  const integer = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
  const flag = (value) => value === true;
  switch (name) {
    case "stock-profile-warmup":
      return Object.freeze({
        initializedState: flag(evidence?.initializedState),
        stopped: flag(evidence?.stopped),
      });
    case "deterministic-thread-fixture":
      return Object.freeze({ count: integer(evidence?.count) });
    case "exact-binding": {
      const manifest = expectations?.manifest;
      return Object.freeze({
        appVersion: manifest?.version ?? null,
        appBuild: manifest?.appBuild ?? null,
        appAsarSha256: manifest?.appAsarSha256 ?? null,
        bindingManifestSha256:
          typeof evidence?.bindingManifestSha256 === "string" &&
          /^[a-f0-9]{64}$/.test(evidence.bindingManifestSha256)
            ? evidence.bindingManifestSha256
            : null,
        downloadLength: Number.isSafeInteger(manifest?.downloadLength)
          ? manifest.downloadLength
          : null,
        downloadEdSignature: manifest?.downloadEdSignature ?? null,
      });
    }
    case "native-main-live-probe":
      return Object.freeze({
        verified: flag(evidence?.verified),
        rendererConnections: integer(evidence?.rendererConnections),
        rendererInvocations: integer(evidence?.rendererInvocations),
        targetedEvent: flag(evidence?.targetedEvent),
        broadcastEvent: flag(evidence?.broadcastEvent),
        cancellationObserved: flag(evidence?.cancellationObserved),
        resourcesReleased: flag(evidence?.resourcesReleased),
      });
    case "rich-message-live-interactions":
      return Object.freeze({
        verified: flag(evidence?.verified),
        lifecycleEvents: integer(evidence?.lifecycleEvents),
      });
    case "ui-surface-live-interactions":
      return Object.freeze({
        verified: flag(evidence?.verified),
        interactions: integer(evidence?.interactions),
        lifecycleEvents: integer(evidence?.lifecycleEvents),
        homeState: flag(evidence?.homeState),
        threadState: flag(evidence?.threadState),
      });
    case "product-extension-live-interactions":
      return Object.freeze({
        verified: flag(evidence?.verified),
        threadColorApplied: flag(evidence?.threadColorApplied),
        reactionApplied: flag(evidence?.reactionApplied),
      });
    case "product-extension-real-ui-interactions":
      return Object.freeze({
        verified: flag(evidence?.verified),
        realDom: flag(evidence?.realDom),
        headerColorApplied: flag(evidence?.headerColorApplied),
        activityLayoutVerified: flag(evidence?.activityLayoutVerified),
        standardLayoutVerified: flag(evidence?.standardLayoutVerified),
        cloudLayoutVerified: flag(evidence?.cloudLayoutVerified),
        reactionApplied: flag(evidence?.reactionApplied),
        settingsVerified: flag(evidence?.settingsVerified),
      });
    default:
      return undefined;
  }
}

export function parseStartCommand(value) {
  if (value === undefined || value === "") {
    return Object.freeze({
      executable: process.execPath,
      prefix: Object.freeze([path.join(repositoryRoot, "scripts", "start.mjs")]),
    });
  }
  if (value.trim().startsWith("[")) {
    const parsed = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.some((part) => typeof part !== "string" || part.length === 0)
    ) {
      throw new TypeError("CHATGPT_START_COMMAND JSON must be a non-empty string array");
    }
    return Object.freeze({ executable: parsed[0], prefix: Object.freeze(parsed.slice(1)) });
  }
  if (/\s/.test(value)) {
    throw new TypeError("CHATGPT_START_COMMAND must be one executable or a JSON string array");
  }
  return Object.freeze({ executable: value, prefix: Object.freeze([]) });
}

export function createGateEnvironment(source = process.env) {
  const environment = {
    CI: "1",
    HOME: source.HOME ?? os.homedir(),
    LANG: source.LANG ?? "en_US.UTF-8",
    LC_ALL: source.LC_ALL ?? source.LANG ?? "en_US.UTF-8",
    NO_COLOR: "1",
    PATH: source.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
    npm_config_audit: "false",
    npm_config_fund: "false",
  };
  for (const name of ["LOGNAME", "TEMP", "TMP", "TMPDIR", "USER"]) {
    if (typeof source[name] === "string" && source[name].length > 0) {
      environment[name] = source[name];
    }
  }
  if (
    typeof source.CHATGPT_START_COMMAND === "string" &&
    source.CHATGPT_START_COMMAND.length > 0
  ) {
    environment.CHATGPT_START_COMMAND = source.CHATGPT_START_COMMAND;
  }
  return Object.freeze(environment);
}

export function assertLauncherResult(value, expectations = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Direct launcher result must be an object");
  }
  if (value.status !== "passed") {
    throw new TypeError("Direct launcher did not report passed status");
  }
  if (!Array.isArray(value.gates)) {
    throw new TypeError("Direct launcher result has no gate evidence array");
  }
  const allowed = new Set(allowedLauncherGateNames(expectations));
  const byName = new Map();
  for (const gate of value.gates) {
    if (
      !gate ||
      typeof gate !== "object" ||
      typeof gate.name !== "string" ||
      gate.status !== "passed" ||
      byName.has(gate.name) ||
      !allowed.has(gate.name)
    ) {
      throw new TypeError("Direct launcher result contains a failed, duplicate, or invalid gate");
    }
    byName.set(gate.name, gate);
  }
  const required = allowedLauncherGateNames(expectations);
  const missing = required.filter((gate) => !byName.has(gate));
  if (missing.length > 0) {
    throw new TypeError(`Direct launcher did not pass gates: ${missing.join(", ")}`);
  }
  const exact = byName.get("exact-binding")?.evidence;
  if (
    expectations.manifest &&
    (exact?.appVersion !== expectations.manifest.version ||
      exact?.appBuild !== expectations.manifest.appBuild ||
      exact?.appAsarSha256 !== expectations.manifest.appAsarSha256 ||
      exact?.downloadLength !== expectations.manifest.downloadLength ||
      exact?.downloadEdSignature !== expectations.manifest.downloadEdSignature ||
      typeof exact?.bindingManifestSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(exact.bindingManifestSha256))
  ) {
    throw new TypeError("Direct launcher exact-binding evidence does not match the manifest");
  }
  for (const gate of [
    "native-main-live-probe",
    "rich-message-live-interactions",
    "ui-surface-live-interactions",
    "product-extension-live-interactions",
    "product-extension-real-ui-interactions",
  ]) {
    const evidence = byName.get(gate)?.evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      throw new TypeError(`Direct launcher ${gate} has no interaction evidence`);
    }
  }
  return value;
}

export function summarizeLauncherResult(value, expectations = {}) {
  const allowed = allowedLauncherGateNames(expectations);
  const byName = new Map(
    Array.isArray(value?.gates)
      ? value.gates
          .filter(
            (gate) =>
              gate &&
              typeof gate === "object" &&
              allowed.includes(gate.name) &&
              ["passed", "failed"].includes(gate.status) &&
              !gate.name.includes("\n"),
          )
          .map((gate) => [gate.name, gate])
      : [],
  );
  const failureCode = safeLauncherFailureCodes.has(value?.failure?.code)
    ? value.failure.code
    : "launcher-gate-failed";
  const runtimeEventCounts = safeRuntimeEventCounts(value?.runtimeEventCounts);
  const richEventSequence = safeRichProbeEventSequence(
    value?.richEventSequence,
  );
  const richProbeReadiness = safeRichProbeReadiness(
    value?.richProbeReadiness,
  );
  return Object.freeze({
    status: value?.status === "passed" ? "passed" : "failed",
    gates: Object.freeze(
      allowed.flatMap((name) =>
        byName.has(name)
          ? [
              Object.freeze({
                name,
                status: byName.get(name).status,
                ...(value?.status === "passed"
                  ? {
                      evidence: summarizedPassedGateEvidence(
                        name,
                        byName.get(name).evidence,
                        expectations,
                      ),
                    }
                  : {}),
              }),
            ]
          : [],
      ),
    ),
    ...(value?.status === "passed"
      ? {}
      : {
          failure: Object.freeze({
            code: failureCode,
            errorName: safeErrorName({ name: value?.failure?.errorName }),
          }),
          ...(Object.keys(runtimeEventCounts).length > 0
            ? { runtimeEventCounts }
            : {}),
          ...(richEventSequence.length > 0
            ? { richEventSequence }
            : {}),
          ...(richProbeReadiness ? { richProbeReadiness } : {}),
        }),
  });
}

function parseArguments(argv) {
  const options = { extensions: [], phase: "all" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--extension") {
      const value = argv[++index];
      if (!value) throw new Error("--extension requires a compiled extension directory");
      options.extensions.push(value);
      continue;
    }
    if (["--app", "--binding", "--codex-home", "--result", "--phase"].includes(argument)) {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2).replace("-", "_")] = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!["all", "static", "live"].includes(options.phase)) {
    throw new Error("--phase must be all, static, or live");
  }
  if (!options.result) throw new Error("--result is required");
  if (options.phase !== "static" && (!options.app || !options.binding || !options.codex_home)) {
    throw new Error("live gate requires --app, --binding, and --codex-home");
  }
  return options;
}

async function runStaticGate() {
  const commands = [
    ["npm", ["run", "typecheck"]],
    ["npm", ["test"]],
    ["npm", ["test", "--prefix", "test-fixtures/native-main-probe"]],
    ["npm", ["test", "--prefix", "test-fixtures/ui-surface-probe"]],
    ["npm", ["test", "--prefix", "test-fixtures/rich-message-probe"]],
    [process.execPath, ["scripts/build-runtime.mjs"]],
    ...[
      "extensions/extensions",
      "extensions/reactions",
      "extensions/thread-colors",
      "test-fixtures/native-main-probe",
      "test-fixtures/ui-surface-probe",
      "test-fixtures/rich-message-probe",
    ].map((directory) => [
      process.execPath,
      ["scripts/build-extension.mjs", directory],
    ]),
  ];
  const environment = createGateEnvironment();
  for (const [executable, arguments_] of commands) {
    await runOwnedCommand(executable, arguments_, {
      cwd: repositoryRoot,
      env: environment,
    });
  }
}

async function validateLiveInputs(options) {
  const app = await realpath(options.app);
  const binding = await realpath(options.binding);
  const codexHome = await realpath(options.codex_home);
  const manifest = await readBoundedJsonFile(
    path.join(binding, "manifest.json"),
    maximumMetadataJsonBytes,
  );
  const authFile = path.join(codexHome, "auth.json");
  const authStatus = await lstat(authFile);
  if (
    !authStatus.isFile() ||
    authStatus.isSymbolicLink() ||
    authStatus.size < 1 ||
    authStatus.size > maximumMetadataJsonBytes ||
    (authStatus.mode & 0o077) !== 0
  ) {
    throw new Error("Codex auth.json must be a private regular file");
  }
  const extensions = options.extensions.length
    ? options.extensions
    : defaultExtensionDirectories;
  const resolvedExtensions = [];
  const activationGates = [];
  for (const directory of extensions) {
    const resolved = await realpath(path.resolve(repositoryRoot, directory));
    const extensionManifest = await readBoundedJsonFile(
      path.join(resolved, "package.json"),
      maximumMetadataJsonBytes,
    );
    if (extensionManifest?.chatgptx?.main !== undefined) {
      activationGates.push(`activation:${extensionManifest.id}:main`);
    }
    if (extensionManifest?.chatgptx?.renderer !== undefined) {
      activationGates.push(`activation:${extensionManifest.id}:renderer`);
    }
    if (extensionManifest?.chatgptx?.settings !== undefined) {
      activationGates.push(`activation:${extensionManifest.id}:settings`);
    }
    resolvedExtensions.push(resolved);
  }
  return {
    app,
    binding,
    codexHome,
    extensions: resolvedExtensions,
    manifest,
    activationGates,
  };
}

async function runLiveGate(options) {
  const inputs = await validateLiveInputs(options);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "chatgpt-version-gate."));
  try {
    const launcherResultFile = path.join(temporary, "launcher-result.json");
    const start = parseStartCommand(process.env.CHATGPT_START_COMMAND);
    const arguments_ = [
      ...start.prefix,
      "run-gate",
      "--app",
      inputs.app,
      "--binding",
      inputs.binding,
      "--codex-home",
      inputs.codexHome,
      ...inputs.extensions.flatMap((directory) => ["--extension", directory]),
      "--result",
      launcherResultFile,
    ];
    try {
      await runOwnedCommand(start.executable, arguments_, {
        cwd: repositoryRoot,
        env: createGateEnvironment(),
        timeoutMilliseconds: 900_000,
      });
    } catch (error) {
      try {
        error.launcherResult = summarizeLauncherResult(
          await readBoundedJsonFile(
            launcherResultFile,
            maximumDiagnosticJsonBytes,
          ),
          { activationGates: inputs.activationGates },
        );
      } catch {
        // The outer gate records that the launcher produced no readable result.
      }
      throw error;
    }
    const launcherResult = assertLauncherResult(
      await readBoundedJsonFile(
        launcherResultFile,
        maximumDiagnosticJsonBytes,
      ),
      { activationGates: inputs.activationGates, manifest: inputs.manifest },
    );
    return {
      inputs,
      launcherResult: summarizeLauncherResult(launcherResult, {
        activationGates: inputs.activationGates,
        manifest: inputs.manifest,
      }),
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function writeResult(file, value) {
  const absolute = path.resolve(file);
  const temporary = `${absolute}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporary, 0o600);
  await rename(temporary, absolute);
}

export function safeFailure(phase, error) {
  return Object.freeze({
    code: `${phase}-gate-failed`,
    errorName: safeErrorName(error),
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = {
    schemaVersion: 1,
    status: "passed",
    phase: options.phase,
    gates: {},
  };
  try {
    if (options.phase !== "live") {
      await runStaticGate();
      result.gates.static = "passed";
    }
    if (options.phase !== "static") {
      const live = await runLiveGate(options);
      result.version = live.inputs.manifest.version;
      result.appBuild = live.inputs.manifest.appBuild;
      result.appAsarSha256 = live.inputs.manifest.appAsarSha256;
      for (const gate of requiredLiveGates) result.gates[gate] = "passed";
      result.gates.activations = "passed";
      result.launcher = live.launcherResult;
    }
    await writeResult(options.result, result);
    process.stdout.write(`${path.resolve(options.result)}\n`);
  } catch (error) {
    result.status = "failed";
    result.failure = safeFailure(options.phase, error);
    if (error?.launcherResult !== undefined) result.launcher = error.launcherResult;
    await writeResult(options.result, result);
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(() => {
    process.stderr.write("ChatGPT version gate failed; inspect the privacy-safe result artifact\n");
    process.exitCode = 1;
  });
}
