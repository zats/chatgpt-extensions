import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNativeMainProbeEvidence,
  assertProbeDocumentIdentity,
  assertProductExtensionDiagnostics,
  assertProductExtensionRealUiDiagnostics,
  assertUiSurfaceDiagnostics,
  assertUiSurfaceEvents,
  parseLaunchArguments,
  resolveIsolatedGateCodexHome,
  safeGateFailure,
  seedGateThreads,
  summarizeNativeMainEvidence,
  summarizeGatePrimaryUiReadiness,
  summarizeGateRuntimeEvents,
  summarizeGateRichProbeReadiness,
  summarizeRichProbeEventSequence,
  summarizeProductExtensionEvidence,
  summarizeProductExtensionRealUiEvidence,
  summarizeUiSurfaceEvidence,
  threadFixtureSchemaReady,
  uiSurfaceDiagnosticFailureCode,
  waitForThreadFixtureSchema,
  waitForCurrentRendererDiagnostics,
} from "./start.mjs";
import {
  bootstrapFile,
  assertNoChatGptXProcess,
  createLaunchConfiguration,
  inspectChatGptApp,
  ownedRuntimeProcesses,
  rendererDocumentActivationReady,
  runtimeFailures,
  sanitizedLaunchEnvironment,
  sanitizedStockLaunchEnvironment,
  selectBinding,
  verifyStockChatGptSignature,
  waitForActivation,
} from "./runtime-launch.mjs";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("public gate evidence uses strict allowlists", () => {
  const privateValue = "PrivateThreadTitle123";
  const evidence = {
    native: summarizeNativeMainEvidence({
      channel: {
        connectedRenderers: [{ url: privateValue }],
        rendererToMainInvokes: [privateValue],
      },
    }),
    ui: summarizeUiSurfaceEvidence(
      { results: [{ label: privateValue }] },
      { events: [{ value: privateValue }] },
    ),
    product: summarizeProductExtensionEvidence({ selectedText: privateValue }),
    productReal: summarizeProductExtensionRealUiEvidence({
      thread: { title: privateValue },
    }),
    failure: safeGateFailure("ui-surface-live-interactions", {
      name: privateValue,
      message: privateValue,
      stack: privateValue,
    }),
  };
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(privateValue));
  assert.deepEqual(Object.keys(evidence.native).sort(), [
    "broadcastEvent",
    "cancellationObserved",
    "rendererConnections",
    "rendererInvocations",
    "resourcesReleased",
    "targetedEvent",
    "verified",
  ]);
  assert.deepEqual(evidence.failure, {
    code: "ui-surface-live-interactions",
    errorName: "Error",
  });
  assert.throws(
    () => safeGateFailure("private-thread-title", new Error(privateValue)),
    /not allowlisted/,
  );
  assert.deepEqual(
    summarizeGateRuntimeEvents([
      { event: "renderer-injected", title: privateValue },
      { event: "renderer-injected", title: privateValue },
      { event: "rich-content-probe-skipped", threadId: privateValue },
      { event: privateValue },
    ]),
    {
      "renderer-injected": 2,
      "rich-content-probe-skipped": 1,
    },
  );
  assert.deepEqual(
    summarizeGatePrimaryUiReadiness([
      {
        event: "primary-ui-readiness",
        documentId: privateValue,
        ready: false,
        diagnostics: {
          appProtocol: true,
          documentComplete: true,
          bodyPresent: true,
          bodyChildren: 3,
          mainElements: 1,
          primaryRootFound: false,
          mainFocusFound: false,
          genericErrorVisible: true,
          updateActionVisible: true,
          retryActionVisible: true,
          bodyText: privateValue,
        },
      },
    ]),
    {
      attempts: 1,
      readyAttempts: 0,
      latest: {
        ready: false,
        appProtocol: true,
        documentComplete: true,
        bodyPresent: true,
        primaryRootFound: false,
        mainFocusFound: false,
        genericErrorVisible: true,
        updateActionVisible: true,
        retryActionVisible: true,
        bodyChildren: 3,
        mainElements: 1,
      },
    },
  );
  assert.equal(summarizeGatePrimaryUiReadiness([]), undefined);
  assert.deepEqual(
    summarizeRichProbeEventSequence([
      { name: "extension.activate", title: privateValue },
      { name: privateValue },
      { name: "conversation-item.dispose", threadId: privateValue },
    ]),
    ["extension.activate", "conversation-item.dispose"],
  );

  const readyFallbacks = () => ({
    nonMatch: { attempts: 1, connected: true },
    matcherError: { attempts: 1, connected: true },
    rendererError: { attempts: 1, connected: true },
  });
  const interaction = (initialLabel, finalLabel) => ({
    initialLabel,
    finalLabel,
    found: true,
    invalidateFound: true,
    invalidateClicked: true,
    replaced: true,
    oldDisconnected: true,
    otherOwnersReady: true,
    clicked: true,
    changed: true,
    privateValue,
  });
  const richProbeReadiness = summarizeGateRichProbeReadiness([
    {
      event: "rich-content-probe-failed",
      diagnostics: {
        stage: "mounted",
        mounted: true,
        registrations: {
          assistantDirective: 2,
          assistantContentReference: 2,
          assistantCodeBlock: 2,
          conversationItem: 3,
        },
        hits: {
          assistantDirective: 1,
          assistantContentReference: 1,
          assistantMarkdown: 2,
          assistantCodeBlock: 1,
          localConversationItem: 1,
          cloudConversationItem: 0,
        },
        drift: false,
        cloudOwnerReady: false,
        fallbacks: {
          assistantDirective: {
            unregistered: { attempts: 0, connected: true },
            rendererError: { attempts: 1, connected: true },
          },
          assistantContentReference: readyFallbacks(),
          assistantCodeBlock: readyFallbacks(),
          conversationItemLocal: readyFallbacks(),
          conversationItemCloud: {
            ...readyFallbacks(),
            matcherError: { attempts: 1, connected: false },
          },
        },
        interactions: {
          directive: interaction(
            "Rich probe directive 0",
            "Rich probe directive 1",
          ),
          directiveContainer: interaction(
            "Rich probe container directive 0",
            "Rich probe container directive 1",
          ),
          contentReference: interaction(
            "Rich probe content reference 0",
            "Rich probe content reference 1",
          ),
          codeBlock: {
            ...interaction(
              "Rich probe code block 0",
              "Rich probe code block 1",
            ),
            changed: false,
          },
          streamingCodeBlock: interaction(
            "Rich probe streaming code block 0",
            "Rich probe streaming code block 1",
          ),
          conversationItem: interaction(
            "Rich probe conversation item 0",
            "Rich probe conversation item 1",
          ),
          groupedConversationItem: interaction(
            "Rich probe grouped conversation item 0",
            "Rich probe grouped conversation item 1",
          ),
          cloudConversationItem: interaction(
            "Rich probe cloud conversation item 0",
            "Rich probe cloud conversation item 1",
          ),
        },
        rendererDocumentId: privateValue,
        eventFile: privateValue,
        error: { message: privateValue },
      },
      threadTitle: privateValue,
      accountToken: privateValue,
    },
  ]);
  assert.deepEqual(richProbeReadiness, {
    stage: "mounted",
    mounted: true,
    registrations: {
      assistantDirective: true,
      assistantContentReference: true,
      assistantCodeBlock: true,
      conversationItem: true,
    },
    owners: {
      assistantDirective: true,
      assistantContentReference: true,
      assistantMarkdown: true,
      assistantCodeBlock: true,
      localConversationItem: true,
      cloudConversationItem: false,
      driftFree: true,
      cloudOwnerReady: false,
    },
    fallbacks: {
      assistantDirective: true,
      assistantContentReference: true,
      assistantCodeBlock: true,
      conversationItemLocal: true,
      conversationItemCloud: false,
    },
    interactions: {
      directive: true,
      directiveContainer: true,
      contentReference: true,
      codeBlock: false,
      streamingCodeBlock: true,
      conversationItem: true,
      groupedConversationItem: true,
      cloudConversationItem: true,
    },
  });
  assert.doesNotMatch(JSON.stringify(richProbeReadiness), new RegExp(privateValue));
  assert.deepEqual(
    summarizeGateRichProbeReadiness([
      {
        event: "rich-content-probe-mounted",
        diagnostics: {
          stage: "interacted",
          mounted: true,
          registrations: {
            assistantDirective: 2,
            assistantContentReference: 2,
            assistantCodeBlock: 2,
            conversationItem: 3,
          },
          hits: {
            assistantDirective: 1,
            assistantContentReference: 1,
            assistantMarkdown: 2,
            assistantCodeBlock: 1,
            localConversationItem: 1,
            cloudConversationItem: 1,
          },
          drift: false,
          cloudOwnerReady: true,
          fallbacks: {
            assistantDirective: {
              unregistered: { attempts: 0, connected: true },
              rendererError: { attempts: 1, connected: true },
            },
            assistantContentReference: readyFallbacks(),
            assistantCodeBlock: readyFallbacks(),
            conversationItemLocal: readyFallbacks(),
            conversationItemCloud: readyFallbacks(),
          },
          interactions: {
            directive: interaction("Rich probe directive 0", "Rich probe directive 1"),
            directiveContainer: interaction("Rich probe container directive 0", "Rich probe container directive 1"),
            contentReference: interaction("Rich probe content reference 0", "Rich probe content reference 1"),
            codeBlock: interaction("Rich probe code block 0", "Rich probe code block 1"),
            streamingCodeBlock: interaction("Rich probe streaming code block 0", "Rich probe streaming code block 1"),
            conversationItem: interaction("Rich probe conversation item 0", "Rich probe conversation item 1"),
            groupedConversationItem: interaction("Rich probe grouped conversation item 0", "Rich probe grouped conversation item 1"),
            cloudConversationItem: interaction("Rich probe cloud conversation item 0", "Rich probe cloud conversation item 1"),
          },
          rendererDocumentId: privateValue,
          eventFile: privateValue,
        },
      },
    ]),
    {
      stage: "interacted",
      mounted: true,
      registrations: {
        assistantDirective: true,
        assistantContentReference: true,
        assistantCodeBlock: true,
        conversationItem: true,
      },
      owners: {
        assistantDirective: true,
        assistantContentReference: true,
        assistantMarkdown: true,
        assistantCodeBlock: true,
        localConversationItem: true,
        cloudConversationItem: true,
        driftFree: true,
        cloudOwnerReady: true,
      },
      fallbacks: {
        assistantDirective: true,
        assistantContentReference: true,
        assistantCodeBlock: true,
        conversationItemLocal: true,
        conversationItemCloud: true,
      },
      interactions: {
        directive: true,
        directiveContainer: true,
        contentReference: true,
        codeBlock: true,
        streamingCodeBlock: true,
        conversationItem: true,
        groupedConversationItem: true,
        cloudConversationItem: true,
      },
    },
  );
  assert.deepEqual(
    summarizeGateRichProbeReadiness([], [
      { stage: privateValue },
      {
        stage: "interacted",
        mounted: true,
        registrations: {},
        hits: {},
        fallbacks: {},
        interactions: {},
      },
    ]),
    {
      stage: "interacted",
      mounted: true,
      registrations: {
        assistantDirective: false,
        assistantContentReference: false,
        assistantCodeBlock: false,
        conversationItem: false,
      },
      owners: {
        assistantDirective: false,
        assistantContentReference: false,
        assistantMarkdown: false,
        assistantCodeBlock: false,
        localConversationItem: false,
        cloudConversationItem: false,
        driftFree: false,
        cloudOwnerReady: false,
      },
      fallbacks: {
        assistantDirective: false,
        assistantContentReference: false,
        assistantCodeBlock: false,
        conversationItemLocal: false,
        conversationItemCloud: false,
      },
      interactions: {
        directive: false,
        directiveContainer: false,
        contentReference: false,
        codeBlock: false,
        streamingCodeBlock: false,
        conversationItem: false,
        groupedConversationItem: false,
        cloudConversationItem: false,
      },
    },
  );
  assert.equal(
    summarizeGateRichProbeReadiness([
      { event: "rich-content-probe-failed", diagnostics: { stage: privateValue } },
    ]),
    undefined,
  );
  const documentA = {
    stage: "interacted",
    mounted: true,
    registrations: {},
    hits: {},
    fallbacks: {},
    interactions: {},
    rendererDocumentId: "document-a",
  };
  const documentB = {
    ...documentA,
    mounted: false,
    rendererDocumentId: "document-b",
  };
  assert.equal(
    summarizeGateRichProbeReadiness(
      [
        { event: "rich-content-probe-mounted", diagnostics: documentA },
        { event: "rich-content-probe-failed", diagnostics: documentB },
      ],
      [documentB],
      "document-a",
    )?.mounted,
    true,
  );
  assert.equal(
    summarizeGateRichProbeReadiness([], [documentB], "document-a"),
    undefined,
  );
});

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

function testPlistValue(infoFile, key) {
  const source = fs.readFileSync(infoFile, "utf8");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = new RegExp(
    `<key>${escapedKey}</key>\\s*<string>([^<]+)</string>`,
  ).exec(source)?.[1];
  if (value === undefined) throw new Error(`Missing test plist key: ${key}`);
  return value;
}

test("live probe diagnostics must use one renderer document", () => {
  const diagnostics = { rendererDocumentId: "document-a" };
  assert.equal(
    assertProbeDocumentIdentity(
      diagnostics,
      "document-a",
      "Probe diagnostics",
    ),
    diagnostics,
  );
  assert.throws(
    () =>
      assertProbeDocumentIdentity(
        { rendererDocumentId: "document-b" },
        "document-a",
        "Probe diagnostics",
      ),
    /different renderer document/,
  );
});

test("stock app inspection requires the Codex bundle and OpenAI signature", () => {
  const root = fs.mkdtempSync(path.join("/tmp", "chatgpt-stock-app."));
  const calls = [];
  try {
    const app = createTestApp(root, "com.openai.codex");
    const identity = inspectChatGptApp(app, {
      runCommand: successfulStockVerification(calls),
      readPlistValue: testPlistValue,
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
          readPlistValue: testPlistValue,
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
  assert.throws(
    () =>
      assertProductExtensionRealUiDiagnostics({
        validationPassed: false,
        realDom: true,
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
      removed: true,
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
  const replacedWithoutSemanticChange = {
    ...diagnostics,
    results: results.map((result) =>
      result.name === "suggestion"
        ? {
            ...result,
            oldDisconnected: true,
            replaced: true,
            changed: false,
          }
        : result,
    ),
  };
  assert.throws(
    () => assertUiSurfaceDiagnostics(replacedWithoutSemanticChange),
    /home\.suggestion/,
  );
  assert.equal(
    uiSurfaceDiagnosticFailureCode(replacedWithoutSemanticChange),
    "ui-surface-suggestion",
  );
  const replacedWithoutSemanticRemoval = {
    ...diagnostics,
    results: results.map((result) =>
      result.name === "announcement-dismiss"
        ? { ...result, oldDisconnected: true, removed: false }
        : result,
    ),
  };
  assert.throws(
    () => assertUiSurfaceDiagnostics(replacedWithoutSemanticRemoval),
    /home\.announcement-dismiss/,
  );
  assert.equal(
    uiSurfaceDiagnosticFailureCode(replacedWithoutSemanticRemoval),
    "ui-surface-announcement",
  );
  assert.equal(
    uiSurfaceDiagnosticFailureCode({
      ...diagnostics,
      results: results.map((result) =>
        result.name === "suggestion" ? { ...result, found: false } : result,
      ),
    }),
    "ui-surface-suggestion",
  );
  assert.equal(
    uiSurfaceDiagnosticFailureCode({
      ...diagnostics,
      states: {
        ...states,
        thread: { ...states.thread, threadRowFound: false },
      },
    }),
    "ui-surface-thread-row",
  );
  assert.equal(
    uiSurfaceDiagnosticFailureCode({
      ...diagnostics,
      states: {
        ...states,
        thread: { ...states.thread, missingRenders: ["composer.attachments"] },
      },
    }),
    "ui-surface-thread-composer",
  );
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

test("the gate uses only a marked isolated CODEX_HOME and seeds two threads", () => {
  const root = fs.mkdtempSync(path.join("/tmp", "chatgpt-gate-codex-home."));
  try {
    const source = path.join(root, "source");
    fs.mkdirSync(source, { mode: 0o700 });
    fs.writeFileSync(path.join(source, "auth.json"), '{"test":true}\n', {
      mode: 0o600,
    });
    fs.writeFileSync(
      path.join(source, ".chatgpt-extensions-isolated-live-gate"),
      "",
      { mode: 0o600 },
    );
    const codexHome = resolveIsolatedGateCodexHome(source);
    assert.equal(
      fs.readFileSync(path.join(codexHome, "auth.json"), "utf8"),
      '{"test":true}\n',
    );
    assert.equal(codexHome, fs.realpathSync(source));
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
    assert.equal(threadFixtureSchemaReady(stateFile), true);
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
    assert.equal(fs.existsSync(path.join(source, "state_5.sqlite")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the gate waits for the complete thread fixture schema", () => {
  const root = fs.mkdtempSync(path.join("/tmp", "chatgpt-gate-schema."));
  try {
    const stateFile = path.join(root, "state_5.sqlite");
    execFileSync("/usr/bin/sqlite3", [
      stateFile,
      "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT NOT NULL);",
    ]);
    assert.equal(threadFixtureSchemaReady(stateFile), false);
    assert.equal(threadFixtureSchemaReady(path.join(root, "missing.sqlite")), false);

    let sqliteInvocation;
    threadFixtureSchemaReady(stateFile, (executable, sqliteArguments, options) => {
      sqliteInvocation = { executable, arguments: sqliteArguments, options };
      return "id\ntitle\n";
    });
    assert.equal(sqliteInvocation.executable, "/usr/bin/sqlite3");
    assert.deepEqual(sqliteInvocation.arguments.slice(0, 6), [
      "-init",
      "/dev/null",
      "-batch",
      "-noheader",
      "-list",
      "-readonly",
    ]);
    assert.match(sqliteInvocation.arguments.at(-1), /SELECT name FROM pragma_table_info/);
    assert.deepEqual(sqliteInvocation.options.stdio, ["ignore", "pipe", "ignore"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the gate polls the thread schema and fails on exit or timeout", async () => {
  let clock = 0;
  let readinessChecks = 0;
  const waits = [];
  assert.equal(
    await waitForThreadFixtureSchema("/state.sqlite", 123, 500, {
      now: () => clock,
      schemaReady: () => {
        readinessChecks += 1;
        return readinessChecks === 3;
      },
      assertProcessAlive: () => {},
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        clock += milliseconds;
      },
    }),
    "/state.sqlite",
  );
  assert.equal(readinessChecks, 3);
  assert.deepEqual(waits, [100, 100]);

  await assert.rejects(
    waitForThreadFixtureSchema("/state.sqlite", 123, 500, {
      now: () => 0,
      schemaReady: () => false,
      assertProcessAlive: () => {
        const error = new Error("gone");
        error.code = "ESRCH";
        throw error;
      },
      wait: async () => {},
    }),
    /exited before it initialized the threads schema/,
  );

  clock = 0;
  await assert.rejects(
    waitForThreadFixtureSchema("/state.sqlite", 123, 200, {
      now: () => clock,
      schemaReady: () => false,
      assertProcessAlive: () => {},
      wait: async (milliseconds) => {
        clock += milliseconds;
      },
    }),
    /did not initialize the required threads schema/,
  );
});

test("the gate rejects an unmarked or malformed isolated CODEX_HOME", () => {
  const root = fs.mkdtempSync(path.join("/tmp", "chatgpt-gate-codex-rejection."));
  try {
    const source = path.join(root, "source");
    fs.mkdirSync(source, { mode: 0o700 });
    fs.writeFileSync(path.join(source, "auth.json"), '{"safe":true}\n', {
      mode: 0o600,
    });
    assert.throws(
      () => resolveIsolatedGateCodexHome(source),
      /ENOENT/,
    );

    const marker = path.join(
      source,
      ".chatgpt-extensions-isolated-live-gate",
    );
    fs.symlinkSync(path.join(source, "auth.json"), marker);
    assert.throws(
      () => resolveIsolatedGateCodexHome(source),
      /isolated owned directory/,
    );

    fs.unlinkSync(marker);
    fs.writeFileSync(marker, "", { mode: 0o600 });
    fs.writeFileSync(path.join(source, "auth.json"), "not-json\n", {
      mode: 0o600,
    });
    assert.throws(
      () => resolveIsolatedGateCodexHome(source),
      /valid JSON/,
    );

    fs.writeFileSync(
      path.join(source, "auth.json"),
      Buffer.alloc(1024 * 1024 + 1),
      { mode: 0o600 },
    );
    assert.throws(
      () => resolveIsolatedGateCodexHome(source),
      /private regular file/,
    );
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

test("the direct gate rejects any running ChatGPTX executable", () => {
  assert.doesNotThrow(() =>
    assertNoChatGptXProcess([
      {
        pid: 1,
        processGroupId: 1,
        command: "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
      },
    ]),
  );
  for (const command of [
    "/Applications/ChatGPTX.app/Contents/MacOS/ChatGPTX",
    "/private/var/folders/AppTranslocation/ChatGPTX.app/Contents/MacOS/ChatGPTX --flag",
    "/Applications/Renamed.app/Contents/MacOS/ChatGPTX --flag",
  ]) {
    assert.throws(
      () =>
        assertNoChatGptXProcess([
          { pid: 9, processGroupId: 9, command },
        ]),
      /ChatGPTX is running \(9\)/,
    );
  }
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
        {
          event: "renderer-entry-activation",
          documentId: "document-a",
          id: "example",
          phase: "renderer",
          status: "activated",
        },
        {
          event: "main-extensions-activated",
          results: [{ extensionId: "example", status: "active" }],
        },
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
    assert.deepEqual(value.rendererDocumentIds, ["document-a"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("renderer disconnect failures fail runtime validation", () => {
  const failure = {
    event: "renderer-channel-disconnect-failed",
    documentId: "document-a",
  };
  assert.deepEqual(runtimeFailures([failure]), [failure]);
});

test("renderer activation phases cannot be combined across documents", () => {
  const identities = [
    { id: "example", main: false, phases: ["renderer", "settings"] },
  ];
  const split = [
    {
      event: "renderer-entry-activation",
      documentId: "document-a",
      id: "example",
      phase: "renderer",
      status: "activated",
    },
    {
      event: "renderer-entry-activation",
      documentId: "document-b",
      id: "example",
      phase: "settings",
      status: "activated",
    },
  ];
  assert.equal(
    rendererDocumentActivationReady(split, identities, "document-a"),
    false,
  );
  assert.equal(
    rendererDocumentActivationReady(split, identities, "document-b"),
    false,
  );
  assert.equal(
    rendererDocumentActivationReady(
      [
        ...split,
        {
          event: "renderer-entry-activation",
          documentId: "document-b",
          id: "example",
          phase: "renderer",
          status: "activated",
        },
      ],
      identities,
      "document-b",
    ),
    true,
  );
  assert.equal(
    rendererDocumentActivationReady(
      [
        ...split,
        {
          event: "renderer-entry-activation",
          documentId: "document-a",
          id: "example",
          phase: "settings",
          status: "activated",
        },
        {
          event: "renderer-document-inactive",
          documentId: "document-a",
          reason: "main-frame-navigation",
        },
      ],
      identities,
      "document-a",
    ),
    false,
  );
});

test("rich diagnostics wait past an inactive document for the current document", async () => {
  const root = fs.mkdtempSync(path.join("/tmp", "chatgpt-current-diagnostics."));
  const logDirectory = path.join(root, "log");
  const diagnosticsFile = path.join(root, "rich-content-diagnostics.json");
  const logFile = path.join(logDirectory, "runtime.jsonl");
  const identities = [
    { id: "example", main: false, phases: ["renderer"] },
  ];
  fs.mkdirSync(logDirectory);
  fs.writeFileSync(
    logFile,
    [
      {
        event: "renderer-entry-activation",
        documentId: "document-a",
        id: "example",
        phase: "renderer",
        status: "activated",
      },
      {
        event: "renderer-document-inactive",
        documentId: "document-a",
        reason: "main-frame-navigation",
      },
    ].map((record) => JSON.stringify(record)).join("\n"),
  );
  fs.writeFileSync(
    diagnosticsFile,
    `${JSON.stringify({})}\n`,
  );
  try {
    setTimeout(() => {
      fs.writeFileSync(
        diagnosticsFile,
        `${JSON.stringify({ rendererDocumentId: "document-a" })}\n`,
      );
    }, 10);
    setTimeout(() => {
      fs.appendFileSync(
        logFile,
        `\n${JSON.stringify({
          event: "renderer-entry-activation",
          documentId: "document-b",
          id: "example",
          phase: "renderer",
          status: "activated",
        })}`,
      );
      fs.writeFileSync(
        diagnosticsFile,
        `${JSON.stringify({ rendererDocumentId: "document-b" })}\n`,
      );
    }, 25);
    const diagnostics = await waitForCurrentRendererDiagnostics(
      diagnosticsFile,
      "rich-content interaction diagnostics",
      logDirectory,
      identities,
      1_000,
    );
    assert.equal(diagnostics.rendererDocumentId, "document-b");
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
