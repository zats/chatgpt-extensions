/**
 * ChatGPTX v5 runtime bootstrap.
 *
 * ChatGPT loads this file through NODE_OPTIONS=--require. It is a strict no-op
 * in every process except the ChatGPT Electron main process.
 */
"use strict";

const richContentRegistrationMinimums = Object.freeze({
  assistantDirective: 2,
  assistantContentReference: 2,
  assistantCodeBlock: 2,
  conversationItem: 3,
});

const richContentMatcherFallbackSurfaces = Object.freeze([
  "assistantContentReference",
  "assistantCodeBlock",
  "conversationItemLocal",
  "conversationItemCloud",
]);

const richContentOwnerMinimums = Object.freeze({
  assistantDirective: 1,
  assistantContentReference: 1,
  assistantMarkdown: 2,
  assistantCodeBlock: 1,
  localConversationItem: 1,
  cloudConversationItem: 1,
});

const richContentLifecycleKinds = Object.freeze([
  "assistantDirective",
  "assistantContentReference",
  "assistantCodeBlock",
  "conversationItem",
]);

const safeDiagnosticErrorNames = new Set([
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

const realUiDiagnosticRedactions = Object.freeze({
  hostId: "redacted-host",
  selectedText: "redacted-selection",
  threadId: "redacted-thread",
  title: "redacted-title",
});

const richContentInteractionLabels = Object.freeze({
  directive: Object.freeze({
    surface: "directive",
    initial: "Rich probe directive 0",
    final: "Rich probe directive 1",
  }),
  directiveContainer: Object.freeze({
    surface: "directive-container",
    initial: "Rich probe container directive 0",
    final: "Rich probe container directive 1",
  }),
  contentReference: Object.freeze({
    surface: "content-reference",
    initial: "Rich probe content reference 0",
    final: "Rich probe content reference 1",
  }),
  codeBlock: Object.freeze({
    surface: "code-block",
    initial: "Rich probe code block 0",
    final: "Rich probe code block 1",
  }),
  streamingCodeBlock: Object.freeze({
    surface: "code-block-streaming",
    initial: "Rich probe streaming code block 0",
    final: "Rich probe streaming code block 1",
  }),
  conversationItem: Object.freeze({
    surface: "conversation-item",
    initial: "Rich probe conversation item 0",
    final: "Rich probe conversation item 1",
  }),
  groupedConversationItem: Object.freeze({
    surface: "conversation-item-grouped",
    initial: "Rich probe grouped conversation item 0",
    final: "Rich probe grouped conversation item 1",
  }),
  cloudConversationItem: Object.freeze({
    surface: "conversation-item-cloud",
    initial: "Rich probe cloud conversation item 0",
    final: "Rich probe cloud conversation item 1",
  }),
});

function meetsMinimums(value, minimums) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.entries(minimums).every(
      ([key, minimum]) => Number.isFinite(value[key]) && value[key] >= minimum,
    )
  );
}

function richContentRegistrationsReady(counts) {
  return meetsMinimums(counts, richContentRegistrationMinimums);
}

function richContentFallbacksReady(fallbacks) {
  const directive = fallbacks?.assistantDirective;
  return (
    directive?.unregistered?.connected === true &&
    Number.isInteger(directive?.rendererError?.attempts) &&
    directive.rendererError.attempts >= 1 &&
    directive.rendererError.connected === true &&
    richContentMatcherFallbackSurfaces.every((surface) =>
      ["nonMatch", "matcherError", "rendererError"].every((outcome) => {
        const fallback = fallbacks?.[surface]?.[outcome];
        return (
          Number.isInteger(fallback?.attempts) &&
          fallback.attempts >= 1 &&
          fallback.connected === true
        );
      }),
    )
  );
}

function richContentOwnersReady(diagnostics) {
  return (
    diagnostics?.drift === false &&
    diagnostics?.cloudOwnerReady === true &&
    meetsMinimums(diagnostics?.hits, richContentOwnerMinimums) &&
    richContentFallbacksReady(diagnostics?.fallbacks)
  );
}

function richContentInteractionsReady(interactions) {
  return Object.entries(richContentInteractionLabels).every(
    ([key, labels]) =>
      interactions?.[key]?.initialLabel === labels.initial &&
      interactions?.[key]?.finalLabel === labels.final &&
      interactions?.[key]?.found === true &&
      interactions?.[key]?.invalidateFound === true &&
      interactions?.[key]?.invalidateClicked === true &&
      interactions?.[key]?.replaced === true &&
      interactions?.[key]?.oldDisconnected === true &&
      interactions?.[key]?.otherOwnersReady === true &&
      interactions?.[key]?.clicked === true &&
      interactions?.[key]?.changed === true,
  );
}

function uiSurfaceInteractionReady(result) {
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

function richContentUnmountDiagnostics(
  mountedDiagnostics,
  unmounted,
  postUnmount,
) {
  return {
    ...mountedDiagnostics,
    unmounted,
    postUnmount,
  };
}

function richContentFullyUnmounted(diagnostics) {
  const mounts = diagnostics?.lifecycle?.mounts;
  const disposals = diagnostics?.lifecycle?.disposals;
  return richContentLifecycleKinds.every(
    (kind) =>
      Number.isInteger(mounts?.[kind]) &&
      Number.isInteger(disposals?.[kind]) &&
      disposals[kind] === mounts[kind],
  );
}

function diagnosticErrorName(error) {
  const name =
    error !== null &&
    typeof error === "object" &&
    typeof error.name === "string"
      ? error.name
      : "Error";
  return safeDiagnosticErrorNames.has(name) ? name : "Error";
}

function productExtensionRealUiFailureDiagnostics(documentId, error) {
  return Object.freeze({
    rendererDocumentId: documentId,
    validationPassed: false,
    errorName: diagnosticErrorName(error),
  });
}

function safeMainActivationResults(results) {
  if (!Array.isArray(results)) return Object.freeze([]);
  const extensionIdPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
  const statuses = new Set(["active", "failed", "stopped"]);
  return Object.freeze(
    results.map((result) =>
      Object.freeze({
        extensionId:
          typeof result?.extensionId === "string" &&
          extensionIdPattern.test(result.extensionId)
            ? result.extensionId
            : "invalid-extension",
        status: statuses.has(result?.status) ? result.status : "failed",
        ...(result?.error
          ? { errorName: diagnosticErrorName(result.error) }
          : {}),
      }),
    ),
  );
}

function safeRect(rect) {
  const number = (value) => (Number.isFinite(value) ? value : null);
  return Object.freeze({
    width: number(rect?.width),
    height: number(rect?.height),
    top: number(rect?.top),
    right: number(rect?.right),
    bottom: number(rect?.bottom),
    left: number(rect?.left),
  });
}

function safeRealUiLayout(layout) {
  return Object.freeze({
    rowFound: layout?.rowFound === true,
    titleTriggerFound: layout?.titleTriggerFound === true,
    indicatorFound: layout?.indicatorFound === true,
    uncoloredRowFound: layout?.uncoloredRowFound === true,
    row: safeRect(layout?.row),
    indicator: safeRect(layout?.indicator),
    indicatorCount: Number.isInteger(layout?.indicatorCount)
      ? layout.indicatorCount
      : null,
    indicatorBackground:
      layout?.indicatorBackground === "rgb(58, 131, 247)"
        ? "rgb(58, 131, 247)"
        : null,
    indicatorFillsRow: layout?.indicatorFillsRow === true,
    titleGap: Number.isFinite(layout?.titleGap) ? layout.titleGap : null,
    coloredAndUncoloredTitlesAligned:
      layout?.coloredAndUncoloredTitlesAligned === true,
  });
}

function productExtensionDiagnosticsReady(diagnostics) {
  const threadColors = diagnostics?.threadColors;
  const header = threadColors?.header;
  const sidebarRow = threadColors?.sidebarRow;
  const reactions = diagnostics?.reactions;
  const stored = threadColors?.stored;
  return (
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
    stored?.selection?.type === "preset" &&
    stored.selection.id === "blue" &&
    stored?.thread?.scope === "execution" &&
    stored.thread.hostId === "local" &&
    stored.thread.threadId === "chatgptx-product-extension-probe" &&
    reactions?.actionFound === true &&
    reactions?.actionClicked === true &&
    reactions?.actionId === "reactions.reaction-1" &&
    reactions?.actionOrigin === "reactions" &&
    reactions?.label === "👍" &&
    reactions?.persisted?.annotation === "User reacted with 👍" &&
    reactions.persisted.selectedText ===
      "ChatGPTX product reaction probe selection" &&
    reactions.persisted.submit === false
  );
}

function productExtensionRealUiDiagnosticsReady(diagnostics) {
  const thread = diagnostics?.thread;
  const threadColors = diagnostics?.threadColors;
  const header = threadColors?.header;
  const activity = threadColors?.activity;
  const standard = threadColors?.standard;
  const cloud = threadColors?.cloud;
  const reactions = diagnostics?.reactions;
  const settings = diagnostics?.settings;
  const stored = threadColors?.stored;
  const layoutReady = (layout) =>
    layout?.rowFound === true &&
    layout?.titleTriggerFound === true &&
    layout?.indicatorFound === true &&
    layout?.indicatorCount === 1 &&
    layout?.uncoloredRowFound === true &&
    layout?.indicatorFillsRow === true &&
    layout?.coloredAndUncoloredTitlesAligned === true &&
    layout?.indicatorBackground === "rgb(58, 131, 247)" &&
    Math.abs((layout?.indicator?.width ?? 0) - 3) <= 0.5 &&
    Math.abs((layout?.titleGap ?? Number.NaN) - 3) <= 0.75;
  return (
    diagnostics?.realDom === true &&
    thread?.scope === "execution" &&
    typeof thread?.hostId === "string" &&
    thread.hostId.length > 0 &&
    typeof thread?.threadId === "string" &&
    thread.threadId.length > 0 &&
    thread.threadId !== "chatgptx-product-extension-probe" &&
    typeof thread?.title === "string" &&
    thread.title.length > 0 &&
    thread?.signedInHeaderTitleFound === true &&
    threadColors?.nativeMenuTrigger === true &&
    threadColors?.nativeMenuAction === true &&
    threadColors?.nativeFlyoutAction === true &&
    header?.found === true &&
    header?.titleFound === true &&
    header?.blueRegionFound === true &&
    header?.background === "rgb(58, 131, 247)" &&
    layoutReady(activity) &&
    layoutReady(standard) &&
    threadColors?.activityRowIsTaller === true &&
    cloud?.scope === "cloud" &&
    cloud?.menuActionFound === true &&
    cloud?.menuActionClicked === true &&
    cloud?.ownerMatched === true &&
    layoutReady(cloud?.layout) &&
    cloud?.stored?.scope === "cloud" &&
    cloud?.stored?.selection?.type === "preset" &&
    cloud.stored.selection.id === "blue" &&
    stored?.thread?.scope === thread.scope &&
    stored.thread.hostId === thread.hostId &&
    stored.thread.threadId === thread.threadId &&
    stored?.selection?.type === "preset" &&
    stored.selection.id === "blue" &&
    reactions?.targetFound === true &&
    typeof reactions?.selectedText === "string" &&
    reactions.selectedText.length > 0 &&
    reactions?.actionFound === true &&
    reactions?.actionVisible === true &&
    reactions?.nativeToolbarFound === true &&
    reactions?.sharesNativeActionComponent === true &&
    reactions?.creationCountAfter === reactions?.creationCountBefore + 1 &&
    reactions?.composerAnnotationFound === true &&
    reactions?.persisted?.annotation === "User reacted with 👍" &&
    reactions.persisted.selectedText === reactions.selectedText &&
    reactions.persisted.submit === false &&
    settings?.opened === true &&
    settings?.searchFieldFound === true &&
    settings?.queryAccepted === true &&
    settings?.queryClearedAfterSelection === true &&
    settings?.searchResultFound === true &&
    settings?.searchResultClicked === true &&
    settings?.selectedPane === "extensions.installed" &&
    settings?.threadColorsVisible === true &&
    settings?.refreshControlAbsent === true &&
    settings?.globalErrorAbsent === true
  );
}

function sanitizeProductExtensionRealUiDiagnostics(diagnostics) {
  const thread = diagnostics?.thread;
  const threadColors = diagnostics?.threadColors;
  const cloud = threadColors?.cloud;
  const stored = threadColors?.stored;
  const reactions = diagnostics?.reactions;
  const persistedReaction = reactions?.persisted;
  const settings = diagnostics?.settings;
  const validationPassed = productExtensionRealUiDiagnosticsReady(diagnostics);
  const present = (value, replacement) =>
    typeof value === "string" && value.length > 0 ? replacement : null;
  const preset = (selection) =>
    Object.freeze({
      type: selection?.type === "preset" ? "preset" : null,
      id: selection?.id === "blue" ? "blue" : null,
    });

  return Object.freeze({
    rendererDocumentId:
      typeof diagnostics?.rendererDocumentId === "string" &&
      diagnostics.rendererDocumentId.length > 0
        ? diagnostics.rendererDocumentId
        : null,
    validationPassed,
    realDom: validationPassed && diagnostics?.realDom === true,
    thread: Object.freeze({
      scope: thread?.scope === "execution" ? "execution" : null,
      hostId: present(thread?.hostId, realUiDiagnosticRedactions.hostId),
      threadId: present(thread?.threadId, realUiDiagnosticRedactions.threadId),
      title: present(thread?.title, realUiDiagnosticRedactions.title),
      signedInHeaderTitleFound: thread?.signedInHeaderTitleFound === true,
    }),
    threadColors: Object.freeze({
      nativeMenuTrigger: threadColors?.nativeMenuTrigger === true,
      nativeMenuAction: threadColors?.nativeMenuAction === true,
      nativeFlyoutAction: threadColors?.nativeFlyoutAction === true,
      header: Object.freeze({
        found: threadColors?.header?.found === true,
        titleFound: threadColors?.header?.titleFound === true,
        blueRegionFound: threadColors?.header?.blueRegionFound === true,
        background:
          threadColors?.header?.background === "rgb(58, 131, 247)"
            ? "rgb(58, 131, 247)"
            : null,
      }),
      activity: safeRealUiLayout(threadColors?.activity),
      standard: safeRealUiLayout(threadColors?.standard),
      activityRowIsTaller: threadColors?.activityRowIsTaller === true,
      cloud: Object.freeze({
        scope: cloud?.scope === "cloud" ? "cloud" : null,
        menuActionFound: cloud?.menuActionFound === true,
        menuActionClicked: cloud?.menuActionClicked === true,
        ownerMatched: cloud?.ownerMatched === true,
        layout: safeRealUiLayout(cloud?.layout),
        stored: Object.freeze({
          scope: cloud?.stored?.scope === "cloud" ? "cloud" : null,
          selection: preset(cloud?.stored?.selection),
        }),
      }),
      stored: Object.freeze({
        thread: Object.freeze({
          scope: stored?.thread?.scope === "execution" ? "execution" : null,
          hostId: present(
            stored?.thread?.hostId,
            realUiDiagnosticRedactions.hostId,
          ),
          threadId: present(
            stored?.thread?.threadId,
            realUiDiagnosticRedactions.threadId,
          ),
        }),
        selection: preset(stored?.selection),
      }),
    }),
    reactions: Object.freeze({
      targetFound: reactions?.targetFound === true,
      selectedText: present(
        reactions?.selectedText,
        realUiDiagnosticRedactions.selectedText,
      ),
      actionFound: reactions?.actionFound === true,
      actionVisible: reactions?.actionVisible === true,
      nativeToolbarFound: reactions?.nativeToolbarFound === true,
      sharesNativeActionComponent:
        reactions?.sharesNativeActionComponent === true,
      creationCountBefore: Number.isInteger(reactions?.creationCountBefore)
        ? reactions.creationCountBefore
        : null,
      creationCountAfter: Number.isInteger(reactions?.creationCountAfter)
        ? reactions.creationCountAfter
        : null,
      composerAnnotationFound: reactions?.composerAnnotationFound === true,
      persisted: Object.freeze({
        annotation:
          persistedReaction?.annotation === "User reacted with 👍"
            ? "User reacted with 👍"
            : null,
        selectedText: present(
          persistedReaction?.selectedText,
          realUiDiagnosticRedactions.selectedText,
        ),
        submit: persistedReaction?.submit === false ? false : null,
      }),
    }),
    settings: Object.freeze({
      opened: settings?.opened === true,
      searchFieldFound: settings?.searchFieldFound === true,
      queryAccepted: settings?.queryAccepted === true,
      queryClearedAfterSelection:
        settings?.queryClearedAfterSelection === true,
      searchResultFound: settings?.searchResultFound === true,
      searchResultClicked: settings?.searchResultClicked === true,
      selectedPane:
        settings?.selectedPane === "extensions.installed"
          ? "extensions.installed"
          : null,
      threadColorsVisible: settings?.threadColorsVisible === true,
      refreshControlAbsent: settings?.refreshControlAbsent === true,
      globalErrorAbsent: settings?.globalErrorAbsent === true,
    }),
  });
}

function createPrimaryDocumentClaim() {
  let documentId;
  return Object.freeze({
    claim(candidate, primary) {
      if (
        primary !== true ||
        typeof candidate !== "string" ||
        candidate.length === 0
      ) {
        return false;
      }
      documentId ??= candidate;
      return documentId === candidate;
    },
    release(candidate) {
      if (documentId !== candidate) return false;
      documentId = undefined;
      return true;
    },
    current: () => documentId,
  });
}

function primaryAppShellReadyExpression() {
  return (
    "window.__CGPTX_HOST__?._debug?.primaryAppShellReady?.() === true"
  );
}

function isCurrentRendererDocument(lifecycle, contents, document) {
  return (
    lifecycle?.isCurrent(contents, document.id) === true &&
    contents.isDestroyed?.() !== true
  );
}

function writeCurrentRendererDocumentDiagnostics(
  lifecycle,
  contents,
  document,
  write,
) {
  if (!isCurrentRendererDocument(lifecycle, contents, document)) {
    throw new Error("The renderer document is no longer current");
  }
  return write();
}

async function probeCompletionAllowsContinuation(
  completion,
  lifecycle,
  contents,
  document,
) {
  return (
    (await completion) === true &&
    isCurrentRendererDocument(lifecycle, contents, document)
  );
}

function uiSurfaceProbeEventFile(documentId) {
  if (typeof documentId !== "string" || documentId.length === 0) {
    throw new TypeError("UI Surface Probe document ID is required");
  }
  const safeDocumentId = documentId.replace(/[^A-Za-z0-9_-]/g, "_");
  return `events-${safeDocumentId}.json`;
}

function richMessageProbeEventFile(documentId) {
  if (typeof documentId !== "string" || documentId.length === 0) {
    throw new TypeError("Rich Message Probe document ID is required");
  }
  return `${encodeURIComponent(documentId)}.json`;
}

function richContentUnmountRequested(value, documentId) {
  return (
    typeof documentId === "string" &&
    documentId.length > 0 &&
    value === `${documentId}\n`
  );
}

function rendererHostReadyExpression(appVersion) {
  return `Boolean(window.__CGPTX_HOST__ && window.__CGPTX_HOST__.version === ${JSON.stringify(appVersion)})`;
}

function requireCurrentRendererDocument(lifecycle, contents, documentId) {
  if (typeof documentId !== "string" || documentId.length === 0) {
    throw new TypeError("Renderer document ID is required");
  }
  const document = lifecycle?.currentDocumentFor?.(contents, documentId);
  if (!document) {
    throw new Error("The renderer document is no longer current");
  }
  return document;
}

function createRendererLifecycle(options) {
  const attached = new WeakSet();
  const records = new WeakMap();
  const contentsByDocumentId = new Map();

  function createRecord(contents, url) {
    const document = Object.freeze({
      id: options.createDocumentId(),
      windowId: options.windowId(contents),
      webContentsId: contents.id,
      url,
    });
    const record = {
      document,
      connected: false,
      injectionStarted: false,
      inactive: false,
    };
    records.set(contents, record);
    contentsByDocumentId.set(document.id, contents);
    return record;
  }

  function forget(contents) {
    const record = records.get(contents);
    if (!record) return;
    records.delete(contents);
    contentsByDocumentId.delete(record.document.id);
  }

  function disconnect(contents, reason) {
    const record = records.get(contents);
    if (!record?.connected) return false;
    record.connected = false;
    try {
      options.disconnect(record.document.id, reason);
    } catch (error) {
      options.onError("disconnect", contents, error);
    }
    return true;
  }

  function beginDocument(contents, url) {
    disconnect(contents, "document-replaced");
    forget(contents);
    return createRecord(contents, url).document;
  }

  function currentDocumentFor(contents, documentId) {
    const record = records.get(contents);
    return (
      record?.document.id === documentId &&
      record.inactive !== true
        ? record.document
        : undefined
    );
  }

  function isCurrent(contents, documentId) {
    return currentDocumentFor(contents, documentId) !== undefined;
  }

  function ready(contents) {
    if (contents.isDestroyed?.()) return;
    const url = contents.getURL();
    if (!options.isEligible(url)) {
      disconnect(contents, "ineligible-document");
      forget(contents);
      return;
    }

    const record = records.get(contents) ?? createRecord(contents, url);
    if (record.inactive) return;
    if (!record.injectionStarted) {
      record.injectionStarted = true;
      try {
        void Promise.resolve(options.inject(contents, record.document)).catch(
          (error) => options.onError("inject", contents, error),
        );
      } catch (error) {
        options.onError("inject", contents, error);
      }
    }
    if (!record.connected) {
      try {
        if (options.connect(record.document) !== false) {
          record.connected = true;
        }
      } catch (error) {
        options.onError("connect", contents, error);
      }
    }
  }

  function navigationDetails(args) {
    const value = [args[0], args[1]].find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        typeof candidate.isMainFrame === "boolean",
    );
    if (value) {
      return {
        isMainFrame: value.isMainFrame === true,
        isSameDocument: value.isSameDocument === true,
      };
    }
    return {
      isMainFrame: args[3] === true,
      isSameDocument: args[2] === true,
    };
  }

  function attach(contents) {
    if (attached.has(contents)) return;
    attached.add(contents);
    contents.on("did-start-navigation", (...args) => {
      const details = navigationDetails(args);
      if (!details.isMainFrame || details.isSameDocument) return;
      disconnect(contents, "main-frame-navigation");
      forget(contents);
    });
    contents.on("did-navigate-in-page", () => ready(contents));
    contents.on("dom-ready", () => ready(contents));
    contents.on("destroyed", () => {
      disconnect(contents, "destroyed");
      forget(contents);
    });

    const loading =
      typeof contents.isLoadingMainFrame === "function"
        ? contents.isLoadingMainFrame()
        : typeof contents.isLoading === "function"
          ? contents.isLoading()
          : true;
    if (!loading) ready(contents);
  }

  function pageHidden(contents, documentId) {
    if (typeof documentId !== "string" || !isCurrent(contents, documentId)) {
      return false;
    }
    records.get(contents).inactive = true;
    return disconnect(contents, "pagehide");
  }

  function contentsForDocument(documentId) {
    const contents = contentsByDocumentId.get(documentId);
    return contents && isCurrent(contents, documentId) ? contents : undefined;
  }

  return Object.freeze({
    attach,
    beginDocument,
    contentsForDocument,
    currentDocumentFor,
    isCurrent,
    pageHidden,
    ready,
  });
}

function startRendererLifecycle(options) {
  options.app.on("web-contents-created", (_event, contents) =>
    options.lifecycle.attach(contents),
  );
  let activation;
  if (typeof options.activateMain === "function") {
    try {
      activation = Promise.resolve(options.activateMain());
    } catch (error) {
      activation = Promise.reject(error);
    }
    void activation.then(options.onActivated, options.onActivationError);
  }
  options.webContents.getAllWebContents().forEach(options.lifecycle.attach);
  return activation;
}

function richContentInteractionScript(specification, specifications) {
  return `(async () => {
    const specification = ${JSON.stringify(specification)};
    const specifications = ${JSON.stringify(specifications)};
    const selector = (surface, control) =>
      '[data-rich-probe-surface="' + surface + '"]' +
      '[data-rich-probe-control="' + control + '"]';
    const selectAll = (surface, control) =>
      Array.from(document.querySelectorAll(selector(surface, control)));
    const wait = (milliseconds = 16) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds));
    const otherSpecifications = specifications.filter(
      ({ surface }) => surface !== specification.surface,
    );
    const captureOtherOwners = () => otherSpecifications.map((other) => {
      const surface = other.surface;
      const actions = selectAll(surface, "action");
      const invalidates = selectAll(surface, "invalidate");
      const action = actions[0] ?? null;
      const invalidate = invalidates[0] ?? null;
      const expectedLabel =
        other.index < specification.index ? other.final : other.initial;
      return {
        surface,
        expectedLabel,
        ready:
          actions.length === 1 &&
          invalidates.length === 1 &&
          action instanceof HTMLElement &&
          action.isConnected &&
          action.getAttribute("aria-label") === expectedLabel &&
          invalidate instanceof HTMLElement &&
          invalidate.isConnected &&
          typeof action.click === "function" &&
          typeof invalidate.click === "function",
      };
    });
    const otherOwnersReady = (owners) => owners.every(
      ({ surface, expectedLabel, ready }) => {
        const actions = selectAll(surface, "action");
        const invalidates = selectAll(surface, "invalidate");
        const action = actions[0] ?? null;
        const invalidate = invalidates[0] ?? null;
        return (
          ready &&
          actions.length === 1 &&
          invalidates.length === 1 &&
          action instanceof HTMLElement &&
          action.isConnected &&
          invalidate instanceof HTMLElement &&
          invalidate.isConnected &&
          typeof action.click === "function" &&
          typeof invalidate.click === "function" &&
          action.getAttribute("aria-label") === expectedLabel
        );
      },
    );
    let oldAction = null;
    let oldInvalidate = null;
    let otherOwners = [];
    let found = false;
    let invalidateFound = false;
    const baselineDeadline = Date.now() + 10_000;
    while (Date.now() < baselineDeadline) {
      const actions = selectAll(specification.surface, "action");
      const invalidates = selectAll(specification.surface, "invalidate");
      const candidateAction = actions[0] ?? null;
      const candidateInvalidate = invalidates[0] ?? null;
      const candidateOthers = captureOtherOwners();
      const candidateFound =
        actions.length === 1 &&
        candidateAction instanceof HTMLElement &&
        candidateAction.isConnected &&
        candidateAction.getAttribute("aria-label") === specification.initial &&
        typeof candidateAction.click === "function";
      const candidateInvalidateFound =
        invalidates.length === 1 &&
        candidateInvalidate instanceof HTMLElement &&
        candidateInvalidate.isConnected &&
        typeof candidateInvalidate.click === "function";
      if (
        candidateFound &&
        candidateInvalidateFound &&
        otherOwnersReady(candidateOthers)
      ) {
        oldAction = candidateAction;
        oldInvalidate = candidateInvalidate;
        otherOwners = candidateOthers;
        found = true;
        invalidateFound = true;
        break;
      }
      await wait();
    }
    if (!found || !invalidateFound || !otherOwnersReady(otherOwners)) {
      return {
        initialLabel: specification.initial,
        finalLabel: specification.final,
        found,
        invalidateFound,
        invalidateClicked: false,
        replaced: false,
        oldDisconnected: false,
        otherOwnersReady: false,
        clicked: false,
        changed: false,
      };
    }
    oldInvalidate.click();
    let replacementAction = null;
    let replacementInvalidate = null;
    const replacementDeadline = Date.now() + 10_000;
    while (Date.now() < replacementDeadline) {
      const actions = selectAll(specification.surface, "action");
      const invalidates = selectAll(specification.surface, "invalidate");
      replacementAction = actions[0] ?? null;
      replacementInvalidate = invalidates[0] ?? null;
      if (
        !oldAction.isConnected &&
        !oldInvalidate.isConnected &&
        actions.length === 1 &&
        invalidates.length === 1 &&
        replacementAction instanceof HTMLElement &&
        replacementInvalidate instanceof HTMLElement &&
        replacementAction !== oldAction &&
        replacementInvalidate !== oldInvalidate &&
        replacementAction.getAttribute("aria-label") === specification.initial &&
        otherOwnersReady(otherOwners)
      ) {
        break;
      }
      await wait();
    }
    const oldDisconnected =
      !oldAction.isConnected && !oldInvalidate.isConnected;
    const replacementActions = selectAll(specification.surface, "action");
    const replacementInvalidates = selectAll(specification.surface, "invalidate");
    const replaced =
      replacementActions.length === 1 &&
      replacementInvalidates.length === 1 &&
      replacementAction instanceof HTMLElement &&
      replacementInvalidate instanceof HTMLElement &&
      replacementAction !== oldAction &&
      replacementInvalidate !== oldInvalidate &&
      replacementAction.getAttribute("aria-label") === specification.initial;
    let otherOwnersRemainReady = otherOwnersReady(otherOwners);
    let clicked = false;
    let changed = false;
    if (oldDisconnected && replaced && otherOwnersRemainReady) {
      replacementAction.click();
      clicked = true;
      const activationDeadline = Date.now() + 10_000;
      while (Date.now() < activationDeadline) {
        const actions = selectAll(specification.surface, "action");
        const invalidates = selectAll(specification.surface, "invalidate");
        if (
          actions.length === 1 &&
          invalidates.length === 1 &&
          actions[0] instanceof HTMLElement &&
          actions[0].isConnected &&
          invalidates[0] instanceof HTMLElement &&
          invalidates[0].isConnected &&
          actions[0].getAttribute("aria-label") === specification.final
        ) {
          changed = true;
          break;
        }
        await wait();
      }
      otherOwnersRemainReady =
        otherOwnersRemainReady && otherOwnersReady(otherOwners);
    }
    return {
      initialLabel: specification.initial,
      finalLabel: specification.final,
      found,
      invalidateFound,
      invalidateClicked: true,
      replaced,
      oldDisconnected,
      otherOwnersReady: otherOwnersRemainReady,
      clicked,
      changed,
    };
  })()`;
}

if (
  process.type === "browser" &&
  /[/\\]ChatGPT(?:\.exe)?$/.test(process.execPath) &&
  require("node:worker_threads").isMainThread
) {
  try {
    initialize();
  } catch {
    // Injection must not prevent ChatGPT from starting.
  }
}

function initialize() {
  const launchConfigurationFile = process.env.CHATGPTX_LAUNCH_CONFIGURATION;
  const requestedLogDirectory = process.env.CHATGPTX_LOG_DIRECTORY;
  const requestedExtensionTestRoot = process.env.CHATGPTX_EXTENSION_TEST_ROOT;
  delete process.env.NODE_OPTIONS;
  delete process.env.CHATGPTX_LAUNCH_CONFIGURATION;
  delete process.env.CHATGPTX_LOG_DIRECTORY;
  delete process.env.CHATGPTX_EXTENSION_TEST_ROOT;

  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const path = require("node:path");
  const { execFileSync } = require("node:child_process");
  const Module = require("node:module");
  const {
    installedExtensions,
    loadLaunchConfiguration,
    setExtensionEnabled,
  } = require("./extension-launch-config.cjs");
  const {
    createExtensionStorageMain,
  } = require("./extension-storage-main.cjs");
  const logDirectory =
    typeof requestedLogDirectory === "string" &&
    path.isAbsolute(requestedLogDirectory)
      ? requestedLogDirectory
      : typeof launchConfigurationFile === "string" &&
          path.isAbsolute(launchConfigurationFile)
        ? path.join(path.dirname(launchConfigurationFile), "log")
        : path.join("/tmp", "chatgptx-v5-log");
  const logFile = path.join(logDirectory, `runtime-${process.pid}.jsonl`);
  const extensionTestRootIsValid = (() => {
    if (
      typeof requestedExtensionTestRoot !== "string" ||
      !path.isAbsolute(requestedExtensionTestRoot)
    ) {
      return false;
    }
    try {
      return fs.readFileSync(
        path.join(requestedExtensionTestRoot, ".chatgptx-extension-test"),
        "utf8",
      ).trim() === "chatgptx-extension-test-v1";
    } catch {
      return false;
    }
  })();
  function testProbeRequested(name) {
    if (!extensionTestRootIsValid) return false;
    try {
      return fs.readFileSync(
        path.join(requestedExtensionTestRoot, name),
        "utf8",
      ).trim() === "enabled";
    } catch {
      return false;
    }
  }
  const richContentProbeRequested = testProbeRequested("rich-content-probe");
  const uiSurfaceProbeRequested = testProbeRequested("ui-surface-probe");
  const productExtensionProbeRequested = testProbeRequested(
    "product-extension-probe",
  );
  const productExtensionRealUiProbeRequested = testProbeRequested(
    "product-extension-real-ui-probe",
  );
  const liveProbeSuiteRequested =
    richContentProbeRequested ||
    uiSurfaceProbeRequested ||
    productExtensionProbeRequested ||
    productExtensionRealUiProbeRequested;
  function log(event, data = {}) {
    try {
      fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
      fs.appendFileSync(
        logFile,
        `${JSON.stringify({ time: new Date().toISOString(), event, ...data })}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
    } catch {
      // Logging must not affect ChatGPT.
    }
  }

  log("runtime-loaded", {
    pid: process.pid,
    electron: process.versions.electron,
    node: process.version,
  });

  let launch;
  try {
    if (!launchConfigurationFile) {
      throw new Error("CHATGPTX_LAUNCH_CONFIGURATION is required");
    }
    launch = loadLaunchConfiguration(launchConfigurationFile);
    log("launch-configuration-loaded", {
      file: launch.file,
      extensions: launch.extensions.map((extension) => ({
        id: extension.id,
        enabled: extension.enabled,
        renderer: Boolean(extension.renderer),
        settings: Boolean(extension.settings),
        main: Boolean(extension.main),
      })),
    });
  } catch (error) {
    log("launch-configuration-invalid", {
      errorName: diagnosticErrorName(error),
    });
    return;
  }

  let rendererHostSource;
  let hostSource;
  let hostSourceDigest;
  let patchBindingHostSource;
  try {
    ({ patchBindingHostSource } = require(launch.binding.patchFile));
    if (typeof patchBindingHostSource !== "function") {
      throw new Error("The binding patch does not export patchBindingHostSource");
    }
    rendererHostSource = fs.readFileSync(launch.binding.rendererHostFile, "utf8");
    hostSource = fs.readFileSync(launch.binding.hostFile, "utf8");
  } catch (error) {
    log("runtime-artifact-unreadable", {
      errorName: diagnosticErrorName(error),
    });
    return;
  }
  try {
    const patchedHost = patchBindingHostSource({
      appVersion: launch.appVersion,
      appBuild: launch.appBuild,
      originalDigest: launch.binding.originalHostDigest,
      source: hostSource,
    });
    hostSource = patchedHost.source;
    hostSourceDigest = patchedHost.digest;
    log("binding-host-patched", {
      originalDigest: launch.binding.originalHostDigest,
      adapterDigest: hostSourceDigest,
    });
  } catch (error) {
    log("binding-host-patch-failed", {
      errorName: diagnosticErrorName(error),
    });
    return;
  }

  const storage = createExtensionStorageMain(launch.storageDirectory);
  const extensionById = new Map(
    launch.extensions.map((extension) => [extension.id, extension]),
  );
  const activationReports = new Map();
  const liveProbeSuiteClaim = createPrimaryDocumentClaim();
  const richContentProbePollers = new Map();
  let electronNamespace;
  let mainHost;
  let rendererLifecycle;

  function stopRichContentProbePoller(documentId) {
    const stop = richContentProbePollers.get(documentId);
    if (!stop) return;
    richContentProbePollers.delete(documentId);
    stop();
  }

  function writeProbeDiagnostics(contents, document, name, diagnostics) {
    return writeCurrentRendererDocumentDiagnostics(
      rendererLifecycle,
      contents,
      document,
      () =>
        fs.writeFileSync(
          path.join(requestedExtensionTestRoot, name),
          `${JSON.stringify(diagnostics, null, 2)}\n`,
          { encoding: "utf8", mode: 0o600 },
        ),
    );
  }

  async function readRichContentDiagnostics(contents) {
    return contents.executeJavaScript(`({
      registrations:
        window.__CGPTX_HOST__?._debug?.richContentRegistrationCounts?.() ?? null,
      hits: window.__CGPTX_HOST__?._debug?.richContentOwnerHits?.() ?? null,
      lifecycle:
        window.__CGPTX_HOST__?._debug?.richContentLifecycle?.() ?? null,
      fallbacks: window.__CGPTX_HOST__?._debug?.richContentFallbacks?.() ?? null,
      drift: window.__CGPTX_HOST__?._debug?.richContentOwnerDrift?.() ?? true,
      cloudOwnerReady:
        window.__CGPTX_HOST__?._debug?.cloudConversationItemOwnerReady?.() === true,
    })`);
  }

  async function waitForRichContentDiagnostics(
    contents,
    document,
    predicate,
    timeoutMilliseconds,
  ) {
    const deadline = Date.now() + timeoutMilliseconds;
    let diagnostics;
    while (
      Date.now() < deadline &&
      rendererLifecycle?.isCurrent(contents, document.id) &&
      !contents.isDestroyed?.()
    ) {
      diagnostics = await readRichContentDiagnostics(contents);
      if (predicate(diagnostics)) return diagnostics;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return diagnostics;
  }

  async function interactWithRichContentProbe(contents, document) {
    const specifications = Object.entries(richContentInteractionLabels).map(
      ([key, labels], index) => ({ key, index, ...labels }),
    );
    const interactions = {};
    for (const specification of specifications) {
      if (
        !rendererLifecycle?.isCurrent(contents, document.id) ||
        contents.isDestroyed?.()
      ) {
        break;
      }
      interactions[specification.key] = await contents.executeJavaScript(
        richContentInteractionScript(specification, specifications),
      );
    }
    return interactions;
  }

  function startRichContentProbeUnmountPoller(
    contents,
    document,
    mountedDiagnostics,
  ) {
    stopRichContentProbePoller(document.id);
    const requestFile = path.join(
      requestedExtensionTestRoot,
      "rich-content-unmount-request",
    );
    let settled = false;
    let handling = false;
    let timer;
    let resolveCompletion;
    const completion = new Promise((resolve) => {
      resolveCompletion = resolve;
    });
    const finish = (completed) => {
      if (settled) return false;
      settled = true;
      if (timer) clearInterval(timer);
      if (richContentProbePollers.get(document.id) === stop) {
        richContentProbePollers.delete(document.id);
      }
      resolveCompletion(completed === true);
      return true;
    };
    const stop = () => finish(false);
    const inspect = async () => {
      if (settled || handling) return;
      if (
        !isCurrentRendererDocument(rendererLifecycle, contents, document)
      ) {
        finish(false);
        return;
      }
      try {
        if (!fs.existsSync(requestFile)) return;
        if (
          !richContentUnmountRequested(
            fs.readFileSync(requestFile, "utf8"),
            document.id,
          )
        ) {
          return;
        }
      } catch {
        finish(false);
        return;
      }
      handling = true;
      let completed = false;
      let diagnostics = { ...mountedDiagnostics, unmounted: false };
      try {
        fs.unlinkSync(requestFile);
        const unmounted = await contents.executeJavaScript(
          "window.__CGPTX_HOST__?._debug?.unmountRichContentProbe?.() === true",
        );
        if (!unmounted) {
          throw new Error("The exact rich-content probe did not unmount");
        }
        const postUnmount = await waitForRichContentDiagnostics(
          contents,
          document,
          richContentFullyUnmounted,
          20_000,
        );
        diagnostics = richContentUnmountDiagnostics(
          mountedDiagnostics,
          unmounted,
          postUnmount,
        );
        if (!richContentFullyUnmounted(postUnmount)) {
          throw new Error("The exact rich-content probe did not fully dispose");
        }
        writeProbeDiagnostics(
          contents,
          document,
          "rich-content-unmount-diagnostics.json",
          diagnostics,
        );
        log("rich-content-probe-unmounted", {
          webContentsId: contents.id,
          documentId: document.id,
          diagnostics,
        });
        completed = true;
      } catch (error) {
        if (!isCurrentRendererDocument(rendererLifecycle, contents, document)) {
          return;
        }
        diagnostics = {
          ...diagnostics,
          errorName: diagnosticErrorName(error),
        };
        try {
          writeProbeDiagnostics(
            contents,
            document,
            "rich-content-unmount-diagnostics.json",
            diagnostics,
          );
          log("rich-content-probe-unmount-failed", {
            webContentsId: contents.id,
            documentId: document.id,
            diagnostics,
            errorName: diagnosticErrorName(error),
          });
        } catch {}
      } finally {
        finish(completed);
      }
    };
    timer = setInterval(() => void inspect(), 50);
    timer.unref?.();
    richContentProbePollers.set(document.id, stop);
    void inspect();
    return completion;
  }

  async function interactWithUiSurfaceProbe(contents, document) {
    const interactionDiagnostics = await contents.executeJavaScript(`(async () => {
      const wait = () => new Promise((resolve) => setTimeout(resolve, 25));
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement) || !element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
          style.visibility !== "hidden";
      };
      const find = (selector) =>
        Array.from(document.querySelectorAll(selector)).find(isVisible);
      const waitFor = async (selector, timeout = 2_000) => {
        const deadline = Date.now() + timeout;
        let value;
        while (Date.now() < deadline) {
          value = find(selector);
          if (value instanceof HTMLElement) return value;
          await wait();
        }
        return value;
      };
      const clickable = (element) =>
        element?.closest?.('button, [role="menuitem"], a, [role="button"]');
      const labelOf = (element) =>
        element?.getAttribute?.("aria-label") ?? element?.textContent?.trim() ?? "";
      const nextCountLabel = (label) => {
        const match = /^(.*)\\((\\d+)\\)(.*)$/.exec(label);
        return match
          ? match[1] + "(" + (Number(match[2]) + 1) + ")" + match[3]
          : null;
      };
      const activate = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        element.focus?.();
        for (const type of ["pointerdown", "pointerup"]) {
          element.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            isPrimary: true,
            button: 0,
            pointerType: "mouse",
          }));
        }
        for (const type of ["mousedown", "mouseup", "click"]) {
          element.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            button: 0,
          }));
        }
        return true;
      };
      const runAction = async (name, selector, state, open) => {
        if (typeof open === "function") await open();
        const oldMarker = await waitFor(selector);
        const target = clickable(oldMarker);
        const found = oldMarker instanceof HTMLElement && oldMarker.isConnected;
        const clicked =
          found &&
          target instanceof HTMLElement &&
          target.isConnected &&
          typeof target.click === "function";
        const oldLabel = labelOf(oldMarker);
        const expectedLabel = nextCountLabel(oldLabel);
        if (clicked) target.click();
        const deadline = Date.now() + 10_000;
        let currentMarker;
        let currentLabel = "";
        while (clicked && Date.now() < deadline) {
          currentMarker = find(selector);
          currentLabel = labelOf(currentMarker);
          if (
            currentMarker instanceof HTMLElement &&
            currentMarker.isConnected &&
            expectedLabel !== null &&
            currentLabel === expectedLabel
          ) {
            break;
          }
          if (
            typeof open === "function" &&
            !(currentMarker instanceof HTMLElement)
          ) {
            await open();
          }
          await wait();
        }
        return {
          name,
          state,
          kind: "action",
          found,
          clicked,
          changed: expectedLabel !== null && currentLabel === expectedLabel,
          initialLabel: oldLabel,
          expectedLabel,
          label: currentLabel || oldLabel,
        };
      };
      const runRender = async (point, state) => {
        const invalidateSelector = '[data-ui-probe-render-point="' + point + '"]' +
          '[data-ui-probe-render-control="invalidate"]';
        const actionSelector = '[data-ui-probe-render-point="' + point + '"]' +
          '[data-ui-probe-render-control="action"]';
        const oldInvalidate = await waitFor(invalidateSelector);
        const owner = oldInvalidate?.closest?.('[data-cgptx-render-point="' + point + '"]');
        const invalidateFound = oldInvalidate instanceof HTMLElement;
        const invalidateClicked = invalidateFound && typeof oldInvalidate.click === "function";
        if (invalidateClicked) oldInvalidate.click();
        const deadline = Date.now() + 10_000;
        let replacementAction;
        while (invalidateClicked && Date.now() < deadline) {
          replacementAction = find(actionSelector);
          if (!oldInvalidate.isConnected && replacementAction instanceof HTMLElement) break;
          await wait();
        }
        const actionFound = replacementAction instanceof HTMLElement;
        const actionClicked = actionFound && typeof replacementAction.click === "function";
        if (actionClicked) replacementAction.click();
        return {
          name: "composer-render:" + point,
          state,
          kind: "render",
          point,
          ownerFound: owner instanceof HTMLElement,
          invalidateFound,
          invalidateClicked,
          oldDisconnected: invalidateFound && oldInvalidate.isConnected === false,
          replaced: actionFound,
          actionFound,
          actionClicked,
        };
      };
      const actionPlacements = [
        "composer.footer.leading",
        "composer.footer.trailing",
        "composer.action-bar.leading",
        "composer.action-bar.trailing",
        "composer.utility.leading",
        "composer.utility.trailing",
      ];
      const renderPoints = [...actionPlacements, "composer.attachments"];
      const composerApplicability = {
        home: {
          actions: actionPlacements,
          renders: renderPoints,
        },
        thread: {
          actions: ["composer.footer.leading", "composer.footer.trailing"],
          renders: [
            "composer.footer.leading",
            "composer.footer.trailing",
            "composer.attachments",
          ],
        },
      };
      const actionSelector = (placement) =>
        '[data-cgptx-composer-action="ui-surface-probe.composer-action.' +
        placement + '"]';
      const renderSelector = (point) =>
        '[data-ui-probe-render-point="' + point + '"]' +
        '[data-ui-probe-render-control="action"]';
      const preflightComposerState = async (state) => {
        const applicability = composerApplicability[state];
        const deadline = Date.now() + 20_000;
        let missingActions = applicability.actions;
        let missingRenders = applicability.renders;
        while (Date.now() < deadline) {
          missingActions = applicability.actions.filter(
            (placement) => !find(actionSelector(placement)),
          );
          missingRenders = applicability.renders.filter(
            (point) => !find(renderSelector(point)),
          );
          if (missingActions.length === 0 && missingRenders.length === 0) break;
          await wait();
        }
        return { state, missingActions, missingRenders };
      };
      const runComposerState = async (state, results) => {
        const preflight = await preflightComposerState(state);
        const applicability = composerApplicability[state];
        for (const placement of applicability.actions) {
          results.push(
            preflight.missingActions.includes(placement)
              ? {
                  name: "composer-action:" + placement,
                  state,
                  kind: "action",
                  found: false,
                  clicked: false,
                  changed: false,
                }
              : await runAction(
                  "composer-action:" + placement,
                  actionSelector(placement),
                  state,
                ),
          );
        }
        for (const point of applicability.renders) {
          results.push(
            preflight.missingRenders.includes(point)
              ? {
                  name: "composer-render:" + point,
                  state,
                  kind: "render",
                  point,
                  ownerFound: false,
                  invalidateFound: false,
                  invalidateClicked: false,
                  oldDisconnected: false,
                  replaced: false,
                  actionFound: false,
                  actionClicked: false,
                }
              : await runRender(point, state),
          );
        }
        return preflight;
      };
      const productMenuOpen = async () => {
        const itemSelector =
          '[data-cgptx-product-menu-item="ui-surface-probe.product-menu"]';
        if (find(itemSelector)) return true;
        const trigger =
          find('[data-cgptx-product-mode-trigger]') ??
          Array.from(document.querySelectorAll('button, [role="button"]')).find(
            (element) =>
              isVisible(element) &&
              element.getAttribute("aria-label")?.startsWith(
                "Switch mode, current mode:",
              ),
          );
        if (trigger instanceof HTMLElement) {
          for (const type of ["pointerdown", "pointerup"]) {
            trigger.dispatchEvent(new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              isPrimary: true,
              button: 0,
              pointerType: "mouse",
            }));
          }
        }
        return (await waitFor(itemSelector)) instanceof HTMLElement;
      };
      const findFixtureThreadRow = () =>
        Array.from(
          document.querySelectorAll('[data-app-action-sidebar-thread-row]'),
        ).find(
          (row) =>
            isVisible(row) &&
            row
              .getAttribute('data-app-action-sidebar-thread-title')
              ?.startsWith('ChatGPT Extensions gate fixture '),
        );
      const waitForFixtureThreadRow = async (timeout = 20_000) => {
        const deadline = Date.now() + timeout;
        let row;
        while (!(row instanceof HTMLElement) && Date.now() < deadline) {
          row = findFixtureThreadRow();
          if (!(row instanceof HTMLElement)) await wait();
        }
        return row;
      };
      const enterFixtureThread = async () => {
        const marker = await waitForFixtureThreadRow();
        const target = clickable(marker) ?? marker;
        if (!(target instanceof HTMLElement)) return false;
        const previousLocation = location.href;
        activate(target);
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          if (location.href !== previousLocation) return true;
          await wait();
        }
        return false;
      };
      const suggestionSelector =
        '[data-cgptx-home-suggestion="ui-surface-probe.suggestion"]';
      let suggestionMarker = find(suggestionSelector);
      const suggestionAttempts = [];
      for (
        let attempt = 0;
        !(suggestionMarker instanceof HTMLElement) && attempt < 2;
        attempt += 1
      ) {
        const fixtureTransitioned =
          attempt > 0 ? await enterFixtureThread() : false;
        const previousLocation = location.href;
        const newChat = Array.from(
          document.querySelectorAll('button, a'),
        ).find(
          (element) =>
            element.textContent?.trim() === "New chat" &&
            isVisible(element),
        );
        activate(newChat);
        suggestionMarker = await waitFor(suggestionSelector, 10_000);
        suggestionAttempts.push({
          attempt,
          fixtureTransitioned,
          newChatFound: newChat instanceof HTMLElement,
          locationChanged: location.href !== previousLocation,
          markerCount: document.querySelectorAll(suggestionSelector).length,
          visibleSuggestionSections: Array.from(
            document.querySelectorAll("section"),
          ).filter(
            (section) =>
              isVisible(section) &&
              section.className.includes("home-suggestions"),
          ).length,
          visibleSuggestionButtons: Array.from(
            document.querySelectorAll("button"),
          ).filter(
            (button) =>
              isVisible(button) &&
              button.className.includes("home-suggestion"),
          ).length,
        });
      }
      const results = [];
      results.push(await runAction(
        "suggestion",
        suggestionSelector,
        "home",
      ));
      const announcementSelector =
        '[data-cgptx-home-announcement="ui-surface-probe.announcement"]';
      const announcementMarker = await waitFor(announcementSelector);
      const announcementPrimary = Array.from(
        document.querySelectorAll('button, [role="button"]'),
      ).find((element) => isVisible(element) && element.textContent?.includes("Run probe (0)"));
      const announcementPrimaryFound = announcementMarker instanceof HTMLElement &&
        announcementPrimary instanceof HTMLElement;
      announcementPrimary?.click?.();
      const primaryDeadline = Date.now() + 10_000;
      let currentAnnouncement;
      while (announcementPrimaryFound && Date.now() < primaryDeadline) {
        currentAnnouncement = find(announcementSelector);
        if (currentAnnouncement?.textContent?.includes("run 1")) break;
        await wait();
      }
      results.push({
        name: "announcement-primary",
        state: "home",
        kind: "action",
        found: announcementPrimaryFound,
        clicked: announcementPrimaryFound,
        changed: currentAnnouncement?.textContent?.includes("run 1") === true,
      });
      const dismissMarker =
        currentAnnouncement ?? await waitFor(announcementSelector);
      const dismissButton = Array.from(
        document.querySelectorAll('button, [role="button"]'),
      ).find((element) =>
        isVisible(element) && element.getAttribute("aria-label")?.startsWith("Dismiss probe"),
      );
      const dismissFound = dismissMarker instanceof HTMLElement &&
        dismissButton instanceof HTMLElement;
      dismissButton?.click?.();
      const dismissDeadline = Date.now() + 10_000;
      let absentChecks = 0;
      while (dismissFound && Date.now() < dismissDeadline) {
        absentChecks = document.querySelector(announcementSelector) === null
          ? absentChecks + 1
          : 0;
        if (absentChecks >= 4) break;
        await wait();
      }
      results.push({
        name: "announcement-dismiss",
        state: "home",
        kind: "dismiss",
        found: dismissFound,
        clicked: dismissFound,
        removed: absentChecks >= 4,
      });
      results.push(await runAction(
        "sidebar",
        '[data-cgptx-sidebar-destination="ui-surface-probe.sidebar"]',
        "home",
      ));
      results.push(await runAction(
        "product-menu",
        '[data-cgptx-product-menu-item="ui-surface-probe.product-menu"]',
        "home",
        productMenuOpen,
      ));
      const home = await runComposerState("home", results);

      const threadRowMarker = await waitForFixtureThreadRow();
      const threadRow = clickable(threadRowMarker) ?? threadRowMarker;
      const threadRowFound = threadRow instanceof HTMLElement;
      threadRow?.click?.();
      const threadDeadline = Date.now() + 20_000;
      while (threadRowFound && Date.now() < threadDeadline) {
        if (
          !find('[data-cgptx-home-suggestion="ui-surface-probe.suggestion"]') &&
          find(actionSelector("composer.action-bar.leading"))
        ) break;
        await wait();
      }
      const thread = await runComposerState("thread", results);
      return {
        results,
        states: {
          home: {
            ...home,
            suggestion: {
              attempts: suggestionAttempts,
              markerFound: suggestionMarker instanceof HTMLElement,
            },
          },
          thread: { ...thread, threadRowFound },
        },
      };
    })()`);
    const diagnostics = Object.freeze({
      ...interactionDiagnostics,
      rendererDocumentId: document.id,
      eventFile: uiSurfaceProbeEventFile(document.id),
    });
    const failed = diagnostics?.results?.filter(
      (result) => !uiSurfaceInteractionReady(result),
    );
    writeProbeDiagnostics(
      contents,
      document,
      "ui-surface-diagnostics.json",
      diagnostics,
    );
    const missingStateAttachments = ["home", "thread"].flatMap((state) => {
      const value = diagnostics?.states?.[state];
      return value?.missingActions?.length === 0 &&
        value?.missingRenders?.length === 0 &&
        (state !== "thread" || value?.threadRowFound === true)
        ? []
        : [state];
    });
    if (
      !Array.isArray(diagnostics?.results) ||
      diagnostics.results.length !== 23 ||
      failed.length ||
      missingStateAttachments.length > 0
    ) {
      throw new Error(`The UI surface probe interactions failed: ${JSON.stringify(diagnostics)}`);
    }
    return diagnostics;
  }

  async function waitForPrimaryUiDocument(
    contents,
    document,
    timeoutMilliseconds = 20_000,
  ) {
    const deadline = Date.now() + timeoutMilliseconds;
    const expression = primaryAppShellReadyExpression();
    while (
      rendererLifecycle?.isCurrent(contents, document.id) &&
      Date.now() < deadline
    ) {
      try {
        if (await contents.executeJavaScript(expression)) return true;
      } catch {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  async function waitForThreadColorPersistence(thread, timeoutMilliseconds) {
    const file = path.join(
      launch.storageDirectory,
      "thread-colors",
      "settings.json",
    );
    const deadline = Date.now() + timeoutMilliseconds;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const value = JSON.parse(fs.readFileSync(file, "utf8"));
        const stored = value?.colors?.find(
          (entry) =>
            entry?.thread?.scope === thread.scope &&
            entry.thread.hostId === thread.hostId &&
            entry.thread.threadId === thread.threadId &&
            entry?.selection?.type === "preset" &&
            entry.selection.id === "blue",
        );
        if (stored) return stored;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `Thread Colors did not persist the probe selection (${diagnosticErrorName(lastError)})`,
    );
  }

  async function waitForThreadColorScopePersistence(
    scope,
    timeoutMilliseconds,
  ) {
    const file = path.join(
      launch.storageDirectory,
      "thread-colors",
      "settings.json",
    );
    const deadline = Date.now() + timeoutMilliseconds;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const value = JSON.parse(fs.readFileSync(file, "utf8"));
        const stored = value?.colors?.find(
          (entry) =>
            entry?.thread?.scope === scope &&
            entry?.selection?.type === "preset" &&
            entry.selection.id === "blue",
        );
        if (stored) {
          return Object.freeze({
            scope: stored.thread.scope,
            selection: Object.freeze({
              type: stored.selection.type,
              id: stored.selection.id,
            }),
          });
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `Thread Colors did not persist a ${scope} probe selection (${diagnosticErrorName(lastError)})`,
    );
  }

  async function interactWithProductExtensions(contents, document) {
    const diagnostics = await contents.executeJavaScript(
      "window.__CGPTX_HOST__?._debug?.runProductExtensionProbe?.()",
    );
    const complete = {
      ...diagnostics,
      rendererDocumentId: document.id,
      threadColors: {
        ...diagnostics?.threadColors,
        stored: await waitForThreadColorPersistence(
          {
            scope: "execution",
            hostId: "local",
            threadId: "chatgptx-product-extension-probe",
          },
          10_000,
        ),
      },
    };
    writeProbeDiagnostics(
      contents,
      document,
      "product-extension-diagnostics.json",
      complete,
    );
    if (!productExtensionDiagnosticsReady(complete)) {
      throw new Error(
        `Product extension interactions failed: ${JSON.stringify(complete)}`,
      );
    }
    return complete;
  }

  async function interactWithProductExtensionsRealUi(contents, document) {
    let diagnostics;
    try {
      diagnostics = await contents.executeJavaScript(
        "window.__CGPTX_HOST__?._debug?.runProductExtensionRealUiProbe?.()",
      );
    } catch (error) {
      const failure = productExtensionRealUiFailureDiagnostics(
        document.id,
        error,
      );
      writeProbeDiagnostics(
        contents,
        document,
        "product-extension-real-ui-diagnostics.json",
        failure,
      );
      throw new Error("The real product extension UI probe failed");
    }
    const cloudStored = await waitForThreadColorScopePersistence(
      "cloud",
      10_000,
    );
    const complete = {
      ...diagnostics,
      rendererDocumentId: document.id,
      threadColors: {
        ...diagnostics?.threadColors,
        stored: await waitForThreadColorPersistence(
          diagnostics?.thread ?? {},
          10_000,
        ),
        cloud: {
          ...diagnostics?.threadColors?.cloud,
          stored: cloudStored,
        },
      },
    };
    const safeComplete = sanitizeProductExtensionRealUiDiagnostics(complete);
    writeProbeDiagnostics(
      contents,
      document,
      "product-extension-real-ui-diagnostics.json",
      safeComplete,
    );
    if (!safeComplete.validationPassed) {
      throw new Error(
        `Real product extension UI interactions failed: ${JSON.stringify(safeComplete)}`,
      );
    }
    return safeComplete;
  }

  function digestFile(file) {
    const previous = process.noAsar;
    try {
      process.noAsar = true;
      return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    } finally {
      process.noAsar = previous;
    }
  }

  function bundleRoot() {
    return path.dirname(path.dirname(process.execPath));
  }

  function appBuild() {
    return execFileSync(
      "/usr/bin/plutil",
      ["-extract", "CFBundleVersion", "raw", path.join(bundleRoot(), "Info.plist")],
      { encoding: "utf8" },
    ).trim();
  }

  function publicApiDigest() {
    const apiRoot = path.join(__dirname, "..", "APIs");
    const files = fs
      .readdirSync(apiRoot)
      .filter((name) => name.endsWith(".d.ts"))
      .sort();
    const hash = crypto.createHash("sha256");
    for (const name of files) {
      hash.update(name);
      hash.update("\0");
      hash.update(fs.readFileSync(path.join(apiRoot, name)));
      hash.update("\0");
    }
    return hash.digest("hex");
  }

  function wrapperSource(extension, phase, entryFile) {
    const code = fs.readFileSync(entryFile, "utf8");
    const identity = {
      id: extension.id,
      version: extension.version,
      manifestDigest: extension.manifestDigest,
    };
    const section =
      phase === "settings" ? JSON.stringify(extension.settingsSectionId) : "undefined";
    return `
(() => {
  "use strict";
  const module = { exports: {} };
  const exports = module.exports;
  ((module, exports) => {
${code}
  })(module, exports);
  return window.__CHATGPTX_V5_RENDERER_HOST__.registerRendererEntry(
    ${JSON.stringify(identity)},
    ${JSON.stringify(phase)},
    module.exports,
    ${section}
  );
})()
//# sourceURL=chatgptx-v5://${extension.id}/${phase}.cjs
`;
  }

  function rendererEntries() {
    const entries = [];
    for (const extension of launch.extensions) {
      if (extension.enabled && extension.renderer) {
        entries.push({
          extension,
          phase: "renderer",
          source: wrapperSource(extension, "renderer", extension.renderer),
        });
      }
    }
    for (const extension of launch.extensions) {
      if (extension.settings) {
        entries.push({
          extension,
          phase: "settings",
          source: wrapperSource(extension, "settings", extension.settings),
        });
      }
    }
    return entries;
  }

  async function injectIntoContents(contents, entries, document) {
    const { url } = document;
    if (!rendererLifecycle?.isCurrent(contents, document.id)) return;
    try {
      if (
        productExtensionProbeRequested ||
        productExtensionRealUiProbeRequested
      ) {
        await contents.executeJavaScript(`Object.defineProperty(
          window,
          "__CGPTX_V5_TEST_MODE__",
          {
            configurable: true,
            value: Object.freeze({
              productExtensionProbe: ${productExtensionProbeRequested},
              productExtensionRealUiProbe: ${productExtensionRealUiProbeRequested},
            }),
          },
        ); true`);
      }
      await contents.executeJavaScript(hostSource);
      if (!rendererLifecycle.isCurrent(contents, document.id)) return;
      const hostReady = await contents.executeJavaScript(
        rendererHostReadyExpression(launch.appVersion),
      );
      if (!hostReady) throw new Error("The exact binding host did not initialize");
      if (!rendererLifecycle.isCurrent(contents, document.id)) return;
      const nativeReady = await contents.executeJavaScript(
        "Promise.resolve(window.__CGPTX_NATIVE_READY__).then((value) => value === true)",
      );
      if (!nativeReady) {
        const nativeBindingError = await contents.executeJavaScript(
          "window.__CGPTX_HOST__?._debug?.nativeBindingError?.() ?? null",
        );
        const documentState = await contents.executeJavaScript(`(() => {
          const elements = Array.from(document.body?.querySelectorAll("*") ?? []);
          return {
            readyState: document.readyState,
            bodyChildren: document.body?.children.length ?? 0,
            elements: elements.length,
            reactFiberElements: elements.filter((element) =>
              Object.keys(element).some((key) => key.startsWith("__reactFiber$")),
            ).length,
          };
        })()`);
        throw new Error(
          nativeBindingError
            ? `The exact native binding reported an error; document=${JSON.stringify(documentState)}`
            : `The exact native binding did not initialize; document=${JSON.stringify(documentState)}`,
        );
      }
      if (!rendererLifecycle.isCurrent(contents, document.id)) return;
      await contents.executeJavaScript(rendererHostSource);
      const runtimeReady = await contents.executeJavaScript(
        "Boolean(window.__CHATGPTX_V5_RENDERER_HOST__?.registerRendererEntry)",
      );
      if (!runtimeReady) throw new Error("The v5 renderer host did not initialize");
    } catch (error) {
      if (!isCurrentRendererDocument(rendererLifecycle, contents, document)) {
        return;
      }
      log("renderer-host-injection-failed", {
        webContentsId: contents.id,
        documentId: document.id,
        appPage: typeof url === "string" && url.startsWith("app:"),
        errorName: diagnosticErrorName(error),
      });
      return;
    }

    for (const entry of entries) {
      if (!rendererLifecycle.isCurrent(contents, document.id)) return;
      try {
        const result = await contents.executeJavaScript(entry.source);
        if (result !== true) throw new Error("The renderer entry did not register");
        log("renderer-entry-registered", {
          id: entry.extension.id,
          phase: entry.phase,
          webContentsId: contents.id,
          documentId: document.id,
          packageDirectory: entry.extension.packageDirectory,
        });
      } catch (error) {
        if (!isCurrentRendererDocument(rendererLifecycle, contents, document)) {
          return;
        }
        log("renderer-entry-registration-failed", {
          id: entry.extension.id,
          phase: entry.phase,
          webContentsId: contents.id,
          documentId: document.id,
          errorName: diagnosticErrorName(error),
        });
      }
    }
    const primaryUiDocument = liveProbeSuiteRequested
      ? await waitForPrimaryUiDocument(contents, document)
      : false;
    if (!isCurrentRendererDocument(rendererLifecycle, contents, document)) {
      return;
    }
    const ownsLiveProbeSuite = liveProbeSuiteClaim.claim(
      document.id,
      primaryUiDocument,
    );
    if (richContentProbeRequested && ownsLiveProbeSuite) {
      const probeDocument = Object.freeze({
        rendererDocumentId: document.id,
        eventFile: richMessageProbeEventFile(document.id),
      });
      let diagnostics = {
        ...probeDocument,
        stage: "registration-readiness",
      };
      try {
        diagnostics = {
          ...probeDocument,
          ...(await waitForRichContentDiagnostics(
            contents,
            document,
            (value) => richContentRegistrationsReady(value?.registrations),
            10_000,
          )),
          stage: "registration-readiness",
        };
        if (!richContentRegistrationsReady(diagnostics.registrations)) {
          throw new Error(
            `The rich-content registrations were not ready: ${JSON.stringify(diagnostics)}`,
          );
        }
        const mounted = await contents.executeJavaScript(
          "window.__CGPTX_HOST__?._debug?.mountRichContentProbe?.() === true",
        );
        diagnostics = {
          ...probeDocument,
          ...diagnostics,
          mounted,
          stage: "owner-render",
        };
        if (!mounted) {
          throw new Error("The exact rich-content probe did not mount");
        }
        diagnostics = await waitForRichContentDiagnostics(
          contents,
          document,
          richContentOwnersReady,
          10_000,
        );
        const cloudWarmup = Object.freeze({
          ready: diagnostics?.cloudOwnerReady === true,
          navigated: false,
          source: "first-party-cloud-conversation-turn",
        });
        diagnostics = {
          ...probeDocument,
          ...diagnostics,
          mounted: true,
          cloudWarmup,
          stage: "mounted",
        };
        if (!richContentOwnersReady(diagnostics)) {
          throw new Error(
            `The exact rich-content owners did not render: ${JSON.stringify(diagnostics)}`,
          );
        }
        const interactions = await interactWithRichContentProbe(
          contents,
          document,
        );
        diagnostics = {
          ...probeDocument,
          ...(await readRichContentDiagnostics(contents)),
          mounted: true,
          cloudWarmup,
          interactions,
          stage: "interacted",
        };
        writeProbeDiagnostics(
          contents,
          document,
          "rich-content-interaction-diagnostics.json",
          { interactions },
        );
        if (!richContentInteractionsReady(interactions)) {
          throw new Error(
            `The rich-content controls did not activate: ${JSON.stringify(interactions)}`,
          );
        }
        writeProbeDiagnostics(
          contents,
          document,
          "rich-content-diagnostics.json",
          diagnostics,
        );
        log("rich-content-probe-mounted", {
          webContentsId: contents.id,
          documentId: document.id,
          diagnostics,
        });
        const unmountCompletion = startRichContentProbeUnmountPoller(
          contents,
          document,
          diagnostics,
        );
        if (
          !(await probeCompletionAllowsContinuation(
            unmountCompletion,
            rendererLifecycle,
            contents,
            document,
          ))
        ) {
          return;
        }
      } catch (error) {
        if (!isCurrentRendererDocument(rendererLifecycle, contents, document)) {
          return;
        }
        diagnostics = {
          ...diagnostics,
          errorName: diagnosticErrorName(error),
        };
        writeProbeDiagnostics(
          contents,
          document,
          "rich-content-diagnostics.json",
          diagnostics,
        );
        log("rich-content-probe-failed", {
          webContentsId: contents.id,
          documentId: document.id,
          diagnostics,
          errorName: diagnosticErrorName(error),
        });
        throw error;
      }
    } else if (richContentProbeRequested) {
      log("rich-content-probe-skipped", {
        webContentsId: contents.id,
        documentId: document.id,
        primaryUiDocument,
        claimedDocumentId: liveProbeSuiteClaim.current(),
      });
    }
    if (uiSurfaceProbeRequested && ownsLiveProbeSuite) {
      try {
        const diagnostics = await interactWithUiSurfaceProbe(contents, document);
        log("ui-surface-probe-passed", {
          webContentsId: contents.id,
          documentId: document.id,
          diagnostics,
        });
      } catch (error) {
        if (!isCurrentRendererDocument(rendererLifecycle, contents, document)) {
          return;
        }
        log("ui-surface-probe-failed", {
          webContentsId: contents.id,
          documentId: document.id,
          errorName: diagnosticErrorName(error),
        });
        throw error;
      }
    } else if (uiSurfaceProbeRequested) {
      log("ui-surface-probe-skipped", {
        webContentsId: contents.id,
        documentId: document.id,
        primaryUiDocument,
        claimedDocumentId: liveProbeSuiteClaim.current(),
      });
    }
    if (productExtensionProbeRequested && ownsLiveProbeSuite) {
      try {
        const diagnostics = await interactWithProductExtensions(
          contents,
          document,
        );
        log("product-extension-probe-passed", {
          webContentsId: contents.id,
          documentId: document.id,
          diagnostics,
        });
      } catch (error) {
        if (!isCurrentRendererDocument(rendererLifecycle, contents, document)) {
          return;
        }
        log("product-extension-probe-failed", {
          webContentsId: contents.id,
          documentId: document.id,
          errorName: diagnosticErrorName(error),
        });
        throw error;
      }
    } else if (productExtensionProbeRequested) {
      log("product-extension-probe-skipped", {
        webContentsId: contents.id,
        documentId: document.id,
        primaryUiDocument,
        claimedDocumentId: liveProbeSuiteClaim.current(),
      });
    }
    if (productExtensionRealUiProbeRequested && ownsLiveProbeSuite) {
      try {
        const diagnostics = await interactWithProductExtensionsRealUi(
          contents,
          document,
        );
        log("product-extension-real-ui-probe-passed", {
          webContentsId: contents.id,
          documentId: document.id,
          diagnostics,
        });
      } catch (error) {
        if (!isCurrentRendererDocument(rendererLifecycle, contents, document)) {
          return;
        }
        log("product-extension-real-ui-probe-failed", {
          webContentsId: contents.id,
          documentId: document.id,
          errorName: diagnosticErrorName(error),
        });
        throw error;
      }
    } else if (productExtensionRealUiProbeRequested) {
      log("product-extension-real-ui-probe-skipped", {
        webContentsId: contents.id,
        documentId: document.id,
        primaryUiDocument,
        claimedDocumentId: liveProbeSuiteClaim.current(),
      });
    }
    log("renderer-injected", {
      appPage: typeof url === "string" && url.startsWith("app:"),
      webContentsId: contents.id,
      documentId: document.id,
      entries: entries.map((entry) => `${entry.extension.id}:${entry.phase}`),
    });
  }

  const originalLoad = Module._load;
  let electronWrapper;
  Module._load = function (request, parent, isMain) {
    const loaded = originalLoad.call(this, request, parent, isMain);
    if (request !== "electron") return loaded;
    if (electronWrapper) return electronWrapper;
    try {
      electronWrapper = patchElectron(loaded) ?? undefined;
    } catch (error) {
      log("electron-patch-failed", {
        errorName: diagnosticErrorName(error),
      });
    }
    return electronWrapper ?? loaded;
  };

  function patchElectron(electron) {
    electronNamespace = electron;
    log("electron-intercepted");
    const { app, BrowserWindow, ipcMain, session, webContents } = electron;
    if (!app || !BrowserWindow || !ipcMain || !session || !webContents) {
      return undefined;
    }

    const version = app.getVersion();
    let build;
    let asarDigest;
    try {
      build = appBuild();
      const asarFile = path.join(process.resourcesPath, "app.asar");
      asarDigest = digestFile(asarFile);
      if (
        version !== launch.appVersion ||
        build !== launch.appBuild ||
        asarDigest !== launch.appAsarSha256
      ) {
        throw new Error(
          `Exact build mismatch: ${version} (${build}) ${asarDigest}`,
        );
      }
      log("exact-build-verified", { version, build, asarDigest });
    } catch (error) {
      log("exact-build-mismatch", {
        errorName: diagnosticErrorName(error),
      });
      return undefined;
    }

    const entries = rendererEntries();
    const preloadFile = path.join(__dirname, "preload.cjs");

    rendererLifecycle = createRendererLifecycle({
      createDocumentId: () => `document:${crypto.randomUUID()}`,
      windowId(contents) {
        const owner = BrowserWindow.fromWebContents(contents);
        return owner ? `window:${owner.id}` : `window:contents-${contents.id}`;
      },
      isEligible: (url) => url.startsWith("app:"),
      inject: (contents, document) =>
        injectIntoContents(contents, entries, document),
      connect(document) {
        if (!mainHost?.rendererConnected) return false;
        mainHost.rendererConnected(document);
        return true;
      },
      disconnect(documentId, reason) {
        try {
          stopRichContentProbePoller(documentId);
          liveProbeSuiteClaim.release(documentId);
          mainHost?.rendererDisconnected?.(documentId);
        } finally {
          log("renderer-document-inactive", { documentId, reason });
        }
      },
      onError(phase, contents, error) {
        log(`renderer-channel-${phase}-failed`, {
          webContentsId: contents.id,
          errorName: diagnosticErrorName(error),
        });
      },
    });

    function appSender(event) {
      const url = event.senderFrame?.url ?? event.sender.getURL();
      if (!url.startsWith("app:")) {
        throw new Error("ChatGPTX runtime requests are limited to app pages");
      }
      return url;
    }

    function senderDocument(event, documentId) {
      appSender(event);
      return requireCurrentRendererDocument(
        rendererLifecycle,
        event.sender,
        documentId,
      );
    }

    function selectedExtension(extensionId) {
      const extension = extensionById.get(extensionId);
      if (!extension) throw new Error("Unknown extension context");
      return extension;
    }

    const extensionManagement = Object.freeze({
      async list(callerExtensionId) {
        selectedExtension(callerExtensionId);
        return installedExtensions(launch);
      },
      async setEnabled(callerExtensionId, targetExtensionId, enabled) {
        selectedExtension(callerExtensionId);
        launch = setExtensionEnabled(
          launch,
          targetExtensionId,
          enabled,
        );
        extensionById.clear();
        for (const extension of launch.extensions) {
          extensionById.set(extension.id, extension);
        }
        log("extension-enablement-changed", {
          caller: callerExtensionId,
          id: targetExtensionId,
          enabled,
        });
        return installedExtensions(launch);
      },
    });

    function runtimeInfo(extension, document) {
      const windows = BrowserWindow.getAllWindows().map((window) => ({
        id: `window:${window.id}`,
        kind: "primary",
      }));
      return {
        apiVersion: launch.apiVersion,
        appVersion: version,
        appBuild: build,
        electronVersion: process.versions.electron,
        chromiumVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
        nodeModuleAbi: process.versions.modules,
        ...(process.versions.napi ? { nodeApiVersion: process.versions.napi } : {}),
        objcJsVersion: "1.5.0",
        architecture: process.arch,
        platform: "macos",
        binding: {
          adapterVersion: launch.binding.adapterVersion,
          targetAppVersion: launch.appVersion,
          targetAppBuild: launch.appBuild,
          adapterDigest: hostSourceDigest,
          publicApiDigest: publicApiDigest(),
          evidenceDigest: crypto
            .createHash("sha256")
            .update(
              fs.readFileSync(
                path.join(__dirname, "..", "APIs", "builds", `${launch.appVersion}.md`),
              ),
            )
            .digest("hex"),
        },
        extension: {
          id: extension.id,
          version: extension.version,
          manifestDigest: extension.manifestDigest,
          instanceId: `${extension.id}:renderer:${document.id}`,
        },
        hosts: [],
        windows,
      };
    }

    ipcMain.on("chatgptx:v5:renderer-bootstrap", (event) => {
      try {
        const url = appSender(event);
        event.returnValue = {
          hostSource,
          document: rendererLifecycle.beginDocument(event.sender, url),
        };
      } catch {
        event.returnValue = null;
      }
    });
    ipcMain.on(
      "chatgptx:v5:renderer-bootstrap-error",
      (event, documentId, error) => {
        try {
          const url = appSender(event);
          if (
            typeof documentId !== "string" ||
            !rendererLifecycle.isCurrent(event.sender, documentId)
          ) {
            return;
          }
          log("renderer-bootstrap-error", {
            appPage: typeof url === "string" && url.startsWith("app:"),
            errorName: diagnosticErrorName(error),
          });
        } catch {}
      },
    );
    ipcMain.on("chatgptx:v5:renderer-pagehide", (event, documentId) => {
      rendererLifecycle.pageHidden(event.sender, documentId);
    });

    ipcMain.handle("chatgptx:v5:runtime", async (event, request) => {
      const document = senderDocument(event, request?.documentId);
      const method = request?.method;
      const parameters = request?.parameters ?? {};
      const extensionId = parameters.extensionId;
      switch (method) {
        case "extension-storage.list":
          selectedExtension(extensionId);
          return storage.listFiles(extensionId);
        case "extension-storage.read-text":
          selectedExtension(extensionId);
          return storage.readTextFile(extensionId, parameters.path);
        case "extension-storage.write-text":
          selectedExtension(extensionId);
          return storage.writeTextFile(
            extensionId,
            parameters.path,
            parameters.contents,
          );
        case "extension-storage.delete":
          selectedExtension(extensionId);
          return storage.deleteFile(extensionId, parameters.path);
        case "extensions.list":
          return extensionManagement.list(extensionId);
        case "extensions.set-enabled":
          return extensionManagement.setEnabled(
            extensionId,
            parameters.targetExtensionId,
            parameters.enabled,
          );
        case "runtime.info": {
          const extension = selectedExtension(extensionId);
          return runtimeInfo(extension, document);
        }
        case "renderer-entry.report": {
          const extension = selectedExtension(extensionId);
          const key = `${document.id}:${extension.id}:${parameters.phase}`;
          activationReports.set(key, parameters.status);
          log("renderer-entry-activation", {
            id: extension.id,
            phase: parameters.phase,
            status: parameters.status,
            webContentsId: event.sender.id,
            documentId: document.id,
            ...(parameters.error ? { errorName: "Error" } : {}),
          });
          return null;
        }
        default:
          if (mainHost?.handleRendererRequest) {
            return mainHost.handleRendererRequest(
              method,
              parameters,
              document,
              event.sender,
            );
          }
          throw new Error(`Unknown ChatGPTX runtime method: ${String(method)}`);
      }
    });

    app.whenReady().then(() => {
      log("app-ready", { version, build });
      try {
        if (typeof require("./main-extension-host.cjs").createMainExtensionHost === "function") {
          const { createMainExtensionHost } = require("./main-extension-host.cjs");
          const appRequire = Module.createRequire(
            path.join(process.resourcesPath, "app.asar", "package.json"),
          );
          const objc = appRequire("objc-js");
          const mainHostLaunch = Object.freeze({
            ...launch,
            binding: Object.freeze({
              ...launch.binding,
              hostDigest: hostSourceDigest,
            }),
          });
          mainHost = createMainExtensionHost({
            electron,
            launch: mainHostLaunch,
            objc,
            storage,
            extensions: extensionManagement,
            publicApiDigest: publicApiDigest(),
            evidenceDigest: crypto
              .createHash("sha256")
              .update(
                fs.readFileSync(
                  path.join(
                    __dirname,
                    "..",
                    "APIs",
                    "builds",
                    `${launch.appVersion}.md`,
                  ),
                ),
              )
              .digest("hex"),
            onError(error, detail) {
              log("main-extension-error", {
                extensionId:
                  typeof detail?.extensionId === "string"
                    ? detail.extensionId
                    : "invalid-extension",
                phase:
                  typeof detail?.phase === "string"
                    ? detail.phase
                    : "unknown",
                errorName: diagnosticErrorName(error),
              });
            },
            sendRendererEvent(rendererId, message) {
              const contents = rendererLifecycle.contentsForDocument(rendererId);
              contents?.send("chatgptx:v5:main-event", message);
            },
          });
        }
      } catch (error) {
        log("main-extension-host-failed", {
          errorName: diagnosticErrorName(error),
        });
      }

      startRendererLifecycle({
        app,
        webContents,
        lifecycle: rendererLifecycle,
        ...(mainHost?.activate
          ? { activateMain: () => mainHost.activate() }
          : {}),
        onActivated: (results) =>
          log("main-extensions-activated", {
            results: safeMainActivationResults(results),
          }),
        onActivationError: (error) =>
          log("main-extension-host-failed", {
            errorName: diagnosticErrorName(error),
          }),
      });
    });

    app.on("before-quit", () => {
      try {
        mainHost?.shutdown?.();
      } catch (error) {
        log("main-extension-shutdown-failed", {
          errorName: diagnosticErrorName(error),
        });
      }
    });

    const OriginalBrowserWindow = BrowserWindow;
    const PatchedBrowserWindow = class extends OriginalBrowserWindow {
      constructor(options) {
        const preferences = options?.webPreferences ?? {};
        const targetSession =
          preferences.session ??
          (preferences.partition
            ? session.fromPartition(preferences.partition)
            : session.defaultSession);
        const preloads = targetSession.getPreloads();
        if (!preloads.includes(preloadFile)) {
          targetSession.setPreloads([...preloads, preloadFile]);
        }
        super(options);
        log("window-created", { preload: preloadFile });
      }
    };
    Object.setPrototypeOf(PatchedBrowserWindow, OriginalBrowserWindow);

    const descriptor = Object.getOwnPropertyDescriptor(electron, "BrowserWindow");
    if (descriptor?.configurable) {
      Object.defineProperty(electron, "BrowserWindow", {
        ...descriptor,
        get: () => PatchedBrowserWindow,
      });
      return undefined;
    }
    const wrapper = Object.create(Object.getPrototypeOf(electron));
    for (const key of Reflect.ownKeys(electron)) {
      const value = Object.getOwnPropertyDescriptor(electron, key);
      if (!value) continue;
      Object.defineProperty(
        wrapper,
        key,
        key === "BrowserWindow" ? { ...value, get: () => PatchedBrowserWindow } : value,
      );
    }
    return wrapper;
  }
}

module.exports = Object.freeze({
  createPrimaryDocumentClaim,
  createRendererLifecycle,
  isCurrentRendererDocument,
  primaryAppShellReadyExpression,
  productExtensionRealUiFailureDiagnostics,
  probeCompletionAllowsContinuation,
  requireCurrentRendererDocument,
  rendererHostReadyExpression,
  productExtensionDiagnosticsReady,
  productExtensionRealUiDiagnosticsReady,
  sanitizeProductExtensionRealUiDiagnostics,
  richContentFallbacksReady,
  richContentFullyUnmounted,
  richContentInteractionScript,
  richContentInteractionsReady,
  richContentOwnersReady,
  richContentRegistrationsReady,
  richContentUnmountRequested,
  richContentUnmountDiagnostics,
  richMessageProbeEventFile,
  startRendererLifecycle,
  uiSurfaceInteractionReady,
  uiSurfaceProbeEventFile,
  writeCurrentRendererDocumentDiagnostics,
});
