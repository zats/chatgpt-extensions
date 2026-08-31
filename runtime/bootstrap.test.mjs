import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import bootstrap from "./bootstrap.cjs";

const {
  createSingleDocumentClaim,
  createRendererLifecycle,
  productExtensionDiagnosticsReady,
  productExtensionRealUiDiagnosticsReady,
  rendererHostReadyExpression,
  richContentFallbacksReady,
  richContentInteractionsReady,
  richContentOwnersReady,
  richContentRegistrationsReady,
  richContentUnmountDiagnostics,
  richMessageProbeEventFile,
  startRendererLifecycle,
  uiSurfaceProbeEventFile,
} = bootstrap;

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
    realDom: true,
    thread: {
      scope: "execution",
      hostId: "local",
      threadId: "real-thread",
      title: "Real thread",
      signedInHeaderTitleFound: true,
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
      cloud: {
        scope: "cloud",
        menuActionFound: true,
        menuActionClicked: true,
        ownerMatched: true,
        layout: { ...layout, row: { height: 36 } },
        stored: {
          scope: "cloud",
          selection: { type: "preset", id: "blue" },
        },
      },
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
        cloud: {
          ...diagnostics.threadColors.cloud,
          ownerMatched: false,
        },
      },
    }),
    false,
  );
  assert.equal(
    productExtensionRealUiDiagnosticsReady({
      ...diagnostics,
      settings: { ...diagnostics.settings, globalErrorAbsent: false },
    }),
    false,
  );
});

test("one renderer document owns the rich-content probe at a time", () => {
  const claim = createSingleDocumentClaim();
  assert.equal(claim.claim("document-a"), true);
  assert.equal(claim.claim("document-a"), true);
  assert.equal(claim.claim("document-b"), false);
  assert.equal(claim.current(), "document-a");
  assert.equal(claim.release("document-b"), false);
  assert.equal(claim.release("document-a"), true);
  assert.equal(claim.current(), undefined);
  assert.equal(claim.claim("document-b"), true);
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

test("rich-content probe requires isolated remount and activation for eight surface variants", () => {
  const interactions = {
    directive: {
      initialLabel: "Rich probe directive 0",
      finalLabel: "Rich probe directive 1",
      found: true,
      invalidateFound: true,
      invalidateClicked: true,
      replaced: true,
      oldDisconnected: true,
      otherOwnersStable: true,
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
      otherOwnersStable: true,
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
      otherOwnersStable: true,
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
      otherOwnersStable: true,
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
      otherOwnersStable: true,
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
      otherOwnersStable: true,
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
      otherOwnersStable: true,
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
      otherOwnersStable: true,
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
      "otherOwnersStable",
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

function harness() {
  let sequence = 0;
  const injected = [];
  const connected = [];
  const disconnected = [];
  const errors = [];
  const lifecycle = createRendererLifecycle({
    createDocumentId: () => `document-${++sequence}`,
    windowId: (contents) => `window-${contents.id}`,
    isEligible: (url) => url.startsWith("app:"),
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
  assert.equal(state.lifecycle.documentFor(contents, contents.url).id, document.id);
});

test("the preload pagehide notice disconnects only its current document", () => {
  const state = harness();
  const contents = new FakeContents(5, "app://chatgpt.com/");
  state.lifecycle.attach(contents);
  const document = state.connected[0];

  assert.equal(state.lifecycle.pageHidden(contents, "other-document"), false);
  assert.equal(state.lifecycle.pageHidden(contents, document.id), true);
  assert.equal(state.lifecycle.pageHidden(contents, document.id), false);
  contents.emit("dom-ready");
  assert.deepEqual(state.disconnected, [
    { documentId: document.id, reason: "pagehide" },
  ]);
  assert.equal(state.connected.length, 1);
});
