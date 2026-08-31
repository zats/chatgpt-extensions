#!/usr/bin/env node

import { chmod, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runOwnedCommand } from "./owned-process.mjs";

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
  const byName = new Map();
  for (const gate of value.gates) {
    if (
      !gate ||
      typeof gate !== "object" ||
      typeof gate.name !== "string" ||
      gate.status !== "passed" ||
      byName.has(gate.name)
    ) {
      throw new TypeError("Direct launcher result contains a failed, duplicate, or invalid gate");
    }
    byName.set(gate.name, gate);
  }
  const required = [
    ...requiredLiveGates,
    ...(expectations.activationGates ?? []),
  ];
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
  const manifest = JSON.parse(await readFile(path.join(binding, "manifest.json"), "utf8"));
  const authFile = path.join(codexHome, "auth.json");
  const authStatus = await stat(authFile);
  if (!authStatus.isFile() || (authStatus.mode & 0o077) !== 0) {
    throw new Error("Codex auth.json must be a private regular file");
  }
  const extensions = options.extensions.length
    ? options.extensions
    : defaultExtensionDirectories;
  const resolvedExtensions = [];
  const activationGates = [];
  for (const directory of extensions) {
    const resolved = await realpath(path.resolve(repositoryRoot, directory));
    const extensionManifest = JSON.parse(
      await readFile(path.join(resolved, "package.json"), "utf8"),
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
        error.launcherResult = JSON.parse(await readFile(launcherResultFile, "utf8"));
      } catch {
        // The outer gate records that the launcher produced no readable result.
      }
      throw error;
    }
    const launcherResult = assertLauncherResult(
      JSON.parse(await readFile(launcherResultFile, "utf8")),
      { activationGates: inputs.activationGates, manifest: inputs.manifest },
    );
    return { inputs, launcherResult };
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
    result.error = String(error?.stack ?? error);
    if (error?.launcherResult !== undefined) result.launcher = error.launcherResult;
    await writeResult(options.result, result);
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
