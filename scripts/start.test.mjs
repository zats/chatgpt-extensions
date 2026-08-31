import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNativeMainProbeEvidence,
  assertProductExtensionDiagnostics,
  assertProductExtensionRealUiDiagnostics,
  assertUiSurfaceDiagnostics,
  assertUiSurfaceEvents,
  createGateCodexHome,
  parseLaunchArguments,
  seedGateThreads,
} from "./start.mjs";
import {
  bootstrapFile,
  createLaunchConfiguration,
  inspectChatGptApp,
  ownedRuntimeProcesses,
  sanitizedLaunchEnvironment,
  sanitizedStockLaunchEnvironment,
  selectBinding,
  verifyStockChatGptSignature,
  waitForActivation,
} from "./runtime-launch.mjs";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function createTestApp(root, bundleIdentifier) {
  const app = path.join(root, "ChatGPT.app");
  const contents = path.join(app, "Contents");
  fs.mkdirSync(path.join(contents, "MacOS"), { recursive: true });
  fs.mkdirSync(path.join(contents, "Resources"), { recursive: true });
  fs.writeFileSync(path.join(contents, "MacOS", "ChatGPT"), "test executable");
  fs.writeFileSync(path.join(contents, "Resources", "app.asar"), "test asar");
  fs.writeFileSync(
    path.join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ChatGPT</string>
<key>CFBundleIdentifier</key><string>${bundleIdentifier}</string>
<key>CFBundleShortVersionString</key><string>26.test</string>
<key>CFBundleVersion</key><string>1</string>
</dict></plist>`,
  );
  return app;
}

function successfulStockVerification(calls) {
  return (executable, arguments_) => {
    calls.push([executable, arguments_]);
    return {
      status: 0,
      stdout: "",
      stderr: arguments_.includes("--display")
        ? "Identifier=com.openai.codex\nTeamIdentifier=2DC432GLL2\n"
        : "",
    };
  };
}

test("stock app inspection requires the Codex bundle and OpenAI signature", () => {
  const root = fs.mkdtempSync(path.join("/tmp", "chatgpt-stock-app."));
  const calls = [];
  try {
    const app = createTestApp(root, "com.openai.codex");
    const identity = inspectChatGptApp(app, {
      runCommand: successfulStockVerification(calls),
    });
    assert.equal(identity.bundleIdentifier, "com.openai.codex");
    assert.equal(identity.signingIdentifier, "com.openai.codex");
    assert.equal(identity.teamIdentifier, "2DC432GLL2");
    assert.deepEqual(
      calls.map(([executable, arguments_]) => [executable, arguments_.slice(0, -1)]),
      [
        ["/usr/bin/codesign", ["--verify", "--deep", "--strict"]],
        ["/usr/bin/codesign", ["--display", "--verbose=4"]],
        ["/usr/sbin/spctl", ["--assess", "--type", "execute"]],
      ],
    );
    fs.rmSync(app, { recursive: true });
    createTestApp(root, "com.openai.chat");
    assert.throws(
      () =>
        inspectChatGptApp(app, {
          runCommand: successfulStockVerification([]),
        }),
      /not stock ChatGPT: com\.openai\.chat/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stock signature inspection rejects another team or failed Gatekeeper", () => {
  assert.throws(
    () =>
      verifyStockChatGptSignature("/tmp/ChatGPT.app", (_executable, arguments_) => ({
        status: 0,
        stdout: "",
        stderr: arguments_.includes("--display")
          ? "Identifier=com.example.fake\nTeamIdentifier=2DC432GLL2\n"
          : "",
      })),
    /invalid signing identifier: com\.example\.fake/,
  );
  assert.throws(
    () =>
      verifyStockChatGptSignature("/tmp/ChatGPT.app", (_executable, arguments_) => ({
        status: 0,
        stdout: "",
        stderr: arguments_.includes("--display")
          ? "Identifier=com.openai.codex\nTeamIdentifier=OTHERTEAM\n"
          : "",
      })),
    /invalid TeamIdentifier: OTHERTEAM/,
  );
  assert.throws(
    () =>
      verifyStockChatGptSignature("/tmp/ChatGPT.app", (executable, arguments_) => ({
        status: executable === "/usr/sbin/spctl" ? 1 : 0,
        stdout: "",
        stderr: arguments_.includes("--display")
          ? "Identifier=com.openai.codex\nTeamIdentifier=2DC432GLL2\n"
          : "rejected",
      })),
    /Gatekeeper assessment failed: rejected/,
  );
  const timeoutError = Object.assign(new Error("verification timed out"), {
    code: "ETIMEDOUT",
  });
  assert.throws(
    () =>
      verifyStockChatGptSignature("/tmp/ChatGPT.app", () => ({
        status: null,
        stdout: "",
        stderr: "",
        error: timeoutError,
      })),
    /code signature verification timed out after 30000 ms/,
  );
});

test("launcher parses an app, explicit CODEX_HOME, profile, binding, result, and extensions", () => {
  const options = parseLaunchArguments(
    [
      "--app", "downloads/ChatGPT.app",
      "--binding", "candidate",
      "--codex-home", "auth",
      "--user-data-dir", "profile",
      "--extension", "one/dist",
      "--extension", "/tmp/two/dist",
      "--result", "result.json",
      "--timeout-ms", "30000",
    ],
    { cwd: "/work" },
  );
  assert.equal(options.app, "/work/downloads/ChatGPT.app");
  assert.equal(options.binding, "/work/candidate");
  assert.equal(options.codexHome, "/work/auth");
  assert.equal(options.userDataDir, "/work/profile");
  assert.deepEqual(options.extensions, ["/work/one/dist", "/tmp/two/dist"]);
  assert.equal(options.result, "/work/result.json");
  assert.equal(options.timeoutMilliseconds, 30_000);
});

test("the native main gate requires live cross-process and cleanup evidence", () => {
  const extension = {
    id: "native-main-probe",
    instanceId: "main-instance",
    version: "0.1.0",
    manifestDigest: "a".repeat(64),
  };
  const document = {
    id: "document-native-main-probe",
    windowId: "window-native-main-probe",
    webContentsId: 41,
    url: "app://chatgpt.com/codex",
  };
  const event = (type) => ({
    type,
    rendererId: document.id,
    nonce: document.id,
  });
  const evidence = {
    schemaVersion: 1,
    status: "passed",
    extension,
    main: {
      electron: { sameSingleton: true },
      objc: {
        framework: "/System/Library/Frameworks/Foundation.framework/Foundation",
        className: "NSString",
        input: "ChatGPTX native main probe",
        output: "ChatGPTX native main probe",
        roundTrip: true,
      },
      node: {
        input: "native-main-probe",
        sha256: "a28a20cd7a09cc9be1dcec47b3a301baabe4b1ea0583ece756542eb937a2b762",
        processType: "browser",
        version: "24.14.0",
      },
      runtime: {
        apiVersion: "0.2.0",
        appVersion: "26.825.51511",
        appBuild: "7377",
        electronVersion: "42.3.0",
        chromiumVersion: "151.0.0.0",
        nodeVersion: "24.14.0",
        nodeModuleAbi: "143",
        nodeApiVersion: "10",
        objcJsVersion: "1.5.0",
        architecture: "arm64",
        platform: "macos",
        binding: {
          adapterVersion: "1.0.0",
          targetAppVersion: "26.825.51511",
          targetAppBuild: "7377",
          adapterDigest: "b".repeat(64),
          publicApiDigest: "c".repeat(64),
          evidenceDigest: "d".repeat(64),
        },
        extension,
        hosts: [],
        windows: [{ id: document.windowId, kind: "primary" }],
      },
      resources: {
        blocker: {
          id: 12,
          type: "prevent-app-suspension",
          started: true,
          released: true,
          stopped: true,
        },
        deferredCleanup: { runs: 1 },
      },
    },
    renderer: {
      document,
      extensionInstanceId: "renderer-instance",
    },
    channel: {
      rendererToMainInvokes: ["begin", "cancel", "finalize"],
      connectedRenderers: [document],
      listedCallerByIdentity: true,
      owner: {
        windowId: document.windowId,
        webContentsId: document.webContentsId,
        ownerWebContentsIsElectronLookup: true,
        ownerWindowIsElectronLookup: true,
        ownerWindowContainsWebContents: true,
      },
      targetedEvent: event("targeted"),
      broadcastEvent: event("broadcast"),
      cancellation: {
        invokeRejected: true,
        rendererErrorName: "AbortError",
        observedByMain: true,
        observedEvent: event("cancel-observed"),
      },
    },
  };
  assert.equal(
    assertNativeMainProbeEvidence(evidence, {
      appVersion: "26.825.51511",
      appBuild: "7377",
      adapterVersion: "1.0.0",
    }),
    evidence,
  );
  assert.throws(
    () =>
      assertNativeMainProbeEvidence({
        ...evidence,
        channel: {
          ...evidence.channel,
          cancellation: {
            ...evidence.channel.cancellation,
            observedByMain: false,
          },
        },
      }),
    /invoke\.cancellation/,
  );
  assert.throws(
    () =>
      assertNativeMainProbeEvidence(evidence, {
        appBuild: "wrong-build",
      }),
    /runtime\.binding/,
  );
});

test("the public gate rejects activation-only product evidence", () => {
  assert.throws(
    () =>
      assertProductExtensionDiagnostics({
        threadColors: { colorActionFound: true },
        reactions: { actionFound: true },
      }),
    /Product extension diagnostics are incomplete/,
  );
});

test("the real product gate rejects synthetic and incomplete DOM evidence", () => {
  assert.throws(
    () =>
      assertProductExtensionRealUiDiagnostics({
        realDom: true,
        thread: {
          scope: "execution",
          hostId: "local",
          threadId: "chatgptx-product-extension-probe",
          title: "Synthetic",
          signedInHeaderTitleFound: true,
        },
      }),
    /Real product extension UI diagnostics are incomplete/,
  );
});

test("the UI gate requires each composer slot in its first-party state", () => {
  const placements = [
    "composer.footer.leading",
    "composer.footer.trailing",
    "composer.action-bar.leading",
    "composer.action-bar.trailing",
    "composer.utility.leading",
    "composer.utility.trailing",
  ];
  const points = [...placements, "composer.attachments"];
  const threadPlacements = [
    "composer.footer.leading",
    "composer.footer.trailing",
  ];
  const threadPoints = [...threadPlacements, "composer.attachments"];
  const actionResult = (name, state) => ({
    name,
    state,
    kind: "action",
    found: true,
    clicked: true,
    oldDisconnected: true,
    replaced: true,
    changed: true,
  });
  const renderResult = (point, state) => ({
    name: `composer-render:${point}`,
    state,
    kind: "render",
    point,
    ownerFound: true,
    invalidateFound: true,
    invalidateClicked: true,
    oldDisconnected: true,
    replaced: true,
    actionFound: true,
    actionClicked: true,
  });
  const results = [
    actionResult("suggestion", "home"),
    actionResult("announcement-primary", "home"),
    {
      name: "announcement-dismiss",
      state: "home",
      kind: "dismiss",
      found: true,
      clicked: true,
      oldDisconnected: true,
    },
    actionResult("sidebar", "home"),
    actionResult("product-menu", "home"),
    ...placements.map((placement) =>
      actionResult(`composer-action:${placement}`, "home"),
    ),
    ...points.map((point) => renderResult(point, "home")),
    ...threadPlacements.map((placement) =>
      actionResult(`composer-action:${placement}`, "thread"),
    ),
    ...threadPoints.map((point) => renderResult(point, "thread")),
  ];
  const states = {
    home: { state: "home", missingActions: [], missingRenders: [] },
    thread: {
      state: "thread",
      missingActions: [],
      missingRenders: [],
      threadRowFound: true,
    },
  };
  const diagnostics = {
    results,
    states,
    rendererDocumentId: "document:test",
    eventFile: "events-document_test.json",
  };
  assert.doesNotThrow(() => assertUiSurfaceDiagnostics(diagnostics));
  assert.throws(
    () =>
      assertUiSurfaceDiagnostics({
        ...diagnostics,
        states: {
          ...states,
          thread: { ...states.thread, missingRenders: ["composer.attachments"] },
        },
      }),
    /thread\.renders/,
  );

  const names = [
    "suggestion.activate",
    "announcement.primary",
    "announcement.dismiss",
    "sidebar.select",
    "product-menu.activate",
    ...placements.flatMap((placement) =>
      Array(threadPlacements.includes(placement) ? 2 : 1).fill(
        `composer-action.${placement}.activate`,
      ),
    ),
    ...points.flatMap((point) => {
      const stateCount = threadPoints.includes(point) ? 2 : 1;
      const remainsMounted = threadPoints.includes(point) ? 1 : 0;
      return [
        ...Array(stateCount * 2).fill(`composer-render.${point}.mount`),
        ...Array(stateCount).fill(`composer-render.${point}.invalidate`),
        ...Array(stateCount).fill(`composer-render.${point}.activate`),
        ...Array(stateCount * 2 - remainsMounted).fill(
          `composer-render.${point}.dispose`,
        ),
      ];
    }),
  ];
  const events = names.map((name, index) => ({ sequence: index + 1, name }));
  assert.doesNotThrow(() => assertUiSurfaceEvents({ events }));
  assert.throws(
    () =>
      assertUiSurfaceEvents({
        events: events.filter(
          (event) =>
            event.name !== "composer-render.composer.attachments.activate",
        ).map((event, index) => ({ ...event, sequence: index + 1 })),
      }),
    /composer-render\.composer\.attachments\.activate/,
  );
});

test("launch environment contains only the direct v5 preload injection", () => {
  const stockEnvironment = sanitizedStockLaunchEnvironment(
    {
      PATH: "/bin",
      HOME: "/runner/home",
      TMPDIR: "/runner/tmp/",
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      NODE_OPTIONS: "--require=/old/injection.cjs",
      CHATGPTX_LAUNCH_CONFIGURATION: "/old/launch.json",
      CHATGPTX_EXTENSION_TEST_ROOT: "/old/test",
      GITHUB_ENV: "/runner/commands/env",
      GITHUB_PATH: "/runner/commands/path",
      GITHUB_TOKEN: "github-secret",
      ACTIONS_RUNTIME_TOKEN: "runtime-secret",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "identity-secret",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://runner.invalid/token",
      RUNNER_TEMP: "/runner/temp",
      RUNNER_TOOL_CACHE: "/runner/tools",
      CI: "true",
      CODEX_APP_TOOLS_PIPE_PATH: "/runner/control.sock",
    },
    "/auth",
  );
  assert.equal(stockEnvironment.PATH, "/bin");
  assert.equal(stockEnvironment.HOME, "/runner/home");
  assert.equal(stockEnvironment.TMPDIR, "/runner/tmp/");
  assert.equal(stockEnvironment.LANG, "en_US.UTF-8");
  assert.equal(stockEnvironment.LC_ALL, "en_US.UTF-8");
  assert.equal(stockEnvironment.CODEX_HOME, "/auth");
  assert.equal(stockEnvironment.NODE_OPTIONS, undefined);
  assert.equal(stockEnvironment.CHATGPTX_LAUNCH_CONFIGURATION, undefined);
  assert.equal(stockEnvironment.CHATGPTX_EXTENSION_TEST_ROOT, undefined);
  for (const key of [
    "GITHUB_ENV",
    "GITHUB_PATH",
    "GITHUB_TOKEN",
    "ACTIONS_RUNTIME_TOKEN",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
    "ACTIONS_ID_TOKEN_REQUEST_URL",
    "RUNNER_TEMP",
    "RUNNER_TOOL_CACHE",
    "CI",
    "CODEX_APP_TOOLS_PIPE_PATH",
  ]) {
    assert.equal(stockEnvironment[key], undefined, key);
  }

  const environment = sanitizedLaunchEnvironment(
    {
      PATH: "/bin",
      NODE_OPTIONS: "--require=/old/injection.cjs",
      CHATGPTX_VERSIONS_LOCK: "/old/lock.json",
      DYLD_INSERT_LIBRARIES: "/old/helper.dylib",
      NODE_PATH: "/old/modules",
    },
    {
      codexHome: "/auth",
      configurationFile: "/session/launch.json",
      logDirectory: "/session/log",
    },
  );
  assert.equal(environment.PATH, "/bin");
  assert.equal(environment.CODEX_HOME, "/auth");
  assert.equal(environment.NODE_OPTIONS, `--require=${bootstrapFile}`);
  assert.equal(environment.CHATGPTX_LAUNCH_CONFIGURATION, "/session/launch.json");
  assert.equal(environment.CHATGPTX_VERSIONS_LOCK, undefined);
  assert.equal(environment.DYLD_INSERT_LIBRARIES, undefined);
  assert.equal(environment.NODE_PATH, undefined);
});

test("the gate copies only private auth and seeds two isolated threads", () => {
  const root = fs.mkdtempSync(path.join("/tmp", "chatgpt-gate-codex-home."));
  try {
    const source = path.join(root, "source");
    const session = path.join(root, "session");
    fs.mkdirSync(source, { mode: 0o700 });
    fs.mkdirSync(session, { mode: 0o700 });
    fs.writeFileSync(path.join(source, "auth.json"), '{"test":true}\n', {
      mode: 0o600,
    });
    fs.writeFileSync(path.join(source, "unrelated.json"), "do not copy\n");
    const codexHome = createGateCodexHome(source, session);
    assert.equal(
      fs.readFileSync(path.join(codexHome, "auth.json"), "utf8"),
      '{"test":true}\n',
    );
    assert.equal(fs.existsSync(path.join(codexHome, "unrelated.json")), false);
    assert.equal(fs.statSync(path.join(codexHome, "auth.json")).mode & 0o077, 0);

    const stateFile = path.join(codexHome, "state_5.sqlite");
    execFileSync("/usr/bin/sqlite3", [stateFile, `
      CREATE TABLE threads (
        id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        source TEXT NOT NULL, model_provider TEXT NOT NULL,
        cwd TEXT NOT NULL, title TEXT NOT NULL,
        sandbox_policy TEXT NOT NULL, approval_mode TEXT NOT NULL,
        tokens_used INTEGER NOT NULL, has_user_event INTEGER NOT NULL,
        archived INTEGER NOT NULL, cli_version TEXT NOT NULL,
        first_user_message TEXT NOT NULL, memory_mode TEXT NOT NULL,
        model TEXT, reasoning_effort TEXT, thread_source TEXT,
        preview TEXT NOT NULL, recency_at INTEGER NOT NULL,
        history_mode TEXT NOT NULL
      );
    `]);
    const fixtures = seedGateThreads(codexHome);
    assert.equal(fixtures.length, 2);
    const count = Number(
      execFileSync(
        "/usr/bin/sqlite3",
        [stateFile, "SELECT count(*) FROM threads;"],
        { encoding: "utf8" },
      ).trim(),
    );
    assert.equal(count, 2);
    for (const fixture of fixtures) {
      assert.equal(fs.existsSync(fixture.rolloutPath), true);
      const records = fs.readFileSync(fixture.rolloutPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.equal(
        records.some(
          (record) =>
            record.type === "response_item" &&
            record.payload?.role === "assistant",
        ),
        true,
      );
    }
    assert.equal(fs.existsSync(path.join(source, "state_5.sqlite")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("launch configuration names one validated binding manifest and no caller identity", () => {
  const index = JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, "runtime", "bindings", "index.json"),
      "utf8",
    ),
  );
  const entry = index.bindings[index.current];
  const binding = selectBinding({
    appVersion: entry.version,
    appBuild: entry.appBuild,
    appAsarSha256: entry.appAsarSha256,
  });
  const configuration = createLaunchConfiguration(binding, "/state", []);
  assert.deepEqual(Object.keys(configuration).sort(), [
    "bindingManifestFile",
    "bindingManifestSha256",
    "extensions",
    "schemaVersion",
    "storageDirectory",
  ]);
  assert.equal(configuration.schemaVersion, 2);
  assert.equal(configuration.bindingManifestFile, binding.manifestFile);
  assert.equal(configuration.bindingManifestSha256, binding.manifestDigest);
  assert.equal("appVersion" in configuration, false);
  assert.equal("hostFile" in configuration, false);
});

test("status and stop ownership requires both the exact app bundle and profile", () => {
  const metadata = {
    appContents: "/Applications/ChatGPT.app/Contents",
    userDataDir: "/tmp/owned-profile",
  };
  const rows = [
    {
      pid: 1,
      processGroupId: 1,
      command: "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT --user-data-dir=/tmp/owned-profile",
    },
    {
      pid: 2,
      processGroupId: 2,
      command: "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT --user-data-dir=/tmp/other-profile",
    },
    {
      pid: 3,
      processGroupId: 3,
      command: "/tmp/Fake.app/Contents/MacOS/Fake --user-data-dir=/tmp/owned-profile",
    },
    {
      pid: 4,
      processGroupId: 4,
      command: "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT --user-data-dir=/tmp/owned-profile-copy",
    },
  ];
  assert.deepEqual(ownedRuntimeProcesses(metadata, rows), [rows[0]]);
});

test("activation waits for both renderer phases and main entries", async () => {
  const root = fs.mkdtempSync(path.join("/tmp", "chatgpt-launch-activation."));
  const logDirectory = path.join(root, "log");
  fs.mkdirSync(logDirectory);
  try {
    fs.writeFileSync(
      path.join(logDirectory, "runtime.jsonl"),
      [
        { event: "exact-build-verified" },
        { event: "renderer-entry-activation", id: "example", phase: "renderer", status: "activated" },
        { event: "main-extensions-activated", results: [{ extensionId: "example", status: "active" }] },
      ].map((value) => JSON.stringify(value)).join("\n"),
    );
    const value = await waitForActivation(
      {
        logDirectory,
        appContents: "/not-used/ChatGPT.app/Contents",
        userDataDir: "/not-used/profile",
      },
      [{ id: "example", main: true, phases: ["renderer"] }],
      1_000,
    );
    assert.equal(value.exactBuildRecord.event, "exact-build-verified");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("public launcher has a stable gate result contract and no prior installation lookup", async () => {
  const source = await readFile(path.join(repositoryRoot, "scripts", "start.mjs"), "utf8");
  const sharedSource = await readFile(
    path.join(repositoryRoot, "scripts", "runtime-launch.mjs"),
    "utf8",
  );
  assert.match(source, /status: failure \? "failed" : "passed"/);
  assert.match(source, /gates,/);
  const packageManifest = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  assert.match(packageManifest.scripts.start, /node scripts\/start\.mjs start$/);
  for (const forbidden of ["versions-lock.json", '"extensions", "versions-lock"']) {
    assert.equal(source.includes(forbidden), false, forbidden);
    assert.equal(sharedSource.includes(forbidden), false, forbidden);
  }
});
