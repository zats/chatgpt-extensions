import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import patchModule from "./host-source-patch.cjs";

const { isPrimaryWindowOptions, patchBindingHostSource } = patchModule;

test("exact window appearance mapping selects only ChatGPT primary windows", () => {
  assert.equal(
    isPrimaryWindowOptions({ webPreferences: { scrollBounce: true } }),
    true,
  );
  assert.equal(
    isPrimaryWindowOptions({ webPreferences: { scrollBounce: false } }),
    false,
  );
  assert.equal(isPrimaryWindowOptions({ webPreferences: {} }), false);
  assert.equal(isPrimaryWindowOptions(undefined), false);
});

const fiberOfSource = `  function fiberOf(node) {
    const key = Object.keys(node).find((candidate) =>
      candidate.startsWith("__reactFiber$"),
    );
    return key ? node[key] : null;
  }`;

const sameThreadContextSource = `  function sameThreadContext(left, right) {
    return (
      left?.threadId === right?.threadId &&
      left?.title === right?.title &&
      left?.workingDirectory === right?.workingDirectory
    );
  }`;

const clearCurrentThreadSource = `  function clearCurrentThreadAfterUnmount(threadId) {
    const generation = ++currentThreadClearGeneration;
    queueMicrotask(() => {
      if (
        generation !== currentThreadClearGeneration ||
        currentThread?.threadId !== threadId
      ) {
        return;
      }
      currentThread = undefined;
      emitCurrentThreadChange();
    });
  }`;

const threadListContextSource = `  function threadListContextFromRow(row) {
    const scopedId = row.getAttribute("data-app-action-sidebar-thread-id");
    const separator = scopedId?.lastIndexOf(":") ?? -1;
    if (separator < 1 || separator === scopedId.length - 1) return null;
    return Object.freeze({
      threadId: scopedId.slice(separator + 1),
      title: row.getAttribute("data-app-action-sidebar-thread-title") ?? "",
    });
  }`;

const threadMenuContextSource = `    function threadContextForMenuProps(props) {
      const threadId = props.conversationId;
      const row = Array.from(
        document.querySelectorAll("[data-app-action-sidebar-thread-row]"),
      ).find((candidate) =>
        candidate
          .getAttribute("data-app-action-sidebar-thread-id")
          ?.endsWith(\`:\${threadId}\`),
      );
      const title =
        typeof props.title === "string"
          ? props.title
          : row?.getAttribute("data-app-action-sidebar-thread-title") ?? "";
      return Object.freeze({
        threadId,
        title,
        ...(typeof props.cwd === "string" && props.cwd.length > 0
          ? { workingDirectory: props.cwd }
          : {}),
      });
    }`;

const threadMenuBoundarySource = `    function ThreadMenuBoundary({ child }) {
      threadMenuBoundaryRenderCount += 1;
      const intl = native.useIntl();
      React.useSyncExternalStore(
        subscribeThreadMenu,
        () => threadMenuRenderVersion,
        () => threadMenuRenderVersion,
      );
      const context = threadContextForMenuProps(child.props);
      React.useLayoutEffect(() => {
        setCurrentThread(context);
        return () => clearCurrentThreadAfterUnmount(context.threadId);
      }, [context.threadId, context.title, context.workingDirectory]);
      return renderThreadTree(child.type(child.props), context, intl);
    }`;

const nativeExportsSource = `      useIntl: appInitialModule.c2t,
      useScope: appInitialModule.GUt,
      ApplicationScope: appInitialModule.Ezt,`;

const structuralAnchorFiller = `
  const TOOLBAR_BREADCRUMB_MODULE =
    "./assets/toolbar-breadcrumb-Ccjk7MhE.js";
  const EXTENSIONS_SETTINGS_PANE_ID = "extensions.installed";

  const transformers = [];
  const assistantSelectionTransformers = [];

  async function installNativeBinding() {

    function useNativePostAuthenticationRefresh() {
      nativeApplicationScope = native.useScope(native.ApplicationScope);

      settingsVisibilityModule,
      settingsLoadingModule,
      toolbarBreadcrumbModule,
    ] = await Promise.all([

      import(SETTINGS_VISIBILITY_MODULE),
      import(SETTINGS_LOADING_MODULE),
      import(TOOLBAR_BREADCRUMB_MODULE),
    ]);

    toolbarBreadcrumbModule.n();
    plusIconModule.t();

      ThreadMenu: threadMenuModule.t,
      ColorPicker: appInitialModule.us,
      startChatGptSignIn: authModule.o,

        ["settings", appInitialModule.bot],

      appearance: makeAppearanceApi(extId),
      settings: makeSettingsApi(extId),
    });

        if (isAssistantSelectionPositioner(type, props)) {
          props = wrapAssistantSelectionPositionerProps(props);
        }

    props["data-cgptx-id"] = item.id;
    props["data-cgptx-origin"] = item.origin ?? "";
    props["data-cgptx-thread-id"] = model.context.threadId;

    if (item.icon !== undefined) props.LeftIcon = resolveThreadIcon(item.icon);

      props["data-cgptx-id"] = item.id;
      props["data-cgptx-origin"] = item.origin ?? "";
      props["data-cgptx-thread-id"] = model.context.threadId;
      if (item.icon !== undefined) props.LeftIcon = resolveThreadIcon(item.icon);

          {
            ...trigger.props,
            "data-cgptx-thread-id": context.threadId,
          },
          trigger.key ?? undefined,
        )
      : trigger;
    const rootProps = {

  function threadIdForTrigger(trigger) {
    return (
      trigger?.getAttribute?.("data-cgptx-thread-id") ??
      fiberPropAbove(trigger, "data-cgptx-thread-id") ??
      null
    );
  }

  function threadMenuTrigger(threadId) {
    return (
      Array.from(document.querySelectorAll("button")).find(
        (button) => threadIdForTrigger(button) === threadId,
      ) ?? null
    );
  }

  function visibleThreadMenuColumn(threadId) {
    const columns = Array.from(document.querySelectorAll('[role="menu"]'));
    return (
      columns.find((column) => {
        if (column.offsetHeight === 0) return false;
        const labelledBy = column.getAttribute("aria-labelledby");
        const trigger = labelledBy ? document.getElementById(labelledBy) : null;
        if (threadIdForTrigger(trigger) === threadId) return true;
        return Array.from(column.querySelectorAll('[role="menuitem"]')).some(
          (row) =>
            row.getAttribute("data-cgptx-thread-id") === threadId ||
            fiberPropAbove(row, "data-cgptx-thread-id") === threadId,
        );
      }) ?? null
    );
  }

      const column = visibleThreadMenuColumn(model.context.threadId);

      if (view && builtIn?.onClick === item.onClick) {
        raw.onClick = view.raw.onClick;
        raw.onSelect = view.raw.onSelect;
      } else {
        delete raw.onSelect;
        if (typeof item.onClick === "function") raw.onClick = item.onClick;
        else delete raw.onClick;
      }

  function rawThreadItems(model) {
    const effective = computeEffectiveThreadItems(model);
    const builtIns = deepItemsById(model.builtInCache);
    model.renderEntriesByRawId = new Map();
    for (const key of Object.keys(model.renderShortcuts)) {
      delete model.renderShortcuts[key];
    }
    Object.assign(model.renderShortcuts, model.stockShortcuts);
    return effective.map((item) => rawThreadItem(model, item, builtIns));
  }

      registerItem(provider) {
        if (typeof provider !== "function") {
          throw new TypeError("thread-list registerItem requires a function");
        }
        const registration = {
          extId,
          provider,
          cache: new Map(),
        };

  function renderGenericThreadMenu(tree, context, intl) {
    threadMenuAdapterRenderCount += 1;
    const sourceItems = () => synchronousThreadItems(tree.props.getItems);
    let model = updateGenericThreadModel(
      context,
      sourceItems(),
      tree.props.shortcuts,
      intl,
    );
    const items = rawThreadItems(model);
    const shortcuts = model.renderShortcuts;
    const getItems = () => {
      model = updateGenericThreadModel(
        context,
        sourceItems(),
        tree.props.shortcuts,
        intl,
      );
      return rawThreadItems(model);
    };

          {
            ...trigger.props,
            "data-cgptx-thread-id": context.threadId,
          },
          trigger.key ?? undefined,
        )
      : trigger;
    return native.jsx(
      tree.type,

      },
      context.threadId,
    );
  }

  function decorateGenericThreadItem(type, props, key) {

      "data-cgptx-origin": item.origin ?? "",
      "data-cgptx-thread-id": model.context.threadId,
    };
    if (item.kind === "separator") return next;

        if (pendingThreadExpanded) {
          const threadColumn = visibleThreadMenuColumn(
            pendingThreadExpanded.threadId,
          );

      getItems(threadId) {
        const model = threadModels.get(threadId);
        return model ? computeEffectiveThreadItems(model) : Object.freeze([]);
      },

      activateItem(threadId, id) {
        const model = threadModels.get(threadId);
        if (!model) return false;

        if (Array.isArray(item.items) && item.items.length > 0) {
          const column = visibleThreadMenuColumn(threadId);
          const row = threadRowById(column, id);
          if (row) {
            requestThreadFlyout(row);
            return true;
          }
          const trigger = threadMenuTrigger(threadId);
          if (!trigger) return false;
          pendingThreadExpanded = { threadId, id };
          pressTrigger(trigger);
          return true;
        }

      computeEffectiveThreadItems: (threadId) => {
        const model = threadModels.get(threadId);
        return model ? computeEffectiveThreadItems(model) : Object.freeze([]);
      },
      visibleThreadMenuColumn,

      captureDynamicThreadItemsFromOpenMenus,
      nativeReady: () => nativeBindingInstalled,
      nativeBindingError: () => nativeBindingError,

        if (
          (type === native.ThreadMenu || isRemoteThreadMenu(type, props)) &&
          typeof props?.conversationId === "string" &&
          props.conversationId.length > 0
        ) {

    settingsPageCaptureContext = native.React.createContext(null);
    assistantSelectionPositionContext = native.React.createContext(null);
    installJsxHook();`;

function fixtureSource() {
  return `"use strict";
return (() => {
  let currentThread;
  let currentThreadClearGeneration = 0;
  const layoutCleanups = [];
  let activeAssistantSelectionModel = null;
  let assistantSelectionPositionContext = null;
  let pendingResponseAnnotationCreation = null;
  const threadTransformers = [];
  const threadListRegistrations = [];
  const threadModels = new Map();
  /* Exact-host structural anchors that this focused fixture does not execute.
${structuralAnchorFiller}
  */
${sameThreadContextSource}
${fiberOfSource}
  function emitCurrentThreadChange() {}
  function setCurrentThread(context) {
    currentThreadClearGeneration += 1;
    if (sameThreadContext(currentThread, context)) return;
    currentThread = context;
    emitCurrentThreadChange();
  }
${clearCurrentThreadSource}
  function synchronizeOpaqueThreadCache() {}
  function freezeItems(items) { return Object.freeze([...items]); }
  function normalizeThreadTransformOutput(_model, _items, output) {
    return output;
  }
  function warn() {}
  function computeEffectiveThreadItems(model) {
    synchronizeOpaqueThreadCache(model);
    let items = model.builtInCache;
    for (const { extId, transform } of threadTransformers) {
      try {
        const output = transform(items, model.context);
        if (!Array.isArray(output)) {
          warn(
            "thread-menu transformer from " +
              extId +
              " returned a non-array; skipped",
          );
          continue;
        }
        items = freezeItems(
          normalizeThreadTransformOutput(model, items, output, extId),
        );
      } catch (error) {
        warn("thread-menu transformer from " + extId + " threw; skipped", error);
      }
    }
    return items;
  }
  function normalizeThreadListItem(item) { return item; }
  function computeThreadListItems(context) {
    const items = [];
    for (const registration of threadListRegistrations) {
      let cached = registration.cache.get(context.threadId);
      if (!cached || !sameThreadContext(cached.context, context)) {
        let item;
        try {
          item = normalizeThreadListItem(registration.provider(context));
        } catch (error) {
          warn(
            \`thread-list provider of \${registration.extId} threw; skipped\`,
            error,
          );
          item = undefined;
        }
        cached = { context, item };
        registration.cache.set(context.threadId, cached);
      }
      if (cached.item) items.push(cached.item);
    }
    return Object.freeze(items);
  }
  const mountedThreadListRows = new WeakMap();
  function renderThreadListRow() {}
  function refreshThreadListRows() {
    for (const row of document.querySelectorAll(
      "[data-app-action-sidebar-thread-row]",
    )) {
      renderThreadListRow(row);
    }
  }
  function updateGenericThreadModel(context, rawItems, shortcuts, intl) {
    let model = threadModels.get(context.threadId);
    if (!model) {
      model = { kind: "generic" };
      threadModels.set(context.threadId, model);
    }
    const views = new Map();
    model.context = context;
    model.rawItems = rawItems;
    model.shortcuts = shortcuts;
    model.intl = intl;
    model.views = views;
    return model;
  }
  function updateThreadModel(context, children) {
    let model = threadModels.get(context.threadId);
    if (!model) {
      model = { kind: "react" };
      threadModels.set(context.threadId, model);
    }
    model.context = context;
    model.children = children;
    return model;
  }
  function invalidateThreadListRegistration(registration, threadId) {
    if (threadId === undefined) registration.cache.clear();
    else {
              registration.cache.delete(threadId);
    }
  }
${threadListContextSource}
  function install() {
    let native;
    let settingsSectionIcons;
    const settingsVisibilityCalls = [];
    const settingsVisibilityModule = {
      i() {
        settingsVisibilityCalls.push("icons");
        settingsSectionIcons = {
          "general-settings": "native-general-icon",
        };
      },
      t() {
        settingsVisibilityCalls.push("visibility");
      },
      get r() {
        return settingsSectionIcons;
      },
    };
    const settingsLoadingModule = {
      n() {
        settingsVisibilityCalls.push("loading");
      },
    };
    let threadMenuBoundaryRenderCount = 0;
    const threadMenuRenderVersion = 0;
    let renderVersion = 0;
    const subscribe = () => () => {};
    const subscribeThreadMenu = () => () => {};
    const originalJsx = (type, props, key) => ({ type, props, key });
    const originalJsxs = originalJsx;
    const isElement = (value) =>
      value !== null &&
      typeof value === "object" &&
      "type" in value &&
      value.props !== null &&
      typeof value.props === "object";
    const React = {
      Fragment: Symbol("Fragment"),
      createContext(value) { return { Provider: Symbol("Provider"), value }; },
      useContext(context) { return context.value; },
      useRef(value) { return { current: value }; },
      useSyncExternalStore() {},
      useLayoutEffect(effect) { layoutCleanups.push(effect()); },
    };
    const appInitialModule = {
      c2t: () => ({}),
      GUt: () => ({}),
      KUt: (selector, ...arguments_) =>
        typeof selector === "function" ? selector(...arguments_) : selector,
      j2: (conversationId) =>
        conversationId === "thread-1"
          ? "local"
          : conversationId === "thread-2"
            ? "remote"
            : undefined,
      uwt: { authenticatedAccountId: "account-a" },
      Ezt: {},
      Fc: function RemoteSidebarThreadRow() {},
    };
    const renderThreadTree = (_tree, context) => context;
${threadMenuContextSource}
${threadMenuBoundarySource}
    function isAssistantSelectionMenu(type, props) {
      return (
        type === props?.type
      );
    }
    let settingsSearchQuery = "general";
    let settingsSetSearchQuery = null;
    function settingsSearchMatches() {
      return [
        {
          id: "section:codex.settings.general-settings",
          kind: "section",
          label: "General",
          panelLabel: "General",
          sectionSlug: "general-settings",
        },
        {
          id: "section:reactions.settings",
          kind: "section",
          label: "Reactions",
          panelLabel: "Reactions",
          sectionSlug: "reactions.settings",
        },
      ];
    }
    function settingsPanesById() {
      return new Map();
    }
    function computeEffectiveSettingsCategories() {
      return [];
    }
    function navigateSettingsPane() {}
    function resolveIcon(id) {
      return "fallback:" + id;
    }
    function enhanceSettingsSearchResults(props) {
      const custom = settingsSearchMatches(settingsSearchQuery);
      const byPane = new Map(custom.map((result) => [result.sectionSlug, result]));
      const results = props.searchResults.map(
        (result) => byPane.get(result.sectionSlug) ?? result,
      );
      const existing = new Set(results.map((result) => result.sectionSlug));
      for (const result of custom) {
        if (!existing.has(result.sectionSlug)) results.push(result);
      if (native.settingsSectionIcons?.[result.sectionSlug] === undefined) {
        native.settingsSectionIcons[result.sectionSlug] = resolveIcon("settings");
      }
      }
      return {
        ...props,
        searchResults: results,
        onSelect(sectionSlug) {
          if (
            settingsPanesById(computeEffectiveSettingsCategories()).has(
              sectionSlug,
            )
          ) {
            settingsSearchQuery = "";
            settingsSetSearchQuery?.("");
            void navigateSettingsPane(sectionSlug);
            return;
          }
          props.onSelect(sectionSlug);
        },
      };
    }
    settingsVisibilityModule.t();
    settingsLoadingModule.n();
    native = {
${nativeExportsSource}
      ThreadMenuAdapter: function ThreadMenuAdapter() {},
      settingsSectionIcons: settingsVisibilityModule.r,
    };
    sidebarThreadContext = React.createContext(null);
    return {
      ThreadMenuBoundary,
      ExecutionSidebarThreadBoundary,
      RemoteSidebarThreadBoundary,
      SidebarThreadBoundary,
      threadContextForMenuProps,
      isExecutionSidebarThreadRow,
      threadContextForExecutionSidebarProps,
      isRemoteCodexSidebarThreadRow,
      threadContextForRemoteSidebarProps,
      isChatGptSidebarThreadRow,
      threadContextForSidebarProps,
      isSidebarThreadMenuAdapter,
      injectSidebarPriorityIndicator,
      positionThreadRowSlotElement,
      enhanceSettingsSearchResults,
      getSettingsVisibilityCalls: () => [...settingsVisibilityCalls],
      setSettingsSectionIcons: (value) => {
        native.settingsSectionIcons = value;
      },
      getNative: () => native,
    };
  }
  const host = { version: "26.825.51511" };
  return {
    host,
    sameThreadContext,
    threadOwnerKey,
    threadMenuModelKey,
    sameThreadIdentity,
    computeEffectiveThreadItems,
    computeEffectiveThreadItemsAsync,
    computeThreadListItems,
    fiberOf,
    updateGenericThreadModel,
    updateThreadModel,
    addThreadTransformer: (extId, transform) =>
      threadTransformers.push({ extId, transform }),
    registerThreadListProvider(extId, provider, slot = "title-prefix") {
      const registration = { extId, provider, slot, cache: new Map() };
      threadListRegistrations.push(registration);
      return registration;
    },
    invalidateThreadListRegistration,
    getThreadModelKeys: () => [...threadModels.keys()],
    threadListContextFromRow,
    getCurrentThread: () => currentThread,
    runLayoutCleanup: (index) => layoutCleanups[index]?.(),
    ...install(),
  };
})();
`;
}

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function withoutOwn(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function patch(source = fixtureSource()) {
  return patchBindingHostSource({
    appVersion: "26.825.51511",
    appBuild: "7377",
    originalDigest: sha256(source),
    source,
  });
}

test("settings search initializes and guards the native icon map", () => {
  const result = patch();
  const iconInitializer = result.source.indexOf("settingsVisibilityModule.i();");
  const iconCapture = result.source.indexOf(
    "settingsSectionIcons: settingsVisibilityModule.r",
  );
  assert.ok(iconInitializer >= 0);
  assert.ok(iconInitializer < iconCapture);
  assert.doesNotMatch(result.source, /settingsVisibilityModule\.t\(\)/);
  assert.doesNotMatch(
    result.source,
    /settingsSectionIcons\?\.\[result\.sectionSlug\]/,
  );

  const host = new Function(result.source)();
  assert.deepEqual(host.getSettingsVisibilityCalls(), [
    "icons",
    "loading",
  ]);
  const nativeGeneralIcon =
    host.getNative().settingsSectionIcons["general-settings"];
  const search = host.enhanceSettingsSearchResults({
    searchResults: [],
    onSelect() {},
  });
  assert.equal(search.searchResults.length, 2);
  assert.equal(
    host.getNative().settingsSectionIcons["general-settings"],
    nativeGeneralIcon,
  );
  assert.equal(
    host.getNative().settingsSectionIcons["reactions.settings"],
    "fallback:settings",
  );

  host.setSettingsSectionIcons(undefined);
  assert.doesNotThrow(() =>
    host.enhanceSettingsSearchResults({
      searchResults: [],
      onSelect() {},
    }),
  );
});

test("exact first-party UI owners expose extension transforms and controls", () => {
  const result = patch();
  assert.doesNotThrow(() => new Function(result.source));
  for (const marker of [
    "home-suggestion-surface-B3IuURqZ.js",
    "home-ambient-suggestions-content-nKYWb4_V.js",
    "home-task-suggestions-CPTOpaBq.js",
    "codex-home-announcements-94zV-NAr.js",
    "composer-utility-bar-DfeW9V5I.js",
    "chatgpt-markdown-view-lDB_GnW-.js",
    "conversation-blocks-Bqf2uxPH.js",
    "viewer-C8qpsv81.js",
    "transformSuggestions",
    "transformAnnouncements",
    "transformSidebarDestinations",
    "transformProductModeMenu",
    "registerComposerAction",
    "registerAssistantDirective",
    "registerAssistantContentReference",
    "registerAssistantCodeBlock",
    "registerConversationItem",
    "HomeSuggestionSurface",
    "ExactHomeAmbientSuggestionBoundary",
    "isExactHomeAmbientSuggestionOwner(type, props)",
    "ExactHomeTaskSuggestionBoundary",
    "isExactHomeTaskSuggestionOwner(type, props)",
    "HomeTaskSuggestions: homeTaskSuggestionsModule.HomeTaskSuggestions",
    "ExactHomePageBoundary",
    "isExactHomePageOwner(type, props)",
    "exactHomeSuggestionOwnerPropsInTree",
    "injectExactHomeSuggestionSlot",
    "--thread-content-max-width:42rem",
    "ambient-suggestion-set-status",
    "ambient-suggestions-refresh",
    "exactUiTransformers.suggestions.length === 0",
    "HomeBannerController",
    "availableDestinations: exactSidebarDestinationItems",
    "sidebarElectron.productMode.trigger",
    "data-cgptx-home-suggestion",
    "data-cgptx-home-announcement",
    "data-cgptx-sidebar-destination",
    "data-cgptx-product-menu-item",
    "data-cgptx-product-mode-trigger",
    "data-cgptx-composer-action",
    "sidebarView?.firstElementChild instanceof HTMLElement",
    "indicatorMount?.firstElementChild instanceof HTMLElement",
    "data-cgptx-thread-list-views=\"priority-indicator\"",
    "definition.onClick(context, exactUiActivation(event))",
    "ExactAssistantMarkdownBoundary",
    "ExactContentReferenceDirective",
    "turnContext?.contentReferenceMessageIds?.[index]",
    "ExactAssistantCodeBlockBoundary",
    "const turnContext = native.useCurrentTurnContext();",
    'typeof props.codeBlockInfo === "string"',
    "directiveProps?.directiveId",
    "ChatGptCodeBlock: appInitialModule.Iw",
    "ExactConversationItemBoundary",
    "ExactCloudConversationItemBoundary",
    "CloudConversationTurn: cloudConversationViewerModule.r",
    "RemoteSidebarThreadRow: appInitialModule.Fc",
    "RemoteSidebarThreadBoundary",
    "threadContextForRemoteSidebarProps",
    "data-cgptx-settings-page-owner",
    "const probeDeadline = Date.now() + 55_000",
    "Math.min(probeDeadline, Date.now() + timeout)",
    "exactRichProbeCommitted",
    "exactRichFallbackSnapshot",
    "type === native.Composer.AdaptiveFooter",
    "isExactComposerUtilityOwner(type, props)",
    "exactCloudAccountIdentity",
    "exactRichRevisions",
    "exactRichRevision(entry, context.ownerId)",
    "revisions.owners.set(",
    'scope: ownerKind === "cloud" ? "cloud" : "execution"',
    "multiple cloud conversation-item owners matched the exact binding",
    "runProductExtensionProbe",
    "interactiveThreadTarget",
    "activateThreadRow",
    "selectionDeadline",
    "Activity row was replaced before activation",
    "currentThreadMatched",
    "visibleResponseCount",
    "matchingResponseFound",
    "Thread Colors did not contribute its Color > Blue action",
    "data-cgptx-product-reaction-owner",
    "data-cgptx-product-reaction-persisted",
    "fallback: originalJsx(type, props, elementKey)",
    "richContentOwnerHits",
    "richContentLifecycle",
    "exactRichLifecycle.mounts[kind] += 1",
    "exactRichLifecycle.disposals[kind] += 1",
    "mountRichContentProbe",
    "removeEmptyContainer",
    "container.hasChildNodes()",
    "new MutationObserver(removeEmptyContainer)",
    "observer.observe(container, { childList: true })",
    "ui: makeExactUiApi(extId)",
    "primaryAppShellReady",
  ]) {
    assert.ok(result.source.includes(marker), `missing exact UI marker: ${marker}`);
  }
  assert.equal(
    result.source.includes("container.remove();") &&
      result.source.includes("if (!container.hasChildNodes())"),
    true,
    "the probe must remove its container only after React empties the portal",
  );
  assert.equal(
    result.source.includes("remainingChecks"),
    false,
    "the probe must not physically remove a non-empty React portal",
  );
  assert.ok(
    result.source.indexOf('throw new Error("Activity row was replaced before activation")') <
      result.source.indexOf("target = activateThreadRow(candidate)"),
    "the activity driver must check the native row before its click can remount it",
  );
  assert.ok(result.source.includes('"builtin:pull-requests": "app.pull-requests"'));
  assert.ok(result.source.includes('"builtin:automations": "app.automations"'));
  assert.ok(result.source.includes("menuItems.map((item) => exactUiMenuItem"));
  assert.ok(
    result.source.indexOf("const composerAnnotationFound =") <
      result.source.indexOf("const settingsOpened = await openSettingsPane"),
    "the reaction annotation must be observed before Settings replaces the composer",
  );
  assert.ok(
    result.source.indexOf("const headerDiagnostics = Object.freeze") <
      result.source.indexOf("const settingsOpened = await openSettingsPane"),
    "the header must be measured before Settings replaces the thread view",
  );
});

test("primary AppShell readiness accepts each first-party main surface", () => {
  const result = patch();
  const start = result.source.indexOf("  function primaryAppShellReady() {");
  const end = result.source.indexOf("\n\n  function subscribeExactUi", start);
  assert.ok(start >= 0, "the primary AppShell readiness function must exist");
  assert.ok(end > start, "the primary AppShell readiness function must be bounded");
  const functionSource = result.source.slice(start, end);
  const evaluate = (document, HTMLElement) =>
    new Function(
      "document",
      "HTMLElement",
      `${functionSource}\nreturn primaryAppShellReady();`,
    )(document, HTMLElement);

  class FakeHTMLElement {
    constructor({ connected = true, children = [] } = {}) {
      this.isConnected = connected;
      this.children = children;
      this.queries = [];
    }

    contains(candidate) {
      return this.children.includes(candidate);
    }

    querySelector(selector) {
      this.queries.push(selector);
      if (selector === '[data-app-shell-focus-area="main"]') {
        return this.children.find((child) => child.kind === "main-focus") ?? null;
      }
      return null;
    }
  }

  const rootSelector = "main[data-app-shell-main-surface]";
  const documentFor = (root, queried = []) => ({
    querySelector(selector) {
      queried.push(selector);
      return selector === rootSelector ? root : null;
    },
  });
  const mainFocus = Object.assign(new FakeHTMLElement(), { kind: "main-focus" });

  assert.equal(evaluate(documentFor(null), FakeHTMLElement), false);
  assert.equal(evaluate(documentFor({ isConnected: true }), FakeHTMLElement), false);
  assert.equal(
    evaluate(documentFor(new FakeHTMLElement({ connected: false })), FakeHTMLElement),
    false,
  );
  assert.equal(
    evaluate(
      documentFor(new FakeHTMLElement()),
      FakeHTMLElement,
    ),
    false,
  );
  const detachedRoot = new FakeHTMLElement();
  detachedRoot.querySelector = (selector) =>
    selector === '[data-app-shell-focus-area="main"]' ? mainFocus : null;
  assert.equal(evaluate(documentFor(detachedRoot), FakeHTMLElement), false);

  const queried = [];
  const root = new FakeHTMLElement({ children: [mainFocus] });
  assert.equal(evaluate(documentFor(root, queried), FakeHTMLElement), true);
  assert.deepEqual(queried, [rootSelector]);
  assert.deepEqual(root.queries, ['[data-app-shell-focus-area="main"]']);
  assert.match(
    result.source,
    /captureDynamicThreadItemsFromOpenMenus,\n\s+primaryAppShellReady,\n\s+richContentOwnerHits:/,
  );
});

test("exact host patch scopes same thread ids by ChatGPT host identity", async () => {
  const originalDocument = globalThis.document;
  const menuRow = (hostId, threadId, title) => {
    const attributes = new Map([
      ["data-app-action-sidebar-thread-host-id", hostId],
      ["data-app-action-sidebar-thread-id", `${hostId}:${threadId}`],
      ["data-app-action-sidebar-thread-title", title],
    ]);
    return { getAttribute: (name) => attributes.get(name) ?? null };
  };
  const menuRows = [
    menuRow("remote", "thread-1", "Remote thread"),
    menuRow("local", "thread-1", "Local thread"),
    menuRow("row-host", "thread-3", "Third thread"),
    menuRow("first-host", "thread-4", "First duplicate"),
    menuRow("second-host", "thread-4", "Second duplicate"),
  ];
  globalThis.document = {
    querySelectorAll: () => menuRows,
  };
  try {
    const result = patch();
    assert.equal(result.digest, sha256(result.source));
    assert.doesNotThrow(() => new Function(result.source));
    assert.match(result.source, /raw\.onSelect = item\.onClick/);
    assert.doesNotMatch(result.source, /raw\.onClick = item\.onClick/);
    const host = new Function(result.source)();
    assert.equal(host.fiberOf(null), null);
    assert.equal(host.fiberOf(undefined), null);

    const headerContext = host.ThreadMenuBoundary({
      child: {
        props: {
          conversationId: "thread-1",
          cwd: "/tmp/project",
        },
        type: () => null,
      },
    });
    assert.deepEqual(headerContext, {
      scope: "execution",
      surface: "header",
      hostId: "local",
      threadId: "thread-1",
      title: "Local thread",
      mode: "codex",
      location: "local",
      selected: true,
      workingDirectory: "/tmp/project",
    });
    assert.deepEqual(host.getCurrentThread(), headerContext);

    const explicitHostContext = host.ThreadMenuBoundary({
      child: {
        props: {
          conversationId: "thread-1",
          hostId: "remote",
        },
        type: () => null,
      },
    });
    assert.deepEqual(explicitHostContext, {
      scope: "execution",
      surface: "header",
      hostId: "remote",
      threadId: "thread-1",
      title: "Remote thread",
      mode: "codex",
      location: "remote",
      selected: true,
    });
    assert.equal(host.sameThreadContext(headerContext, explicitHostContext), false);

    host.runLayoutCleanup(0);
    await Promise.resolve();
    assert.deepEqual(host.getCurrentThread(), explicitHostContext);
    host.runLayoutCleanup(1);
    await Promise.resolve();
    assert.equal(host.getCurrentThread(), undefined);

    const rowHostContext = host.ThreadMenuBoundary({
      child: {
        props: {
          conversationId: "thread-3",
          title: "Third thread",
        },
        type: () => null,
      },
    });
    assert.deepEqual(rowHostContext, {
      scope: "execution",
      surface: "header",
      hostId: "row-host",
      threadId: "thread-3",
      title: "Third thread",
      mode: "codex",
      location: "remote",
      selected: true,
    });

    assert.deepEqual(
      host.threadContextForMenuProps({ conversationId: "thread-4" }),
      {
        scope: "execution",
        surface: "header",
        hostId: undefined,
        threadId: "thread-4",
        title: "",
        mode: "codex",
        location: "local",
        selected: true,
      },
    );

    const attributes = new Map([
      ["data-app-action-sidebar-thread-host-id", "remote-host"],
      ["data-app-action-sidebar-thread-id", "remote-host:thread-2"],
      ["data-app-action-sidebar-thread-title", "Second thread"],
    ]);
    assert.deepEqual(
      host.threadListContextFromRow({
        getAttribute: (name) => attributes.get(name) ?? null,
      }),
      {
        scope: "execution",
        surface: "sidebar",
        hostId: "remote-host",
        threadId: "thread-2",
        title: "Second thread",
        mode: "codex",
        location: "remote",
      },
    );
    assert.equal(host.getNative().accountState.authenticatedAccountId, "account-a");
    const cloudA = {
      scope: "cloud",
      surface: "sidebar",
      accountId: "account-a",
      workspaceId: "workspace-a",
      threadId: "same-thread",
    };
    const cloudB = { ...cloudA, accountId: "account-b" };
    assert.notEqual(host.threadOwnerKey(cloudA), host.threadOwnerKey(cloudB));
    assert.notEqual(
      host.threadMenuModelKey(cloudA),
      host.threadMenuModelKey({ ...cloudA, surface: "header" }),
    );
    assert.equal(host.sameThreadIdentity(cloudA, cloudB), false);
  } finally {
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else {
      globalThis.document = originalDocument;
    }
  }
});

test("execution sidebar owners preserve native priority and avoid empty leading slots", () => {
  const patched = patch();
  const host = new Function(patched.source)();
  const executionRow = new Function(
    "props",
    `
      void "priorityIndicatorNode";
      void "sidebar_context_menu";
      void "markThreadAsUnread";
      return props;
    `,
  );
  const titlePrefix = { type: "native-prefix", props: {} };
  const baseProps = {
    conversationId: "local-thread",
    hostId: "local",
    variant: "sidebar",
    threadSummary: { title: "Summary title" },
    titlePrefix,
    renderActions: undefined,
    isAeonThread: false,
    isActive: true,
    isPinned: true,
    isUnread: true,
    dataAttributes: {
      "data-app-action-sidebar-thread-title": "Attribute title",
    },
  };

  assert.equal(
    host.isExecutionSidebarThreadRow(executionRow, baseProps),
    true,
  );
  assert.equal(
    host.isExecutionSidebarThreadRow(executionRow, {
      ...baseProps,
      variant: "sidebarPinned",
    }),
    true,
  );
  for (const invalid of [
    { ...baseProps, conversationId: "" },
    { ...baseProps, hostId: "" },
    { ...baseProps, variant: "tableRow" },
    withoutOwn(baseProps, "threadSummary"),
    withoutOwn(baseProps, "titlePrefix"),
    withoutOwn(baseProps, "renderActions"),
    withoutOwn(baseProps, "isAeonThread"),
  ]) {
    assert.equal(
      host.isExecutionSidebarThreadRow(executionRow, invalid),
      false,
    );
  }
  const missingMarker = new Function(
    "props",
    `
      void "priorityIndicatorNode";
      void "sidebar_context_menu";
      return props;
    `,
  );
  assert.equal(
    host.isExecutionSidebarThreadRow(missingMarker, baseProps),
    false,
  );

  const executionContext = host.threadContextForExecutionSidebarProps(baseProps);
  assert.deepEqual(executionContext, {
    scope: "execution",
    surface: "sidebar",
    hostId: "local",
    threadId: "local-thread",
    title: "Attribute title",
    mode: "codex",
    location: "local",
    selected: true,
    pinned: true,
    unread: true,
    archived: false,
    temporary: false,
  });
  assert.equal(
    host.threadContextForExecutionSidebarProps({
      ...baseProps,
      dataAttributes: {},
    }).title,
    "Summary title",
  );
  assert.equal(
    host.threadContextForExecutionSidebarProps({
      ...baseProps,
      dataAttributes: {},
      threadSummary: null,
      titleOverride: "Override title",
    }).title,
    "Override title",
  );
  assert.equal(
    host.threadContextForExecutionSidebarProps({ ...baseProps, hostId: "" }),
    null,
  );

  const titlePrefixItem = { view() {} };
  const priorityItem = { view() {} };
  host.registerThreadListProvider(
    "title-prefix-extension",
    () => titlePrefixItem,
    "title-prefix",
  );
  let observedContext;
  host.registerThreadListProvider(
    "priority-extension",
    (context) => {
      observedContext = context;
      return priorityItem;
    },
    "priority-indicator",
  );
  const nativePriority = { type: "native-priority", props: {} };
  const child = {
    type: executionRow,
    key: "local-thread-row",
    props: { ...baseProps, priorityIndicatorNode: nativePriority },
  };
  const rendered = host.ExecutionSidebarThreadBoundary({ child });
  assert.equal(rendered.type, executionRow);
  assert.equal(rendered.key, "local-thread-row");
  assert.equal(typeof rendered.props.titlePrefix.type, "symbol");
  const [preservedTitlePrefix, extensionTitlePrefix] =
    rendered.props.titlePrefix.props.children;
  assert.equal(preservedTitlePrefix, titlePrefix);
  assert.equal(extensionTitlePrefix.props.slot, "title-prefix");
  assert.deepEqual(extensionTitlePrefix.props.context, executionContext);
  assert.deepEqual(extensionTitlePrefix.props.items, [titlePrefixItem]);
  const extensionPrefixFragment = extensionTitlePrefix.type(
    extensionTitlePrefix.props,
  );
  const [extensionPrefixView] = extensionPrefixFragment.props.children;
  const extensionPrefixHost = extensionPrefixView.type(
    extensionPrefixView.props,
  );
  assert.equal(
    extensionPrefixHost.props.style.marginInlineStart,
    undefined,
  );
  assert.equal(extensionPrefixHost.props.style.position, undefined);
  assert.equal(extensionPrefixHost.props.style.height, "1rem");
  assert.deepEqual(observedContext, executionContext);
  assert.deepEqual(rendered.props.priorityIndicatorNode.props.style, {
    display: "flex",
    alignItems: "center",
    gap: "2px",
  });
  const [preservedNativePriority, extensionPriority] =
    rendered.props.priorityIndicatorNode.props.children;
  assert.equal(preservedNativePriority, nativePriority);
  assert.equal(extensionPriority.props.slot, "priority-indicator");
  assert.deepEqual(extensionPriority.props.context, executionContext);
  assert.deepEqual(extensionPriority.props.items, [priorityItem]);
  const withoutNativePriority = host.ExecutionSidebarThreadBoundary({
    child: {
      ...child,
      props: {
        ...child.props,
        priorityIndicatorNode: null,
        overlayMetaContent: null,
      },
    },
  });
  assert.equal(withoutNativePriority.props.priorityIndicatorNode, null);
  assert.equal(
    withoutNativePriority.props.overlayMetaContent.props.slot,
    "priority-indicator",
  );
  const nativeOverlay = { type: "native-overlay", props: {} };
  const withNativeOverlay = host.ExecutionSidebarThreadBoundary({
    child: {
      ...child,
      props: {
        ...child.props,
        priorityIndicatorNode: null,
        overlayMetaContent: nativeOverlay,
      },
    },
  });
  assert.equal(typeof withNativeOverlay.props.overlayMetaContent.type, "symbol");
  assert.deepEqual(withNativeOverlay.props.overlayMetaContent.props.children, [
    nativeOverlay,
    withoutNativePriority.props.overlayMetaContent,
  ]);
  const prefixOnlyHost = new Function(patch().source)();
  prefixOnlyHost.registerThreadListProvider(
    "prefix-only-extension",
    () => titlePrefixItem,
    "title-prefix",
  );
  const prefixOnly = prefixOnlyHost.ExecutionSidebarThreadBoundary({ child });
  assert.notEqual(prefixOnly, child);
  assert.equal(typeof prefixOnly.props.titlePrefix.type, "symbol");
  assert.equal(
    prefixOnly.props.titlePrefix.props.children[1].props.slot,
    "title-prefix",
  );
  assert.equal(prefixOnly.props.priorityIndicatorNode, nativePriority);
  assert.match(
    patched.source,
    /if \(isExecutionSidebarThreadRow\(type, props\)\) \{\n\s+return originalJsx\(\n\s+ExecutionSidebarThreadBoundary,/,
  );
});

test("priority-indicator contributions follow the full row height without shifting titles", () => {
  const originalHTMLElement = globalThis.HTMLElement;
  let fakeDocument;
  class FakeHTMLElement {
    constructor() {
      this.style = {
        display: "flex",
        position: "",
        insetInlineStart: "",
        insetInlineEnd: "",
        top: "",
        bottom: "",
        height: "1rem",
        marginInlineStart: "",
        pointerEvents: "",
        zIndex: "",
      };
      this.children = [];
      this.attributes = new Map();
      this.removed = false;
      this.ownerDocument = fakeDocument;
      this.isConnected = true;
    }

    append(child) {
      if (child.parentElement) {
        child.parentElement.children = child.parentElement.children.filter(
          (candidate) => candidate !== child,
        );
      }
      this.children.push(child);
      child.parentElement = this;
    }

    contains(candidate) {
      return (
        candidate === this ||
        this.children.some((child) => child.contains(candidate))
      );
    }

    getBoundingClientRect() {
      return { height: 40 };
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    remove() {
      this.removed = true;
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter(
          (candidate) => candidate !== this,
        );
      }
      this.parentElement = null;
    }

    replaceChildren(...children) {
      for (const child of this.children) child.parentElement = null;
      this.children = [];
      for (const child of children) this.append(child);
    }
  }
  fakeDocument = {
    createElement: () => new FakeHTMLElement(),
  };
  globalThis.HTMLElement = FakeHTMLElement;
  try {
    const patched = patch();
    assert.doesNotMatch(
      patched.source,
      /function refreshThreadListRows\(\) \{\n\s+for \(const row[\s\S]*?renderThreadListRow\(row\);/,
    );
    assert.match(
      patched.source,
      /function refreshThreadListRows\(\) \{\n\s+for \(const host[\s\S]*?data-cgptx-thread-list-leading-views/,
    );
    const api = new Function(patched.source)();
    const rowOwner = new FakeHTMLElement();
    rowOwner.style.height = "";
    const host = new FakeHTMLElement();
    host.closest = (selector) =>
      selector ===
      "[data-app-action-sidebar-thread-row], [data-cgptx-thread-row-owner]"
        ? rowOwner
        : null;
    rowOwner.append(host);
    const element = new FakeHTMLElement();
    element.style.display = "block";
    element.style.height = "100%";
    host.append(element);

    const restore = api.positionThreadRowSlotElement(
      host,
      element,
      "priority-indicator",
    );

    assert.equal(rowOwner.style.position, "relative");
    assert.equal(host.style.display, "none");
    assert.deepEqual(rowOwner.children, [host, element]);
    assert.deepEqual(host.children, []);
    assert.equal(element.parentElement, rowOwner);
    assert.equal(element.style.position, "absolute");
    assert.equal(element.style.insetInlineStart, "2px");
    assert.equal(element.style.top, "0");
    assert.equal(element.style.bottom, "0");
    assert.equal(element.style.height, "auto");
    assert.equal(element.style.pointerEvents, "none");
    assert.equal(element.style.zIndex, "1");
    assert.equal(
      element.getAttribute("data-cgptx-thread-row-slot-positioned"),
      "priority-indicator",
    );

    restore();

    assert.equal(rowOwner.style.position, "");
    assert.equal(host.style.display, "flex");
    assert.deepEqual(rowOwner.children, [host]);
    assert.deepEqual(host.children, [element]);
    assert.equal(element.removed, false);
    assert.equal(element.style.position, "");
    assert.equal(element.style.insetInlineStart, "");
    assert.equal(element.style.top, "");
    assert.equal(element.style.bottom, "");
    assert.equal(element.style.height, "100%");
    assert.equal(element.style.pointerEvents, "");
    assert.equal(element.style.zIndex, "");
    assert.equal(
      element.getAttribute("data-cgptx-thread-row-slot-positioned"),
      null,
    );

    const normalPrefix = new FakeHTMLElement();
    const restoreNormal = api.positionThreadRowSlotElement(
      host,
      normalPrefix,
      "title-prefix",
    );
    assert.equal(host.style.display, "flex");
    assert.equal(normalPrefix.parentElement, undefined);
    restoreNormal();
  } finally {
    if (originalHTMLElement === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    } else {
      globalThis.HTMLElement = originalHTMLElement;
    }
  }
});

test("signed-in sidebar owners use canonical cloud identity and exact Q9 shapes", async () => {
  const host = new Function(patch().source)();
  const remoteTaskProps = {
    task: {
      id: "remote-task",
      title: "Remote task",
      archived: false,
      has_unread_turn: true,
    },
    titlePrefix: null,
    dataAttributes: {},
    onClose() {},
    isActive: false,
    isPinned: true,
  };
  assert.equal(
    host.isRemoteCodexSidebarThreadRow(
      host.getNative().RemoteSidebarThreadRow,
      remoteTaskProps,
    ),
    true,
  );
  assert.equal(
    host.isRemoteCodexSidebarThreadRow(function OtherRow() {}, remoteTaskProps),
    false,
  );
  assert.deepEqual(
    host.threadContextForRemoteSidebarProps(remoteTaskProps, {
      authenticatedAccountId: "authenticated-account",
      accountId: "workspace-account",
      accountStructure: "workspace",
    }),
    {
      scope: "cloud",
      surface: "sidebar",
      accountId: "authenticated-account",
      workspaceId: "workspace-account",
      threadId: "remote-task",
      title: "Remote task",
      mode: "codex",
      location: "remote",
      selected: false,
      pinned: true,
      unread: true,
      archived: false,
      temporary: false,
    },
  );
  assert.equal(host.threadContextForRemoteSidebarProps(remoteTaskProps, {}), null);
  const sidebarRow = new Function(
    "props",
    `
      void "chatgptConversations.sidebar.archiveAriaLabel";
      void "chatgptConversations.sidebar.cloudScheduledTask";
      return { surface:\`sidebar\`, renderActions: props.renderActions };
    `,
  );
  const baseProps = {
    conversation: {
      id: "canonical-thread",
      title: "Conversation title",
    },
    conversationId: "canonical-thread",
    conversationOrigin: "chatgpt",
    title: "Rendered title",
    titlePrefix: null,
    isActive: true,
    isPinned: true,
    statusState: { type: "idle", unread: true },
  };

  assert.equal(host.isChatGptSidebarThreadRow(sidebarRow, baseProps), true);
  assert.equal(
    host.isChatGptSidebarThreadRow(sidebarRow, {
      ...baseProps,
      stateConversationId: "optimistic-thread",
    }),
    true,
  );
  for (const invalid of [
    { ...baseProps, conversationId: "optimistic-thread" },
    { ...baseProps, conversation: { ...baseProps.conversation, id: "" } },
    withoutOwn(baseProps, "titlePrefix"),
    withoutOwn(baseProps, "conversationOrigin"),
    { ...baseProps, title: null },
  ]) {
    assert.equal(host.isChatGptSidebarThreadRow(sidebarRow, invalid), false);
  }
  const missingMarker = new Function(
    "props",
    `
      void "chatgptConversations.sidebar.archiveAriaLabel";
      void "chatgptConversations.sidebar.cloudScheduledTask";
      return { surface:\`sidebar\`, action: props.action };
    `,
  );
  assert.equal(host.isChatGptSidebarThreadRow(missingMarker, baseProps), false);

  const cloudContext = host.threadContextForSidebarProps(
    {
      ...baseProps,
      stateConversationId: "optimistic-thread",
    },
    {
      authenticatedAccountId: "authenticated-account",
      accountId: "workspace-account",
      accountStructure: "workspace",
    },
  );
  assert.deepEqual(cloudContext, {
    scope: "cloud",
    surface: "sidebar",
    accountId: "authenticated-account",
    workspaceId: "workspace-account",
    threadId: "canonical-thread",
    title: "Rendered title",
    mode: "chatgpt",
    location: "cloud",
    selected: true,
    pinned: true,
    unread: true,
    archived: false,
    temporary: false,
  });
  assert.deepEqual(
    host.threadContextForSidebarProps(
      {
        ...baseProps,
        title: undefined,
        isActive: false,
        isPinned: false,
        statusState: undefined,
      },
      { accountId: "personal-account", accountStructure: "personal" },
    ),
    {
      scope: "cloud",
      surface: "sidebar",
      accountId: "personal-account",
      threadId: "canonical-thread",
      title: "Conversation title",
      mode: "chatgpt",
      location: "cloud",
      selected: false,
      pinned: false,
      unread: false,
      archived: false,
      temporary: false,
    },
  );
  assert.equal(host.threadContextForSidebarProps(baseProps, {}), null);

  const extensionPriorityIndicator = { type: "priority", props: {} };
  const baseRow = {
    type: "base-row",
    props: {
      title: "Rendered title",
      floatStatusIconsEnd: true,
      renderActions() {},
      reserveLeadingSlot: false,
      additionalHoverActionCount: 1,
      overlayMetaContent: null,
    },
  };
  const injectedTree = host.injectSidebarPriorityIndicator(
    {
      type: "fragment",
      props: {
        children: [
          { type: "menu-adapter", props: { child: baseRow } },
          { type: "dialog", props: {} },
        ],
      },
    },
    extensionPriorityIndicator,
    cloudContext,
  );
  assert.equal(
    injectedTree.props.children[0].props.child.props.priorityIndicatorNode,
    undefined,
  );
  assert.equal(
    injectedTree.props.children[0].props.child.props.overlayMetaContent,
    extensionPriorityIndicator,
  );
  assert.deepEqual(
    injectedTree.props.children[0].props.child.props.dataAttributes,
    {
      "data-cgptx-thread-row-owner":
        '["cloud","authenticated-account","workspace-account","canonical-thread"]',
      "data-cgptx-thread-row-scope": "cloud",
    },
  );
  assert.equal(
    injectedTree.props.children[1].props.priorityIndicatorNode,
    undefined,
  );
  const nativePriorityIndicator = { type: "native-priority", props: {} };
  const injectedWithNativePriority = host.injectSidebarPriorityIndicator(
    {
      type: "menu-adapter",
      props: {
        child: {
          ...baseRow,
          props: {
            ...baseRow.props,
            priorityIndicatorNode: nativePriorityIndicator,
          },
        },
      },
    },
    extensionPriorityIndicator,
    cloudContext,
  );
  assert.deepEqual(
    injectedWithNativePriority.props.child.props.priorityIndicatorNode.props.children,
    [nativePriorityIndicator, extensionPriorityIndicator],
  );
  const markedWithoutIndicator = host.injectSidebarPriorityIndicator(
    {
      type: "menu-adapter",
      props: {
        child: {
          ...baseRow,
          props: {
            ...baseRow.props,
            dataAttributes: { "data-product-row": "chat" },
          },
        },
      },
    },
    undefined,
    cloudContext,
  );
  assert.deepEqual(
    markedWithoutIndicator.props.child.props.dataAttributes,
    {
      "data-product-row": "chat",
      "data-cgptx-thread-row-owner":
        '["cloud","authenticated-account","workspace-account","canonical-thread"]',
      "data-cgptx-thread-row-scope": "cloud",
    },
  );
  const untitledTree = host.injectSidebarPriorityIndicator(
    {
      type: "menu-adapter",
      props: {
        child: {
          ...baseRow,
          props: {
            ...baseRow.props,
            title: { type: "formatted-new-chat", props: {} },
          },
        },
      },
    },
    extensionPriorityIndicator,
    { ...cloudContext, title: "" },
  );
  assert.equal(
    untitledTree.props.child.props.priorityIndicatorNode,
    undefined,
  );
  assert.equal(
    untitledTree.props.child.props.overlayMetaContent,
    extensionPriorityIndicator,
  );

  const Q9 = host.getNative().ThreadMenuAdapter;
  const directChild = {
    type: "row",
    props: { title: "Thread", renderActions() {} },
  };
  const directProps = { getItems() { return []; }, children: directChild };
  assert.equal(host.isSidebarThreadMenuAdapter(Q9, directProps), true);
  const hoverChild = {
    type: "button",
    props: {
      "aria-haspopup": "menu",
      className: "button sidebar-hover-icon-tint active",
    },
  };
  const hoverProps = {
    getItems() { return []; },
    trigger: "click",
    align: "start",
    contentWidth: "xs",
    children: hoverChild,
  };
  assert.equal(host.isSidebarThreadMenuAdapter(Q9, hoverProps), true);
  assert.equal(
    host.isSidebarThreadMenuAdapter(function OtherMenu() {}, hoverProps),
    false,
  );
  assert.equal(
    host.isSidebarThreadMenuAdapter(Q9, { ...hoverProps, getItems: null }),
    false,
  );
  for (const invalid of [
    { ...hoverProps, trigger: "hover" },
    { ...hoverProps, align: "end" },
    { ...hoverProps, contentWidth: "sm" },
    {
      ...hoverProps,
      children: {
        ...hoverChild,
        props: { ...hoverChild.props, "aria-haspopup": "dialog" },
      },
    },
    {
      ...hoverProps,
      children: {
        ...hoverChild,
        props: { ...hoverChild.props, className: "sidebar-hover-icon-tint-fake" },
      },
    },
    { getItems() { return []; }, children: { type: "div", props: {} } },
  ]) {
    assert.equal(host.isSidebarThreadMenuAdapter(Q9, invalid), false);
  }

  const inactive = host.SidebarThreadBoundary({
    child: {
      type: (props) => ({ type: "row", props }),
      props: { ...baseProps, isActive: false },
    },
  });
  assert.ok(inactive);
  assert.equal(host.getCurrentThread(), undefined);
  host.getNative().accountState = {};
  let missingAccountRenderCount = 0;
  const missingAccount = host.SidebarThreadBoundary({
    child: {
      type: (props) => {
        missingAccountRenderCount += 1;
        return { type: "row", props };
      },
      props: baseProps,
    },
  });
  assert.equal(missingAccountRenderCount, 1);
  assert.equal(missingAccount.type, "row");
  host.getNative().accountState = {
    authenticatedAccountId: "account-a",
  };
  const selected = host.SidebarThreadBoundary({
    child: {
      type: (props) => ({ type: "row", props }),
      props: baseProps,
    },
  });
  assert.ok(selected);
  assert.equal(host.getCurrentThread()?.threadId, "canonical-thread");
  const cloudPrefixItem = { view() {} };
  host.registerThreadListProvider(
    "cloud-prefix-extension",
    () => cloudPrefixItem,
    "title-prefix",
  );
  const selectedWithPrefix = host.SidebarThreadBoundary({
    child: {
      type: (props) => ({ type: "row", props }),
      props: baseProps,
    },
  });
  const cloudPrefix = selectedWithPrefix.props.children.props.titlePrefix;
  assert.equal(cloudPrefix.props.slot, "title-prefix");
  assert.deepEqual(cloudPrefix.props.items, [cloudPrefixItem]);
  const cloudPrefixFragment = cloudPrefix.type(cloudPrefix.props);
  const [cloudPrefixView] = cloudPrefixFragment.props.children;
  const cloudPrefixHost = cloudPrefixView.type(cloudPrefixView.props);
  assert.equal(
    cloudPrefixHost.props.style.marginInlineStart,
    undefined,
  );
  assert.equal(cloudPrefixHost.props.style.position, undefined);
  host.SidebarThreadBoundary({
    child: {
      type: (props) => ({ type: "row", props }),
      props: {
        ...baseProps,
        conversation: { id: "second-thread", title: "Second" },
        conversationId: "second-thread",
        title: "Second",
      },
    },
  });
  assert.equal(host.getCurrentThread()?.threadId, "second-thread");
  host.runLayoutCleanup(1);
  await Promise.resolve();
  assert.equal(host.getCurrentThread()?.threadId, "second-thread");
});

test("thread model and list caches isolate surface, account, workspace, and host", async () => {
  const host = new Function(patch().source)();
  const cloudA = {
    scope: "cloud",
    surface: "sidebar",
    accountId: "account-a",
    workspaceId: "workspace-a",
    threadId: "same-thread",
    title: "A",
  };
  const cloudB = { ...cloudA, accountId: "account-b", title: "B" };
  const workspaceB = { ...cloudA, workspaceId: "workspace-b", title: "Workspace B" };
  const cloudHeader = { ...cloudA, surface: "header" };
  const localA = {
    scope: "execution",
    surface: "header",
    hostId: "local-a",
    threadId: "same-thread",
    title: "Local A",
  };
  const localB = { ...localA, hostId: "local-b", title: "Local B" };

  assert.equal(host.sameThreadIdentity(cloudA, cloudHeader), true);
  assert.notEqual(
    host.threadMenuModelKey(cloudA),
    host.threadMenuModelKey(cloudHeader),
  );
  for (const [left, right] of [
    [cloudA, cloudB],
    [cloudA, workspaceB],
    [localA, localB],
  ]) {
    assert.notEqual(host.threadOwnerKey(left), host.threadOwnerKey(right));
    assert.equal(host.sameThreadIdentity(left, right), false);
  }

  for (const context of [cloudA, cloudB, workspaceB, cloudHeader, localA, localB]) {
    host.updateGenericThreadModel(context, [], {}, null);
  }
  assert.deepEqual(
    new Set(host.getThreadModelKeys()),
    new Set(
      [cloudA, cloudB, workspaceB, cloudHeader, localA, localB].map((context) =>
        host.threadMenuModelKey(context)
      ),
    ),
  );

  let providerCalls = 0;
  const registration = host.registerThreadListProvider("cache-test", (context) => {
    providerCalls += 1;
    return { view: () => ({ context }) };
  });
  host.computeThreadListItems(cloudA);
  host.computeThreadListItems(cloudA);
  host.computeThreadListItems(cloudB);
  host.computeThreadListItems(workspaceB);
  assert.equal(providerCalls, 3);
  assert.equal(registration.cache.size, 3);
  host.invalidateThreadListRegistration(registration, "same-thread");
  assert.equal(registration.cache.size, 0);

  let priorityProviderCalls = 0;
  host.registerThreadListProvider(
    "priority-test",
    () => {
      priorityProviderCalls += 1;
      return { view: () => ({}) };
    },
    "priority-indicator",
  );
  host.computeThreadListItems(cloudA);
  assert.equal(priorityProviderCalls, 0);
  assert.equal(
    host.computeThreadListItems(cloudA, "priority-indicator").length,
    1,
  );
  assert.equal(priorityProviderCalls, 1);

  const asyncModel = {
    context: cloudA,
    builtInCache: Object.freeze([{ id: "app.archive" }]),
  };
  host.addThreadTransformer("async-test", async (items) => [
    ...items,
    { id: "extension.async" },
  ]);
  assert.deepEqual(host.computeEffectiveThreadItems(asyncModel), [
    { id: "app.archive" },
  ]);
  assert.deepEqual(await host.computeEffectiveThreadItemsAsync(asyncModel), [
    { id: "app.archive" },
    { id: "extension.async" },
  ]);
});

test("exact host patch fails closed on target, digest, anchor, and reapply changes", () => {
  const source = fixtureSource();
  const originalDigest = sha256(source);
  assert.throws(
    () =>
      patchBindingHostSource({
        appVersion: "26.825.51512",
        appBuild: "7377",
        originalDigest,
        source,
      }),
    /supports only ChatGPT 26\.825\.51511 \(7377\)/,
  );
  assert.throws(
    () =>
      patchBindingHostSource({
        appVersion: "26.825.51511",
        appBuild: "7377",
        originalDigest: "0".repeat(64),
        source,
      }),
    /no longer matches its validated digest/,
  );

  const missingSettingsInitializer = source.replace(
    "    settingsVisibilityModule.t();\n    settingsLoadingModule.n();",
    "",
  );
  assert.throws(
    () => patch(missingSettingsInitializer),
    /settings icon module initializer occurred 0 times/,
  );

  const missingAnchor = source.replace(sameThreadContextSource, "");
  assert.throws(() => patch(missingAnchor), /thread context equality occurred 0 times/);
  const duplicateAnchor = source.replace(
    sameThreadContextSource,
    `${sameThreadContextSource}\n${sameThreadContextSource}`,
  );
  assert.throws(() => patch(duplicateAnchor), /thread context equality occurred 2 times/);

  const first = patch(source);
  assert.throws(
    () =>
      patchBindingHostSource({
        appVersion: "26.825.51511",
        appBuild: "7377",
        originalDigest: first.digest,
        source: first.source,
      }),
    /settings icon module initializer occurred 0 times/,
  );
});
