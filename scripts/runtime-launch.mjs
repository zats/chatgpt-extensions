import { execFileSync, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const bootstrapFile = path.join(repositoryRoot, "runtime", "bootstrap.cjs");
export const sessionMarkerFile = ".chatgpt-extensions-session.json";
export const sessionMarker = "chatgpt-extensions-v5";
export const defaultProductExtensionDirectories = Object.freeze(
  ["extensions", "reactions", "thread-colors"].map((id) =>
    path.join(repositoryRoot, "extensions", id, "dist"),
  ),
);

const require = createRequire(import.meta.url);
const bindingRegistry = require(
  path.join(repositoryRoot, "runtime", "binding-registry.cjs"),
);

const stockBundleIdentifier = "com.openai.codex";
const stockTeamIdentifier = "2DC432GLL2";
const macVerificationTimeoutMilliseconds = 30_000;
const maximumDiagnosticJsonBytes = 10 * 1024 * 1024;
const maximumMetadataJsonBytes = 1024 * 1024;

export const runtimeFailureEventNames = new Set([
  "launch-configuration-invalid",
  "runtime-artifact-unreadable",
  "binding-host-patch-failed",
  "exact-build-mismatch",
  "renderer-host-injection-failed",
  "renderer-entry-registration-failed",
  "renderer-channel-connect-failed",
  "renderer-channel-inject-failed",
  "renderer-bootstrap-error",
  "main-extension-host-failed",
  "main-extension-error",
  "rich-content-probe-failed",
  "rich-content-probe-unmount-failed",
  "ui-surface-probe-failed",
  "product-extension-probe-failed",
  "product-extension-real-ui-probe-failed",
]);

function plistValue(infoFile, key) {
  return execFileSync(
    "/usr/bin/plutil",
    ["-extract", key, "raw", infoFile],
    { encoding: "utf8" },
  ).trim();
}

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function readBoundedJsonFile(
  file,
  maximumBytes = maximumDiagnosticJsonBytes,
) {
  const status = fs.lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new TypeError("JSON evidence must be a regular file");
  }
  if (status.size < 1) {
    throw new SyntaxError("JSON evidence is empty");
  }
  if (status.size > maximumBytes) {
    throw new RangeError("JSON evidence exceeds its size limit");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runMacVerification(executable, arguments_) {
  const result = spawnSync(executable, arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: macVerificationTimeoutMilliseconds,
    killSignal: "SIGKILL",
  });
  return Object.freeze({
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  });
}

function requireSuccessfulVerification(result, label) {
  if (result?.error?.code === "ETIMEDOUT") {
    throw new Error(`${label} timed out after ${macVerificationTimeoutMilliseconds} ms`);
  }
  if (!result || result.status !== 0 || result.error) {
    const detail = [result?.stdout, result?.stderr, result?.error?.message]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

export function verifyStockChatGptSignature(
  appPath,
  runCommand = runMacVerification,
) {
  requireSuccessfulVerification(
    runCommand("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath]),
    "ChatGPT code signature verification",
  );
  const details = requireSuccessfulVerification(
    runCommand("/usr/bin/codesign", ["--display", "--verbose=4", appPath]),
    "ChatGPT code signature inspection",
  );
  const signingIdentifier = details.match(/^Identifier=(\S+)$/m)?.[1];
  if (signingIdentifier !== stockBundleIdentifier) {
    throw new Error(
      `The selected app has an invalid signing identifier: ${signingIdentifier ?? "missing"}`,
    );
  }
  const teamIdentifier = details.match(/^TeamIdentifier=(\S+)$/m)?.[1];
  if (teamIdentifier !== stockTeamIdentifier) {
    throw new Error(
      `The selected app has an invalid TeamIdentifier: ${teamIdentifier ?? "missing"}`,
    );
  }
  requireSuccessfulVerification(
    runCommand("/usr/sbin/spctl", ["--assess", "--type", "execute", appPath]),
    "ChatGPT Gatekeeper assessment",
  );
  return Object.freeze({ signingIdentifier, teamIdentifier });
}

export function inspectChatGptApp(requestedApp, options = {}) {
  if (typeof requestedApp !== "string" || requestedApp.length === 0) {
    throw new TypeError("--app requires a ChatGPT.app path");
  }
  const appPath = fs.realpathSync(path.resolve(requestedApp));
  if (!fs.statSync(appPath).isDirectory() || path.extname(appPath) !== ".app") {
    throw new Error(`ChatGPT app is not an application bundle: ${appPath}`);
  }
  const contents = path.join(appPath, "Contents");
  const infoFile = fs.realpathSync(path.join(contents, "Info.plist"));
  const readPlistValue = options.readPlistValue ?? plistValue;
  const executableName = readPlistValue(infoFile, "CFBundleExecutable");
  const bundleIdentifier = readPlistValue(infoFile, "CFBundleIdentifier");
  if (bundleIdentifier !== stockBundleIdentifier) {
    throw new Error(`The selected app is not stock ChatGPT: ${bundleIdentifier}`);
  }
  const signature = verifyStockChatGptSignature(
    appPath,
    options.runCommand ?? runMacVerification,
  );
  const executable = fs.realpathSync(path.join(contents, "MacOS", executableName));
  const appAsarFile = fs.realpathSync(path.join(contents, "Resources", "app.asar"));
  return Object.freeze({
    appPath,
    contents,
    bundleIdentifier,
    signingIdentifier: signature.signingIdentifier,
    teamIdentifier: signature.teamIdentifier,
    executable,
    infoFile,
    appAsarFile,
    appVersion: readPlistValue(infoFile, "CFBundleShortVersionString"),
    appBuild: readPlistValue(infoFile, "CFBundleVersion"),
    appAsarSha256: sha256File(appAsarFile),
  });
}

export function selectBinding(identity, requestedBindingDirectory) {
  if (requestedBindingDirectory === undefined) {
    return bindingRegistry.findPublishedBinding(identity);
  }
  const directory = fs.realpathSync(path.resolve(requestedBindingDirectory));
  if (!fs.statSync(directory).isDirectory()) {
    throw new Error(`Binding is not a directory: ${directory}`);
  }
  const binding = bindingRegistry.loadBindingManifest(
    path.join(directory, "manifest.json"),
  );
  if (
    binding.appVersion !== identity.appVersion ||
    binding.appBuild !== identity.appBuild ||
    binding.appAsarSha256 !== identity.appAsarSha256
  ) {
    throw new Error(
      `Binding does not match ChatGPT ${identity.appVersion} (${identity.appBuild})`,
    );
  }
  return binding;
}

export function extensionSelections(extensionDirectories) {
  if (!Array.isArray(extensionDirectories)) {
    throw new TypeError("Extension directories must be an array");
  }
  return Object.freeze(
    extensionDirectories.map((requested) => {
      const packageDirectory = fs.realpathSync(path.resolve(requested));
      if (!fs.statSync(packageDirectory).isDirectory()) {
        throw new Error(`Extension package is not a directory: ${packageDirectory}`);
      }
      return Object.freeze({ packageDirectory, enabled: true });
    }),
  );
}

export function extensionIdentities(selections) {
  const identities = selections.map((selection) => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(selection.packageDirectory, "package.json"), "utf8"),
    );
    const phases = [];
    if (manifest?.chatgptx?.renderer !== undefined) phases.push("renderer");
    if (manifest?.chatgptx?.settings !== undefined) phases.push("settings");
    const main = manifest?.chatgptx?.main !== undefined;
    if (typeof manifest?.id !== "string" || (!main && phases.length === 0)) {
      throw new Error(`Invalid compiled extension package: ${selection.packageDirectory}`);
    }
    return Object.freeze({ id: manifest.id, main, phases: Object.freeze(phases) });
  });
  const ids = new Set();
  for (const identity of identities) {
    if (ids.has(identity.id)) throw new Error(`Duplicate extension id: ${identity.id}`);
    ids.add(identity.id);
  }
  return Object.freeze(identities);
}

export function createLaunchConfiguration(binding, storageDirectory, extensions) {
  return Object.freeze({
    schemaVersion: 2,
    bindingManifestFile: binding.manifestFile,
    bindingManifestSha256: binding.manifestDigest,
    storageDirectory,
    extensions,
  });
}

export function sanitizedStockLaunchEnvironment(baseEnvironment, codexHome) {
  const environment = {};
  const allowedKeys = new Set([
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LANGUAGE",
    "TZ",
    "__CF_USER_TEXT_ENCODING",
  ]);
  for (const [key, value] of Object.entries(baseEnvironment)) {
    if (
      typeof value === "string" &&
      (allowedKeys.has(key) || key.startsWith("LC_"))
    ) {
      environment[key] = value;
    }
  }
  environment.CODEX_HOME = codexHome;
  return environment;
}

export function sanitizedLaunchEnvironment(baseEnvironment, options) {
  const environment = sanitizedStockLaunchEnvironment(
    baseEnvironment,
    options.codexHome,
  );
  Object.assign(environment, {
    CHATGPTX_LAUNCH_CONFIGURATION: options.configurationFile,
    CHATGPTX_LOG_DIRECTORY: options.logDirectory,
    NODE_OPTIONS: `--require=${bootstrapFile}`,
  });
  if (options.testRoot) {
    environment.CHATGPTX_EXTENSION_TEST_ROOT = options.testRoot;
  }
  return environment;
}

export function processRows() {
  return execFileSync("/bin/ps", ["-axo", "pid=,pgid=,command="], {
    encoding: "utf8",
  })
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      return match
        ? [{ pid: Number(match[1]), processGroupId: Number(match[2]), command: match[3] }]
        : [];
    });
}

export function assertNoChatGptXProcess(rows = processRows()) {
  const conflicts = rows.filter((row) =>
    /\/Contents\/MacOS\/ChatGPTX(?:\s|$)/.test(row.command),
  );
  if (conflicts.length > 0) {
    throw new Error(
      `ChatGPTX is running (${conflicts.map((row) => row.pid).join(", ")}); quit it before a v5 gate`,
    );
  }
}

export function ownedRuntimeProcesses(metadata, rows = processRows()) {
  const profileArgument = `--user-data-dir=${metadata.userDataDir}`;
  const escapedProfileArgument = profileArgument.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const profilePattern = new RegExp(`${escapedProfileArgument}(?=\\s|$)`);
  return rows.filter(
    (row) =>
      row.command.includes(metadata.appContents) &&
      profilePattern.test(row.command),
  );
}

export function spawnChatGpt(identity, options) {
  const output = fs.openSync(path.join(options.session, "chatgpt.stdout.log"), "w", 0o600);
  const errorOutput = fs.openSync(
    path.join(options.session, "chatgpt.stderr.log"),
    "w",
    0o600,
  );
  try {
    const child = spawn(
      identity.executable,
      [`--user-data-dir=${options.userDataDir}`, "-SUEnableAutomaticChecks", "NO"],
      {
        detached: true,
        env: options.environment,
        stdio: ["ignore", output, errorOutput],
      },
    );
    child.unref();
    return child;
  } finally {
    fs.closeSync(output);
    fs.closeSync(errorOutput);
  }
}

export function runtimeFailures(records) {
  return records.filter(
    (record) =>
      runtimeFailureEventNames.has(record?.event) ||
      (record?.event === "renderer-entry-activation" && record?.status === "failed"),
  );
}

export function readRuntimeRecords(logDirectory) {
  const records = [];
  if (!fs.existsSync(logDirectory)) return records;
  for (const name of fs.readdirSync(logDirectory).filter((value) => value.endsWith(".jsonl"))) {
    const file = path.join(logDirectory, name);
    const status = fs.lstatSync(file);
    if (
      !status.isFile() ||
      status.isSymbolicLink() ||
      status.size > maximumDiagnosticJsonBytes
    ) {
      throw new RangeError("Runtime log exceeds its size limit");
    }
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (line) records.push(JSON.parse(line));
    }
  }
  return records;
}

export function writeJsonAtomic(file, value, mode = 0o600) {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode,
    });
    fs.renameSync(temporary, file);
    fs.chmodSync(file, mode);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {}
  }
}

export function readSession(session) {
  if (typeof session !== "string" || !path.isAbsolute(session)) {
    throw new Error("Session path must be absolute");
  }
  const directory = fs.realpathSync(session);
  const metadata = readBoundedJsonFile(
    path.join(directory, sessionMarkerFile),
    maximumMetadataJsonBytes,
  );
  if (
    metadata?.schemaVersion !== 1 ||
    metadata?.marker !== sessionMarker ||
    metadata?.session !== directory ||
    typeof metadata?.appContents !== "string" ||
    typeof metadata?.userDataDir !== "string"
  ) {
    throw new Error("Invalid v5 session marker");
  }
  const appContents = fs.realpathSync(metadata.appContents);
  const userDataDir = fs.realpathSync(metadata.userDataDir);
  if (
    metadata.appContents !== appContents ||
    metadata.userDataDir !== userDataDir ||
    path.basename(appContents) !== "Contents" ||
    path.extname(path.dirname(appContents)) !== ".app"
  ) {
    throw new Error("Invalid v5 session ownership paths");
  }
  return Object.freeze(metadata);
}

export function writeSession(session, value) {
  writeJsonAtomic(path.join(session, sessionMarkerFile), {
    schemaVersion: 1,
    marker: sessionMarker,
    session,
    ...value,
  });
}

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function stopOwnedProcesses(metadata, options = {}) {
  let processes = ownedRuntimeProcesses(metadata);
  for (const group of new Set(processes.map((row) => row.processGroupId))) {
    try {
      process.kill(-group, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  const deadline = Date.now() + (options.termTimeout ?? 10_000);
  while (Date.now() < deadline && ownedRuntimeProcesses(metadata).length > 0) {
    await sleep(100);
  }
  processes = ownedRuntimeProcesses(metadata);
  for (const group of new Set(processes.map((row) => row.processGroupId))) {
    try {
      process.kill(-group, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  const killDeadline = Date.now() + (options.killTimeout ?? 5_000);
  while (Date.now() < killDeadline && ownedRuntimeProcesses(metadata).length > 0) {
    await sleep(100);
  }
  if (ownedRuntimeProcesses(metadata).length > 0) {
    throw new Error(`ChatGPT processes are still running for ${metadata.session}`);
  }
}

export async function waitForActivation(metadata, identities, timeoutMilliseconds = 120_000) {
  const expected = new Set(
    identities.flatMap((identity) =>
      identity.phases.map((phase) => `${identity.id}:${phase}`),
    ),
  );
  const expectedMain = new Set(
    identities.filter((identity) => identity.main).map((identity) => identity.id),
  );
  const deadline = Date.now() + timeoutMilliseconds;
  let exactBuildRecord;
  while (Date.now() < deadline) {
    const records = readRuntimeRecords(metadata.logDirectory);
    const failures = runtimeFailures(records);
    if (failures.length > 0) {
      const events = [...new Set(failures.map((record) => record.event))].sort();
      throw new Error(`Runtime launch failed with events: ${events.join(", ")}`);
    }
    exactBuildRecord ??= records.find((record) => record.event === "exact-build-verified");
    for (const record of records) {
      if (record.event === "renderer-entry-activation" && record.status === "activated") {
        expected.delete(`${record.id}:${record.phase}`);
      }
      if (record.event === "main-extensions-activated" && Array.isArray(record.results)) {
        for (const result of record.results) {
          if (result?.status === "active") expectedMain.delete(result.extensionId);
        }
      }
    }
    if (exactBuildRecord && expected.size === 0 && expectedMain.size === 0) {
      return Object.freeze({ exactBuildRecord, records });
    }
    if (ownedRuntimeProcesses(metadata).length === 0) {
      throw new Error(`ChatGPT exited; see ${path.join(metadata.session, "chatgpt.stderr.log")}`);
    }
    await sleep(100);
  }
  throw new Error(
    `Timed out waiting for v5 activation: ${[
      ...expected,
      ...[...expectedMain].map((id) => `${id}:main`),
    ].join(", ")}`,
  );
}

export async function waitForJson(file, description, timeoutMilliseconds = 15_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return readBoundedJsonFile(file);
    } catch (error) {
      if (error instanceof RangeError) throw error;
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}: ${String(lastError)}`);
}
