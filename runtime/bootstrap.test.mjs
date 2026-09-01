import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";

import bootstrap from "./bootstrap.cjs";

const {
  createPrimaryDocumentClaim,
  createRendererLifecycle,
  executeRendererJavaScript,
  isCurrentRendererDocument,
  nativeBindingFailureDiagnosticsExpression,
  primaryAppShellDiagnosticsExpression,
  primaryAppShellReadyExpression,
  probeCompletionDisposition,
  productExtensionRealUiFailureDiagnostics,
  requireCurrentRendererDocument,
  productExtensionDiagnosticsReady,
  productExtensionRealUiDiagnosticsReady,
  sanitizeProductExtensionRealUiDiagnostics,
  rendererHostReadyExpression,
  richContentFallbacksReady,
  richContentFullyUnmounted,
  richContentInteractionScript,
  richContentInteractionsReady,
  richContentProbeLifecycleEvidence,
  richContentOwnersReady,
  richContentRegistrationsReady,
  richContentUnmountDiagnostics,
  richContentUnmountRequested,
  richMessageProbeEventFile,
  settleProbePollFailure,
  startRendererLifecycle,
  uiSurfaceInteractionReady,
  uiSurfaceProbeEventFile,
  waitForPrimaryUiReadiness,
  writeCurrentRendererDocumentDiagnostics,
} = bootstrap;

test("renderer JavaScript execution returns a settled result within its bound", async () => {
  const calls = [];
  const contents = {
    executeJavaScript(source) {
      calls.push(source);
      return Promise.resolve(42);
    },
  };
  assert.equal(
    await executeRendererJavaScript(contents, "window.answer", 100),
    42,
  );
  assert.deepEqual(calls, ["window.answer"]);
});

test("renderer JavaScript execution preserves an evaluation failure", async () => {
  const failure = new RangeError("private renderer failure detail");
  await assert.rejects(
    executeRendererJavaScript(
      { executeJavaScript: () => Promise.reject(failure) },
      "window.failure",
      100,
    ),
    (error) => error === failure,
  );
});

test("renderer JavaScript execution bounds a pending evaluation", async () => {
  await assert.rejects(
    executeRendererJavaScript(
      { executeJavaScript: () => new Promise(() => {}) },
      "window.pending",
      10,
    ),
    (error) =>
      error?.name === "TimeoutError" &&
      error.message === "Renderer JavaScript evaluation timed out",
  );
});

test("a renderer evaluation rejection after timeout is handled", async () => {
  let rejectEvaluation;
  const evaluation = new Promise((_, reject) => {
    rejectEvaluation = reject;
  });
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  try {
    await assert.rejects(
      executeRendererJavaScript(
        { executeJavaScript: () => evaluation },
        "window.lateFailure",
        10,
      ),
      { name: "TimeoutError" },
    );
    rejectEvaluation(new Error("private late renderer failure"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("renderer JavaScript execution validates its finite bound", async () => {
  const contents = { executeJavaScript: () => Promise.resolve(true) };
  await assert.rejects(
    executeRendererJavaScript(contents, "true", 0),
    /timeout must be a positive number/,
  );
  await assert.rejects(
    executeRendererJavaScript(contents, "true", Number.POSITIVE_INFINITY),
    /timeout must be a positive number/,
  );
  await assert.rejects(
    executeRendererJavaScript(contents, null, 10),
    /source must be a string/,
  );
});

test("all bootstrap renderer evaluations use the bounded helper", () => {
  const source = readFileSync(new URL("./bootstrap.cjs", import.meta.url), "utf8");
  assert.equal(source.match(/contents\.executeJavaScript/g)?.length, 1);
});

test("the UI surface probe returns partial diagnostics within one total budget", () => {
  const source = readFileSync(new URL("./bootstrap.cjs", import.meta.url), "utf8");
  const start = source.indexOf("async function interactWithUiSurfaceProbe");
  const end = source.indexOf("async function waitForPrimaryUiDocument", start);
  const probe = source.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(probe, /const probeDeadline = Date\.now\(\) \+ \$\{uiSurfaceProbeBudgetMilliseconds\}/);
  assert.match(probe, /const stageDeadline = \(milliseconds\) =>/);
  assert.equal(probe.match(/Date\.now\(\) \+/g)?.length, 2);
  assert.match(probe, /uiSurfaceProbeBudgetMilliseconds \+ 10_000/);
});

test("rich-content probe lifecycle evidence uses only fixed values", () => {
  const stages = [
    "primary-readiness",
    "primary-diagnostics",
    "registration-readiness",
    "mount-request",
    "owner-render",
    "interactions",
    "unmount-request",
    "unmount-owner-render",
  ];
  for (const stage of stages) {
    assert.deepEqual(richContentProbeLifecycleEvidence(stage), { stage });
    assert.deepEqual(richContentProbeLifecycleEvidence(stage, true), {
      stage,
      reason: "document-inactive",
    });
  }
  assert.throws(
    () => richContentProbeLifecycleEvidence("private thread title"),
    /Unknown rich-content probe stage/,
  );
  assert.throws(
    () => richContentProbeLifecycleEvidence("interactions", "private reason"),
    /aborted state must be a boolean/,
  );
});

test("a probe poll failure records terminal evidence before completion", () => {
  const order = [];
  const result = settleProbePollFailure(
    new Error("private file failure"),
    (error) => order.push(`record:${error.name}`),
    (completed) => {
      order.push(`finish:${completed}`);
      return "settled";
    },
  );
  assert.equal(result, "settled");
  assert.deepEqual(order, ["record:Error", "finish:false"]);
  assert.throws(
    () => settleProbePollFailure(new Error("failure"), null, () => {}),
    /failure handlers are required/,
  );
});

const richFallbackSurfaces = [
  "assistantContentReference",
  "assistantCodeBlock",
  "conversationItemLocal",
  "conversationItemCloud",
];

function completeRichFallbacks(connected = true) {
  return {
    assistantDirective: {
      unregistered: { attempts: 0, connected },
      rendererError: { attempts: 1, connected },
    },
    ...Object.fromEntries(richFallbackSurfaces.map((surface) => [
      surface,
      {
        nonMatch: { attempts: 1, connected },
        matcherError: { attempts: 1, connected },
        rendererError: { attempts: 1, connected },
      },
    ])),
  };
}

function completeProductExtensionDiagnostics() {
  return {
    threadColors: {
      colorActionFound: true,
      colorActionClicked: true,
      header: {
        properties: {
          "--header-background-color": "#3A83F7",
        },
        backgroundAttribute: true,
        backgroundStyle: "#3A83F7",
      },
      sidebarRow: {
        registrationFound: true,
        viewFound: true,
        indicatorFound: true,
        width: "3px",
        height: "100%",
        background: "light-dark(#3a83f7, #3a83f7)",
      },
      stored: {
        thread: {
          scope: "execution",
          hostId: "local",
          threadId: "chatgptx-product-extension-probe",
        },
        selection: { type: "preset", id: "blue" },
      },
    },
    reactions: {
      actionFound: true,
      actionClicked: true,
      actionId: "reactions.reaction-1",
      actionOrigin: "reactions",
      label: "👍",
      persisted: {
        annotation: "User reacted with 👍",
        selectedText: "ChatGPTX product reaction probe selection",
        submit: false,
      },
    },
  };
}

function completeProductExtensionRealUiDiagnostics() {
  const layout = {
    rowFound: true,
    titleTriggerFound: true,
    indicatorFound: true,
    indicatorCount: 1,
    uncoloredRowFound: true,
    indicator: { width: 3, height: 40 },
    indicatorBackground: "rgb(58, 131, 247)",
    indicatorFillsRow: true,
    titleGap: 3,
    coloredAndUncoloredTitlesAligned: true,
  };
  return {
    rendererDocumentId: "document:test-renderer",
    realDom: true,
    thread: {
      scope: "execution",
      hostId: "local",
      threadId: "real-thread",
      title: "Real thread",
    },
    threadColors: {
      nativeMenuTrigger: true,
      nativeMenuAction: true,
      nativeFlyoutAction: true,
      header: {
        found: true,
        titleFound: true,
        blueRegionFound: true,
        background: "rgb(58, 131, 247)",
      },
      activity: { ...layout, row: { height: 54 } },
      standard: { ...layout, row: { height: 36 } },
      activityRowIsTaller: true,
      remoteCodex: {
        component: "RemoteSidebarThreadRow",
        fixture: "task",
        thread: {
          scope: "cloud",
          accountId: "account-a",
          workspaceId: "workspace-a",
          threadId: "remote-task",
          mode: "codex",
          location: "remote",
        },
        menuActionFound: true,
        menuActionClicked: true,
        ownerMatched: true,
        standard: { ...layout, row: { height: 36 } },
        activity: { ...layout, row: { height: 54 } },
        activityRowIsTaller: true,
        disposed: true,
        stored: {
          thread: {
            scope: "cloud",
            accountId: "account-a",
            workspaceId: "workspace-a",
            threadId: "remote-task",
          },
          selection: { type: "preset", id: "blue" },
        },
      },
      chatGptCloud: { ownerObserved: false },
      stored: {
        thread: {
          scope: "execution",
          hostId: "local",
          threadId: "real-thread",
        },
        selection: { type: "preset", id: "blue" },
      },
    },
    reactions: {
      targetFound: true,
      selectedText: "Actual assistant text",
      actionFound: true,
      actionVisible: true,
      nativeToolbarFound: true,
      sharesNativeActionComponent: true,
      creationCountBefore: 3,
      creationCountAfter: 4,
      composerAnnotationFound: true,
      persisted: {
        annotation: "User reacted with 👍",
        selectedText: "Actual assistant text",
        submit: false,
      },
    },
    settings: {
      opened: true,
      searchFieldFound: true,
      queryAccepted: true,
      queryClearedAfterSelection: true,
      searchResultFound: true,
      searchResultClicked: true,
      selectedPane: "extensions.installed",
      threadColorsVisible: true,
      refreshControlAbsent: true,
      globalErrorAbsent: true,
    },
  };
}

test("product extension diagnostics require live UI and persisted outputs", () => {
  const diagnostics = completeProductExtensionDiagnostics();
  assert.equal(productExtensionDiagnosticsReady(diagnostics), true);
  assert.equal(
    productExtensionDiagnosticsReady({
      ...diagnostics,
      reactions: { ...diagnostics.reactions, actionClicked: false },
    }),
    false,
  );
  assert.equal(
    productExtensionDiagnosticsReady({
      ...diagnostics,
      threadColors: {
        ...diagnostics.threadColors,
        stored: {
          ...diagnostics.threadColors.stored,
          selection: { type: "preset", id: "purple" },
        },
      },
    }),
    false,
  );
});

test("real product diagnostics require actual owners and both sidebar layouts", () => {
  const diagnostics = completeProductExtensionRealUiDiagnostics();
  assert.equal(productExtensionRealUiDiagnosticsReady(diagnostics), true);
  assert.equal(
    productExtensionRealUiDiagnosticsReady({
      ...diagnostics,
      realDom: false,
    }),
    false,
  );
  assert.equal(
    productExtensionRealUiDiagnosticsReady({
      ...diagnostics,
      thread: {
        ...diagnostics.thread,
        threadId: "chatgptx-product-extension-probe",
      },
    }),
    false,
  );
  assert.equal(
    productExtensionRealUiDiagnosticsReady({
      ...diagnostics,
      threadColors: {
        ...diagnostics.threadColors,
        activity: {
          ...diagnostics.threadColors.activity,
          indicatorFillsRow: false,
        },
      },
    }),
    false,
  );
  assert.equal(
    productExtensionRealUiDiagnosticsReady({
      ...diagnostics,
      threadColors: {
        ...diagnostics.threadColors,
        remoteCodex: {
          ...diagnostics.threadColors.remoteCodex,
          ownerMatched: false,
        },
      },
    }),
    false,
  );
  assert.equal(
    productExtensionRealUiDiagnosticsReady({
      ...diagnostics,
      threadColors: {
        ...diagnostics.threadColors,
        header: {
          ...diagnostics.threadColors.header,
          titleFound: false,
        },
      },
    }),
    true,
  );
  assert.equal(
    productExtensionRealUiDiagnosticsReady({
      ...diagnostics,
      settings: { ...diagnostics.settings, globalErrorAbsent: false },
    }),
    false,
  );
});

test("real product diagnostic redaction preserves the raw validation result", () => {
  const diagnostics = completeProductExtensionRealUiDiagnostics();
  const safe = sanitizeProductExtensionRealUiDiagnostics(diagnostics);
  assert.equal(safe.validationPassed, true);
  assert.equal(safe.rendererDocumentId, "document:test-renderer");
  assert.equal(safe.thread.hostId, "redacted-host");
  assert.equal(safe.thread.threadId, "redacted-thread");
  assert.equal(safe.thread.title, "redacted-title");
  assert.equal(safe.reactions.selectedText, "redacted-selection");

  const invalid = sanitizeProductExtensionRealUiDiagnostics({
    ...diagnostics,
    threadColors: {
      ...diagnostics.threadColors,
      stored: {
        ...diagnostics.threadColors.stored,
        thread: {
          ...diagnostics.threadColors.stored.thread,
          hostId: "different-host",
        },
      },
    },
  });
  assert.equal(invalid.validationPassed, false);
  assert.equal(invalid.thread.hostId, invalid.threadColors.stored.thread.hostId);

  const privateValue = "PrivateThreadTitle123";
  const privateDiagnostics = completeProductExtensionRealUiDiagnostics();
  privateDiagnostics.thread.hostId = privateValue;
  privateDiagnostics.thread.threadId = privateValue;
  privateDiagnostics.thread.title = privateValue;
  privateDiagnostics.threadColors.stored.thread.hostId = privateValue;
  privateDiagnostics.threadColors.stored.thread.threadId = privateValue;
  privateDiagnostics.reactions.selectedText = privateValue;
  privateDiagnostics.reactions.persisted.selectedText = privateValue;
  const privateSafe = sanitizeProductExtensionRealUiDiagnostics(privateDiagnostics);
  assert.equal(privateSafe.validationPassed, true);
  assert.doesNotMatch(JSON.stringify(privateSafe), new RegExp(privateValue));
});

test("real product UI failure diagnostics keep their renderer document", () => {
  assert.deepEqual(
    productExtensionRealUiFailureDiagnostics(
      "document:real-ui-failure",
      new TypeError("private failure detail"),
    ),
    {
      rendererDocumentId: "document:real-ui-failure",
      validationPassed: false,
      errorName: "TypeError",
    },
  );
});

test("one primary renderer document owns the full live-probe suite", () => {
  const claim = createPrimaryDocumentClaim();
  assert.equal(claim.claim("auxiliary-document", false), false);
  assert.equal(claim.current(), undefined);
  assert.equal(claim.claim("document-a", true), true);
  assert.equal(claim.claim("document-a", true), true);
  assert.equal(claim.claim("document-b", true), false);
  assert.equal(claim.current(), "document-a");
  assert.equal(claim.release("document-b"), false);
  assert.equal(claim.release("document-a"), true);
  assert.equal(claim.current(), undefined);
  assert.equal(claim.claim("document-b", true), true);
});

test("rich-content unmount requests select one renderer document", () => {
  assert.equal(
    richContentUnmountRequested("document:a\n", "document:a"),
    true,
  );
  assert.equal(
    richContentUnmountRequested("document:a\n", "document:b"),
    false,
  );
  assert.equal(
    richContentUnmountRequested("unmount\n", "document:a"),
    false,
  );
});

test("primary app shell selection delegates to the exact binding, not page text", () => {
  const expression = primaryAppShellReadyExpression();
  const evaluate = (host) =>
    Function("window", `return ${expression}`)({ __CGPTX_HOST__: host });

  assert.equal(evaluate(undefined), false);
  assert.equal(evaluate({ _debug: {} }), false);
  assert.equal(evaluate({ _debug: { primaryAppShellReady: () => false } }), false);
  assert.equal(evaluate({ _debug: { primaryAppShellReady: () => true } }), true);
  assert.doesNotMatch(expression, /New chat/);

  const claim = createPrimaryDocumentClaim();
  assert.equal(claim.claim("early-auxiliary", evaluate(undefined)), false);
  assert.equal(
    claim.claim(
      "primary",
      evaluate({ _debug: { primaryAppShellReady: () => true } }),
    ),
    true,
  );
  assert.equal(claim.release("primary"), true);
  assert.equal(
    claim.claim(
      "replacement",
      evaluate({ _debug: { primaryAppShellReady: () => true } }),
    ),
    true,
  );
});

test("primary app shell diagnostics expose only fixed readiness facts", () => {
  const expression = primaryAppShellDiagnosticsExpression();
  const focus = { isConnected: true };
  const root = {
    isConnected: true,
    querySelector: (selector) =>
      selector === '[data-app-shell-focus-area="main"]' ? focus : null,
  };
  const buttons = [
    { textContent: "Update ChatGPT" },
    { textContent: "Try again" },
  ];
  const body = { children: [{}, {}, {}] };
  Object.defineProperties(body, {
    textContent: {
      get: () => {
        throw new Error("diagnostics read all body textContent");
      },
    },
    innerText: {
      get: () => {
        throw new Error("diagnostics read all body innerText");
      },
    },
  });
  const document = {
    readyState: "complete",
    body,
    querySelector: (selector) =>
      selector === "main[data-app-shell-main-surface]" ? root : null,
    querySelectorAll: (selector) =>
      selector === "button" ? buttons : selector === "main" ? [root] : [],
  };
  const value = Function(
    "document",
    "location",
    `return ${expression}`,
  )(document, { protocol: "app:" });
  assert.deepEqual(value, {
    appProtocol: true,
    documentComplete: true,
    bodyPresent: true,
    bodyChildren: 3,
    mainElements: 1,
    primaryRootFound: true,
    mainFocusFound: true,
    genericErrorVisible: false,
    updateActionVisible: true,
    retryActionVisible: true,
  });
  assert.doesNotMatch(JSON.stringify(value), /Private title|private account/);

  document.querySelector = () => null;
  document.querySelectorAll = (selector) =>
    selector === "button" ? buttons : [];
  const errorValue = Function(
    "document",
    "location",
    `return ${expression}`,
  )(document, { protocol: "app:" });
  assert.equal(errorValue.primaryRootFound, false);
  assert.equal(errorValue.genericErrorVisible, true);
});

test("native binding failure diagnostics use only fixed app-shell facts", () => {
  const expression = nativeBindingFailureDiagnosticsExpression();
  const focus = { isConnected: true };
  const root = {
    isConnected: true,
    querySelector: (selector) =>
      selector === '[data-app-shell-focus-area="main"]' ? focus : null,
  };
  const body = { children: Array.from({ length: 150 }, () => ({})) };
  body.querySelectorAll = () => {
    throw new Error("diagnostics used a wildcard full-document scan");
  };
  Object.defineProperties(body, {
    textContent: {
      get: () => {
        throw new Error("diagnostics read all body textContent");
      },
    },
    innerText: {
      get: () => {
        throw new Error("diagnostics read all body innerText");
      },
    },
  });
  const document = {
    body,
    readyState: "interactive",
    querySelector: (selector) =>
      selector === 'main[data-app-shell-main-surface="default"]' ? root : null,
    getElementsByTagName: (tagName) => (tagName === "main" ? [root] : []),
  };

  const value = Function("document", `return ${expression}`)(document);

  assert.deepEqual(value, {
    readyState: "interactive",
    bodyChildren: 150,
    mainElements: 1,
    primaryRootFound: true,
    mainFocusFound: true,
  });
  assert.doesNotMatch(expression, /querySelectorAll\s*\(\s*["']\*["']\s*\)/);
  assert.doesNotMatch(expression, /Object\.(?:keys|entries)\s*\(/);
  assert.doesNotMatch(expression, /(?:innerText|body\?\.textContent)/);
});

test("primary app shell readiness stops when its renderer document is replaced", async () => {
  let current = true;
  let clock = 0;
  let waits = 0;
  const ready = await waitForPrimaryUiReadiness({
    evaluate: () => new Promise(() => {}),
    isCurrent: () => current,
    wait: async (milliseconds) => {
      waits += 1;
      clock += milliseconds;
      current = false;
    },
    now: () => clock,
  });
  assert.equal(ready, false);
  assert.equal(waits, 1);
});

test("primary app shell readiness bounds a pending renderer evaluation", async () => {
  let clock = 0;
  let waits = 0;
  const ready = await waitForPrimaryUiReadiness({
    evaluate: () => new Promise(() => {}),
    isCurrent: () => true,
    wait: async (milliseconds) => {
      waits += 1;
      clock += milliseconds;
    },
    now: () => clock,
    timeoutMilliseconds: 100,
    pollMilliseconds: 25,
  });
  assert.equal(ready, false);
  assert.equal(clock, 100);
  assert.equal(waits, 4);
});

test("primary app shell readiness retries a settled false result", async () => {
  let clock = 0;
  let evaluations = 0;
  const ready = await waitForPrimaryUiReadiness({
    evaluate: async () => ++evaluations === 2,
    isCurrent: () => true,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
    now: () => clock,
  });
  assert.equal(ready, true);
  assert.equal(evaluations, 2);
});

test("a replaced renderer document cannot write probe diagnostics", () => {
  let currentDocumentId = "document-a";
  let destroyed = false;
  let writes = 0;
  const contents = {
    isDestroyed: () => destroyed,
  };
  const lifecycle = {
    isCurrent: (candidate, documentId) =>
      candidate === contents && documentId === currentDocumentId,
  };
  const documentA = { id: "document-a" };
  const documentB = { id: "document-b" };

  assert.equal(
    isCurrentRendererDocument(lifecycle, contents, documentA),
    true,
  );
  writeCurrentRendererDocumentDiagnostics(
    lifecycle,
    contents,
    documentA,
    () => {
      writes += 1;
    },
  );
  assert.equal(writes, 1);

  currentDocumentId = "document-b";
  assert.equal(
    isCurrentRendererDocument(lifecycle, contents, documentA),
    false,
  );
  assert.throws(
    () =>
      writeCurrentRendererDocumentDiagnostics(
        lifecycle,
        contents,
        documentA,
        () => {
          writes += 1;
        },
      ),
    /renderer document is no longer current/,
  );
  assert.equal(writes, 1);
  writeCurrentRendererDocumentDiagnostics(
    lifecycle,
    contents,
    documentB,
    () => {
      writes += 1;
    },
  );
  assert.equal(writes, 2);

  currentDocumentId = "document-a";
  destroyed = true;
  assert.throws(
    () =>
      writeCurrentRendererDocumentDiagnostics(
        lifecycle,
        contents,
        documentA,
        () => {
          writes += 1;
        },
      ),
    /renderer document is no longer current/,
  );
  assert.equal(writes, 2);
});

test("probe completion distinguishes continuation, abort, and recorded failure", () => {
  assert.equal(probeCompletionDisposition(true, true, false), "continue");
  assert.equal(probeCompletionDisposition(true, false, false), "aborted");
  assert.equal(probeCompletionDisposition(false, false, false), "aborted");
  assert.equal(
    probeCompletionDisposition(false, true, true),
    "failed-recorded",
  );
  assert.equal(
    probeCompletionDisposition(false, true, false),
    "failed-unrecorded",
  );
  assert.throws(
    () => probeCompletionDisposition(false, true, "private failure"),
    /completion state must use booleans/,
  );
});

test("UI surface event logs are isolated by renderer document", () => {
  assert.equal(
    uiSurfaceProbeEventFile("document:renderer/one"),
    "events-document_renderer_one.json",
  );
  assert.notEqual(
    uiSurfaceProbeEventFile("document:renderer-one"),
    uiSurfaceProbeEventFile("document:renderer-two"),
  );
  assert.throws(() => uiSurfaceProbeEventFile(""), /document ID is required/);
});

test("rich-message event logs are isolated by renderer document", () => {
  assert.equal(
    richMessageProbeEventFile("document:renderer/one"),
    "document%3Arenderer%2Fone.json",
  );
  assert.notEqual(
    richMessageProbeEventFile("document:renderer-one"),
    richMessageProbeEventFile("document:renderer-two"),
  );
  assert.throws(
    () => richMessageProbeEventFile(""),
    /document ID is required/,
  );
});

test("rich-content probe waits for eight surface variants and fallback registrations", () => {
  const ready = {
    assistantDirective: 2,
    assistantContentReference: 2,
    assistantCodeBlock: 2,
    conversationItem: 3,
  };
  assert.equal(richContentRegistrationsReady(ready), true);
  for (const key of Object.keys(ready)) {
    assert.equal(
      richContentRegistrationsReady({ ...ready, [key]: 0 }),
      false,
      key,
    );
  }
  assert.equal(richContentRegistrationsReady(null), false);
});

test("rich-content probe requires each exact owner and both markdown paths", () => {
  const diagnostics = {
    drift: false,
    fallbacks: completeRichFallbacks(),
    hits: {
      assistantDirective: 1,
      assistantContentReference: 1,
      assistantMarkdown: 2,
      assistantCodeBlock: 1,
      localConversationItem: 1,
      cloudConversationItem: 1,
    },
    cloudOwnerReady: true,
  };
  assert.equal(richContentOwnersReady(diagnostics), true);
  for (const key of Object.keys(diagnostics.hits)) {
    assert.equal(
      richContentOwnersReady({
        ...diagnostics,
        hits: { ...diagnostics.hits, [key]: 0 },
      }),
      false,
      key,
    );
  }
  assert.equal(
    richContentOwnersReady({ ...diagnostics, drift: true }),
    false,
  );
});

test("rich-content probe requires all first-party fallback paths", () => {
  const fallbacks = completeRichFallbacks();
  assert.equal(richContentFallbacksReady(fallbacks), true);
  for (const surface of Object.keys(fallbacks)) {
    for (const outcome of Object.keys(fallbacks[surface])) {
      assert.equal(
        richContentFallbacksReady({
          ...fallbacks,
          [surface]: {
            ...fallbacks[surface],
            [outcome]: { attempts: 1, connected: false },
          },
        }),
        false,
        `${surface}.${outcome}`,
      );
    }
  }
  assert.equal(richContentFallbacksReady(null), false);
});

test("rich-content probe requires semantic remount and activation for eight surface variants", () => {
  const interactions = {
    directive: {
      initialLabel: "Rich probe directive 0",
      finalLabel: "Rich probe directive 1",
      found: true,
      invalidateFound: true,
      invalidateClicked: true,
      replaced: true,
      oldDisconnected: true,
      otherOwnersReady: true,
      clicked: true,
      changed: true,
    },
    directiveContainer: {
      initialLabel: "Rich probe container directive 0",
      finalLabel: "Rich probe container directive 1",
      found: true,
      invalidateFound: true,
      invalidateClicked: true,
      replaced: true,
      oldDisconnected: true,
      otherOwnersReady: true,
      clicked: true,
      changed: true,
    },
    contentReference: {
      initialLabel: "Rich probe content reference 0",
      finalLabel: "Rich probe content reference 1",
      found: true,
      invalidateFound: true,
      invalidateClicked: true,
      replaced: true,
      oldDisconnected: true,
      otherOwnersReady: true,
      clicked: true,
      changed: true,
    },
    codeBlock: {
      initialLabel: "Rich probe code block 0",
      finalLabel: "Rich probe code block 1",
      found: true,
      invalidateFound: true,
      invalidateClicked: true,
      replaced: true,
      oldDisconnected: true,
      otherOwnersReady: true,
      clicked: true,
      changed: true,
    },
    streamingCodeBlock: {
      initialLabel: "Rich probe streaming code block 0",
      finalLabel: "Rich probe streaming code block 1",
      found: true,
      invalidateFound: true,
      invalidateClicked: true,
      replaced: true,
      oldDisconnected: true,
      otherOwnersReady: true,
      clicked: true,
      changed: true,
    },
    conversationItem: {
      initialLabel: "Rich probe conversation item 0",
      finalLabel: "Rich probe conversation item 1",
      found: true,
      invalidateFound: true,
      invalidateClicked: true,
      replaced: true,
      oldDisconnected: true,
      otherOwnersReady: true,
      clicked: true,
      changed: true,
    },
    groupedConversationItem: {
      initialLabel: "Rich probe grouped conversation item 0",
      finalLabel: "Rich probe grouped conversation item 1",
      found: true,
      invalidateFound: true,
      invalidateClicked: true,
      replaced: true,
      oldDisconnected: true,
      otherOwnersReady: true,
      clicked: true,
      changed: true,
    },
    cloudConversationItem: {
      initialLabel: "Rich probe cloud conversation item 0",
      finalLabel: "Rich probe cloud conversation item 1",
      found: true,
      invalidateFound: true,
      invalidateClicked: true,
      replaced: true,
      oldDisconnected: true,
      otherOwnersReady: true,
      clicked: true,
      changed: true,
    },
  };
  assert.equal(richContentInteractionsReady(interactions), true);
  for (const key of Object.keys(interactions)) {
    for (const field of [
      "found",
      "invalidateFound",
      "invalidateClicked",
      "replaced",
      "oldDisconnected",
      "otherOwnersReady",
      "clicked",
      "changed",
    ]) {
      assert.equal(
        richContentInteractionsReady({
          ...interactions,
          [key]: { ...interactions[key], [field]: false },
        }),
        false,
        `${key}.${field}`,
      );
    }
  }
});

test("UI-surface actions require semantic state after React replaces a node", () => {
  const replacedWithoutChange = {
    kind: "action",
    found: true,
    clicked: true,
    oldDisconnected: true,
    replaced: true,
    changed: false,
  };
  assert.equal(uiSurfaceInteractionReady(replacedWithoutChange), false);
  assert.equal(
    uiSurfaceInteractionReady({
      ...replacedWithoutChange,
      oldDisconnected: false,
      replaced: false,
      changed: true,
    }),
    true,
  );
  assert.equal(
    uiSurfaceInteractionReady({
      kind: "dismiss",
      found: true,
      clicked: true,
      oldDisconnected: true,
      removed: false,
    }),
    false,
  );
  assert.equal(
    uiSurfaceInteractionReady({
      kind: "dismiss",
      found: true,
      clicked: true,
      removed: true,
    }),
    true,
  );
});

function runRichContentInteractionScript({
  changeOtherLabel = false,
  currentIndex = 0,
  initialOtherLabel,
  otherMutation,
} = {}) {
  const target = {
    key: "target",
    surface: "target",
    initial: "Target 0",
    final: "Target 1",
  };
  const other = {
    key: "other",
    surface: "other",
    initial: "Other 0",
    final: "Other 1",
  };
  const specifications = (currentIndex === 0
    ? [target, other]
    : [other, target]
  ).map((specification, index) => ({ ...specification, index }));
  const elements = new Map();
  class FakeElement {
    constructor(label, onClick = () => {}) {
      this.isConnected = true;
      this.label = label;
      this.onClick = onClick;
    }

    click() {
      this.onClick(this);
    }

    getAttribute(name) {
      return name === "aria-label" ? this.label : null;
    }
  }
  const replace = (surface, label, onInvalidate = () => {}) => {
    for (const control of ["action", "invalidate"]) {
      for (const element of elements.get(`${surface}:${control}`) ?? []) {
        element.isConnected = false;
      }
    }
    const action = new FakeElement(label, (element) => {
      if (surface === "target") element.label = "Target 1";
    });
    const invalidate = new FakeElement(null, onInvalidate);
    elements.set(`${surface}:action`, [action]);
    elements.set(`${surface}:invalidate`, [invalidate]);
  };
  const replaceAll = (afterInvalidation = false) => {
    const expectedOtherLabel = currentIndex === 0 ? "Other 0" : "Other 1";
    replace(
      "other",
      afterInvalidation && changeOtherLabel
        ? "Other changed"
        : initialOtherLabel ?? expectedOtherLabel,
    );
    if (afterInvalidation && otherMutation === "missing") {
      elements.set("other:invalidate", []);
    }
    if (afterInvalidation && otherMutation === "duplicate") {
      elements.get("other:action")?.push(new FakeElement("Other 0"));
    }
    replace("target", "Target 0", () => replaceAll(true));
  };
  replaceAll();
  const document = {
    querySelectorAll(selector) {
      const match = /data-rich-probe-surface="([^"]+)".*data-rich-probe-control="([^"]+)"/.exec(
        selector,
      );
      return match ? elements.get(`${match[1]}:${match[2]}`) ?? [] : [];
    },
  };
  let now = 0;
  const FakeDate = { now: () => now };
  const setTimeout = (callback) => {
    now += 10_001;
    callback();
  };
  const evaluate = new Function(
    "document",
    "HTMLElement",
    "Date",
    "setTimeout",
    `return ${richContentInteractionScript(
      specifications[currentIndex],
      specifications,
    )}`,
  );
  return evaluate(document, FakeElement, FakeDate, setTimeout);
}

test("rich-content interaction accepts semantic owners after a parent remount", async () => {
  const interaction = await runRichContentInteractionScript();
  assert.deepEqual(interaction, {
    initialLabel: "Target 0",
    finalLabel: "Target 1",
    found: true,
    invalidateFound: true,
    invalidateClicked: true,
    replaced: true,
    oldDisconnected: true,
    otherOwnersReady: true,
    clicked: true,
    changed: true,
  });
});

test("rich-content interaction rejects a changed unrelated owner", async () => {
  const interaction = await runRichContentInteractionScript({
    changeOtherLabel: true,
  });
  assert.equal(interaction.oldDisconnected, true);
  assert.equal(interaction.replaced, true);
  assert.equal(interaction.otherOwnersReady, false);
  assert.equal(interaction.clicked, false);
  assert.equal(interaction.changed, false);
});

test("rich-content interaction rejects a prior owner that regressed before the next action", async () => {
  const interaction = await runRichContentInteractionScript({
    currentIndex: 1,
    initialOtherLabel: "BROKEN",
  });
  assert.equal(interaction.found, false);
  assert.equal(interaction.otherOwnersReady, false);
  assert.equal(interaction.clicked, false);
  assert.equal(interaction.changed, false);
});

for (const otherMutation of ["missing", "duplicate"]) {
  test(`rich-content interaction rejects a ${otherMutation} unrelated control`, async () => {
    const interaction = await runRichContentInteractionScript({ otherMutation });
    assert.equal(interaction.oldDisconnected, true);
    assert.equal(interaction.replaced, true);
    assert.equal(interaction.otherOwnersReady, false);
    assert.equal(interaction.clicked, false);
    assert.equal(interaction.changed, false);
  });
}

test("unmount diagnostics keep the mounted proof after the probe disappears", () => {
  const mounted = {
    fallbacks: completeRichFallbacks(),
    interactions: { directive: { changed: true } },
  };
  const postUnmount = {
    fallbacks: completeRichFallbacks(false),
  };
  const diagnostics = richContentUnmountDiagnostics(
    mounted,
    true,
    postUnmount,
  );
  assert.deepEqual(diagnostics.fallbacks, mounted.fallbacks);
  assert.equal(diagnostics.unmounted, true);
  assert.equal(diagnostics.postUnmount, postUnmount);
});

test("rich-content final unmount requires balanced lifecycle counts", () => {
  const balanced = {
    lifecycle: {
      mounts: {
        assistantDirective: 3,
        assistantContentReference: 2,
        assistantCodeBlock: 4,
        conversationItem: 5,
      },
      disposals: {
        assistantDirective: 3,
        assistantContentReference: 2,
        assistantCodeBlock: 4,
        conversationItem: 5,
      },
    },
  };
  assert.equal(richContentFullyUnmounted(balanced), true);
  assert.equal(richContentFullyUnmounted({}), false);
  assert.equal(
    richContentFullyUnmounted({
      ...balanced,
      lifecycle: {
        ...balanced.lifecycle,
        disposals: {
          ...balanced.lifecycle.disposals,
          assistantCodeBlock: 3,
        },
      },
    }),
    false,
  );
  assert.equal(
    richContentFullyUnmounted({
      ...balanced,
      lifecycle: {
        ...balanced.lifecycle,
        mounts: {
          ...balanced.lifecycle.mounts,
          conversationItem: 6,
        },
      },
    }),
    false,
  );
});

test("renderer binding readiness uses a safely quoted selected app version", () => {
  const version = "26.900.1' || true || '";
  const expression = rendererHostReadyExpression(version);
  assert.match(expression, /__CGPTX_HOST__/);
  assert.doesNotMatch(expression, /=== '26/);
  const evaluate = new Function("window", `return ${expression};`);
  assert.equal(evaluate({ __CGPTX_HOST__: { version } }), true);
  assert.equal(evaluate({ __CGPTX_HOST__: { version: "26.900.1" } }), false);
});

class FakeContents extends EventEmitter {
  constructor(id, url, loading = false) {
    super();
    this.id = id;
    this.url = url;
    this.loading = loading;
    this.destroyed = false;
  }

  getURL() {
    return this.url;
  }

  isDestroyed() {
    return this.destroyed;
  }

  isLoadingMainFrame() {
    return this.loading;
  }
}

function harness(isEligible = (url) => url.startsWith("app:")) {
  let sequence = 0;
  const injected = [];
  const connected = [];
  const disconnected = [];
  const errors = [];
  const lifecycle = createRendererLifecycle({
    createDocumentId: () => `document-${++sequence}`,
    windowId: (contents) => `window-${contents.id}`,
    isEligible,
    inject(contents, document) {
      injected.push({ contents, document });
    },
    connect(document) {
      connected.push(document);
    },
    disconnect(documentId, reason) {
      disconnected.push({ documentId, reason });
    },
    onError(phase, contents, error) {
      errors.push({ phase, contents, error });
    },
  });
  return { connected, disconnected, errors, injected, lifecycle };
}

test("renderer eligibility receives the exact web contents identity", () => {
  const primary = new FakeContents(20, "app://chatgpt.com/");
  const auxiliary = new FakeContents(21, "app://chatgpt.com/");
  const state = harness(
    (url, contents) => url.startsWith("app:") && contents === primary,
  );

  state.lifecycle.attach(primary);
  state.lifecycle.attach(auxiliary);

  assert.deepEqual(
    state.injected.map(({ contents }) => contents.id),
    [primary.id],
  );
  assert.deepEqual(
    state.connected.map(({ webContentsId }) => webContentsId),
    [primary.id],
  );
  assert.deepEqual(state.errors, []);
});

test("renderer attachment does not wait for main activation", async () => {
  const first = new FakeContents(1, "app://chatgpt.com/");
  const attached = [];
  const listeners = new Map();
  let finishActivation;
  const activationWait = new Promise((resolve) => {
    finishActivation = resolve;
  });
  const order = [];
  const lifecycle = {
    attach(contents) {
      order.push(`attach:${contents.id}`);
      attached.push(contents);
    },
  };

  const activation = startRendererLifecycle({
    app: {
      on(event, listener) {
        listeners.set(event, listener);
      },
    },
    webContents: { getAllWebContents: () => [first] },
    lifecycle,
    activateMain: () => {
      order.push("activate-main");
      return activationWait;
    },
    onActivated() {},
    onActivationError(error) {
      throw error;
    },
  });

  assert.deepEqual(attached, [first]);
  assert.deepEqual(order, ["activate-main", "attach:1"]);
  const second = new FakeContents(2, "app://chatgpt.com/codex");
  listeners.get("web-contents-created")({}, second);
  assert.deepEqual(attached, [first, second]);

  finishActivation(["active"]);
  assert.deepEqual(await activation, ["active"]);
});

test("attaching an already loaded app document injects and connects it", () => {
  const state = harness();
  const contents = new FakeContents(3, "app://chatgpt.com/codex", false);

  state.lifecycle.attach(contents);

  assert.equal(state.injected.length, 1);
  assert.equal(state.connected.length, 1);
  assert.equal(state.injected[0].document.id, state.connected[0].id);
  assert.equal(state.connected[0].webContentsId, contents.id);
  assert.deepEqual(state.errors, []);
});

test("full navigations get unique document ids and ineligible pages disconnect", () => {
  const state = harness();
  const contents = new FakeContents(4, "app://chatgpt.com/");
  state.lifecycle.attach(contents);
  const first = state.connected[0];

  contents.loading = true;
  contents.emit("did-start-navigation", {
    url: "app://chatgpt.com/codex",
    isMainFrame: true,
    isSameDocument: false,
  });
  assert.deepEqual(state.disconnected, [
    { documentId: first.id, reason: "main-frame-navigation" },
  ]);

  contents.url = "app://chatgpt.com/codex";
  contents.loading = false;
  contents.emit("dom-ready");
  const second = state.connected[1];
  assert.notEqual(second.id, first.id);
  assert.throws(
    () => requireCurrentRendererDocument(state.lifecycle, contents, first.id),
    /renderer document is no longer current/,
  );
  assert.equal(
    requireCurrentRendererDocument(state.lifecycle, contents, second.id),
    second,
  );
  assert.equal(state.lifecycle.contentsForDocument(first.id), undefined);
  assert.equal(state.lifecycle.contentsForDocument(second.id), contents);

  contents.emit(
    "did-start-navigation",
    {},
    "https://example.com/",
    false,
    true,
  );
  contents.url = "https://example.com/";
  contents.emit("dom-ready");
  contents.emit("dom-ready");

  assert.deepEqual(state.disconnected.at(-1), {
    documentId: second.id,
    reason: "main-frame-navigation",
  });
  assert.equal(state.connected.length, 2);
  assert.equal(state.injected.length, 2);
  assert.equal(state.lifecycle.contentsForDocument(second.id), undefined);
  assert.deepEqual(state.errors, []);
});

test("same-document navigation keeps the active renderer document", () => {
  const state = harness();
  const contents = new FakeContents(6, "app://chatgpt.com/codex");
  state.lifecycle.attach(contents);
  const document = state.connected[0];

  contents.emit("did-start-navigation", {
    url: "app://chatgpt.com/codex#settings",
    isMainFrame: true,
    isSameDocument: true,
  });
  contents.url = "app://chatgpt.com/codex#settings";
  contents.emit("did-navigate-in-page");

  assert.deepEqual(state.disconnected, []);
  assert.equal(state.connected.length, 1);
  assert.equal(state.injected.length, 1);
  assert.equal(
    state.lifecycle.currentDocumentFor(contents, document.id),
    document,
  );
});

test("the preload pagehide notice disconnects only its current document", () => {
  const state = harness();
  const contents = new FakeContents(5, "app://chatgpt.com/");
  state.lifecycle.attach(contents);
  const document = state.connected[0];

  assert.equal(state.lifecycle.pageHidden(contents, "other-document"), false);
  assert.equal(state.lifecycle.pageHidden(contents, document.id), true);
  assert.equal(state.lifecycle.isCurrent(contents, document.id), false);
  assert.equal(state.lifecycle.contentsForDocument(document.id), undefined);
  assert.equal(state.lifecycle.pageHidden(contents, document.id), false);
  contents.emit("dom-ready");
  assert.deepEqual(state.disconnected, [
    { documentId: document.id, reason: "pagehide" },
  ]);
  assert.equal(state.connected.length, 1);
});

test("a runtime request accepts its current renderer document", () => {
  const state = harness();
  const contents = new FakeContents(7, "app://chatgpt.com/");
  state.lifecycle.attach(contents);
  const document = state.connected[0];

  assert.equal(
    requireCurrentRendererDocument(state.lifecycle, contents, document.id),
    document,
  );
  assert.throws(
    () => requireCurrentRendererDocument(state.lifecycle, contents, ""),
    /document ID is required/,
  );
  assert.throws(
    () =>
      requireCurrentRendererDocument(
        state.lifecycle,
        contents,
        "other-document",
      ),
    /renderer document is no longer current/,
  );
});

test("a runtime request rejects its renderer document after pagehide", () => {
  const state = harness();
  const contents = new FakeContents(8, "app://chatgpt.com/");
  state.lifecycle.attach(contents);
  const document = state.connected[0];

  assert.equal(state.lifecycle.pageHidden(contents, document.id), true);
  assert.throws(
    () =>
      requireCurrentRendererDocument(
        state.lifecycle,
        contents,
        document.id,
      ),
    /renderer document is no longer current/,
  );
});
