import assert from "node:assert/strict";
import test from "node:test";

import type {
  NativeSettingsControlsSectionDefinition,
  RendererExtensionContext,
  SidebarThreadRowContext,
  ThreadHeaderMenuItem,
  UiMenuItem,
} from "@chatgptx/api";

import {
  activateExactBuildRendererExtension,
  deactivateExactBuildRendererExtension,
} from "./renderer-adapter.ts";

const expectedTransformPoints = [
  "home.new-chat-suggestions",
  "home.announcements",
  "assistant-selection.actions",
  "thread.header.menu",
  "sidebar.destinations",
  "sidebar.product-mode.menu",
  "sidebar.thread-row.actions",
  "sidebar.thread-row.menu",
  "profile.menu",
  "surface.new-tab",
] as const;

const expectedRenderPoints = [
  "thread.header.action",
  "assistant-message.additional-actions",
  "assistant-message.persistent-actions",
  "assistant-message.after",
  "user-message.additional-actions",
  "sidebar.destination.trailing",
  "sidebar.thread-row.title-prefix",
  "sidebar.thread-row.priority-indicator",
  "sidebar.thread-row.title-suffix",
  "sidebar.thread-row.secondary",
  "sidebar.thread-row.indicator-idle",
  "sidebar.thread-row.indicator-rest",
  "sidebar.thread-row.indicator-hover",
  "sidebar.thread-row.meta",
  "sidebar.thread-row.overlay-meta",
  "composer.footer.leading",
  "composer.footer.trailing",
  "composer.action-bar.leading",
  "composer.action-bar.trailing",
  "composer.utility.leading",
  "composer.utility.trailing",
  "composer.attachments",
  "composer.banners",
  "right-panel.tabs.before",
  "right-panel.tabs.after",
  "right-panel.tabs.after-sticky",
  "right-panel.empty-state",
  "bottom-panel.tabs.after",
  "bottom-panel.tabs.after-sticky",
  "bottom-panel.empty-state",
] as const;

const expectedDefinitionKinds = [
  "assistant-code-block",
  "assistant-content-reference",
  "assistant-directive",
  "command",
  "command-menu-provider",
  "composer-action",
  "main-route",
  "message-action",
  "conversation-item",
  "surface",
  "settings-section",
] as const;

test("thread events and runtime information use the bootstrap document identity", async () => {
  resetAdapterState();
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  let threadListener: ((thread: LegacyThread | undefined) => void) | undefined;
  const messages: unknown[] = [];
  let activeContext: RendererExtensionContext | undefined;
  const identity = {
    id: "window-identity-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const host = {
    threads: {
      getCurrent() {
        return { hostId: "host-44", threadId: "thread-1", title: "Thread" };
      },
      subscribe(listener: (thread: LegacyThread | undefined) => void) {
        threadListener = listener;
        listener({ hostId: "host-44", threadId: "thread-1", title: "Thread" });
        return { dispose() {} };
      },
    },
  };
  const module = {
    activate(context: RendererExtensionContext) {
      activeContext = context;
      assert.equal(context.document.windowId, "window:44");
      context.api.threads.events.subscribe((message) => messages.push(message));
    },
  };

  globalThis.__CGPTX_RUNTIME__ = {
    document: {
      id: "document:44:1",
      windowId: "window:44",
      webContentsId: 44,
      url: "app://-/index.html",
    },
    async request(method) {
      if (method === "runtime.info") {
        return {
          extension: {
            id: "wrong",
            instanceId: "wrong",
            version: "0.0.0",
            manifestDigest: "wrong",
          },
        };
      }
      return undefined;
    },
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "renderer");
    assert.deepEqual(
      (messages[0] as {
        readonly value: { readonly selectedByWindow: Record<string, unknown> };
      }).value.selectedByWindow,
      {
        "window:44": {
          scope: "execution",
          hostId: "host-44",
          threadId: "thread-1",
        },
      },
    );
    threadListener?.({ hostId: "host-44", threadId: "thread-2", title: "Second" });
    assert.equal(
      (messages[1] as {
        readonly value: {
          readonly event: { readonly windowId: string };
          readonly scope: { readonly windowId: string };
        };
      }).value.event.windowId,
      "window:44",
    );
    assert.ok(activeContext);
    assert.deepEqual(
      (await activeContext.api.runtime.getInfo()).extension,
      activeContext.extension,
    );
    assert.equal(
      (messages[1] as {
        readonly value: { readonly scope: { readonly windowId: string } };
      }).value.scope.windowId,
      "window:44",
    );
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
    resetAdapterState();
  }
});

test("current-thread access and events enforce window, cancellation, cursor, and lifetime", async () => {
  resetAdapterState();
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  const listeners: Array<(thread: LegacyThread | undefined) => void> = [];
  let currentReads = 0;
  let subscriptions = 0;
  let disposals = 0;
  globalThis.__CGPTX_RUNTIME__ = {
    document: {
      id: "document:threads-options",
      windowId: "window:threads-options",
      webContentsId: 77,
      url: "app://-/index.html",
    },
    async request() {
      return null;
    },
  };
  const host = {
    threads: {
      getCurrent() {
        currentReads += 1;
        return { hostId: "host-options", threadId: "thread-1", title: "Thread" };
      },
      subscribe(listener: (thread: LegacyThread | undefined) => void) {
        subscriptions += 1;
        listeners.push(listener);
        listener({ hostId: "host-options", threadId: "thread-1", title: "Thread" });
        let disposed = false;
        return {
          dispose() {
            if (disposed) return;
            disposed = true;
            disposals += 1;
          },
        };
      },
    },
  };
  let context: RendererExtensionContext | undefined;
  const identity = {
    id: "threads-options-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(value: RendererExtensionContext) {
      context = value;
    },
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "renderer");
    assert.ok(context);
    assert.equal(
      (await context.api.threads.getCurrent("window:threads-options"))?.ref.threadId,
      "thread-1",
    );
    assert.equal(currentReads, 1);
    await assert.rejects(
      context.api.threads.getCurrent("window:other"),
      (error: unknown) => {
        assert.equal((error as { readonly name?: string }).name, "ChatGPTXApiError");
        assert.equal(
          (error as { readonly code?: string }).code,
          "capability-unavailable",
        );
        assert.deepEqual(
          (error as { readonly details?: unknown }).details,
          {
            operation: "Current thread for window window:other",
            reason: "binding-unavailable",
          },
        );
        return true;
      },
    );
    assert.equal(currentReads, 1);

    const preAborted = new AbortController();
    preAborted.abort();
    await assert.rejects(
      context.api.threads.getCurrent("window:threads-options", {
        signal: preAborted.signal,
      }),
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
    assert.equal(currentReads, 1);
    assert.throws(
      () => context!.api.threads.events.subscribe(() => {}, {
        signal: preAborted.signal,
      }),
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
    const resumedMessages: unknown[] = [];
    const unsubscribeResumed = context.api.threads.events.subscribe(
      (message) => resumedMessages.push(message),
      {
        afterCursor: "1",
      },
    );
    assert.deepEqual(resumedMessages, [
      { type: "reset", cursor: "0", reason: "cursor-expired" },
      {
        type: "snapshot",
        cursor: "1",
        value: {
          revision: 1,
          selectedByWindow: {
            "window:threads-options": {
              scope: "execution",
              hostId: "host-options",
              threadId: "thread-1",
            },
          },
          sections: [],
        },
      },
    ]);
    assert.equal(subscriptions, 1);
    unsubscribeResumed();
    assert.equal(disposals, 1);

    const messages: unknown[] = [];
    const controller = new AbortController();
    context.api.threads.events.subscribe(
      (message) => messages.push(message),
      { signal: controller.signal },
    );
    assert.equal(messages.length, 1);
    assert.equal(subscriptions, 2);
    controller.abort();
    assert.equal(disposals, 2);
    listeners[1]?.({ hostId: "host-options", threadId: "thread-2", title: "Second" });
    assert.equal(messages.length, 1);

    const lifetimeMessages: unknown[] = [];
    context.api.threads.events.subscribe((message) =>
      lifetimeMessages.push(message)
    );
    assert.equal(lifetimeMessages.length, 1);
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    assert.equal(disposals, 3);
    listeners[2]?.({ hostId: "host-options", threadId: "thread-3", title: "Third" });
    assert.equal(lifetimeMessages.length, 1);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
    resetAdapterState();
  }
});

test("the exact-build adapter maps the two native list transforms", async () => {
  let threadTransform:
    | ((items: readonly LegacyMenuItem[], thread: LegacyThread) => readonly LegacyMenuItem[])
    | undefined;
  let selectionTransform:
    | ((
        items: readonly LegacySelectionItem[],
        context: LegacySelectionContext,
      ) => readonly LegacySelectionItem[])
    | undefined;
  let disposed = 0;
  let context: RendererExtensionContext | undefined;
  let publicThreadItems: readonly ThreadHeaderMenuItem[] = [];
  let publicSelectionItems: readonly { readonly kind: string; readonly id: string }[] = [];
  let threadActionCount = 0;
  let annotation = "";
  const settingsOpenCalls: Array<{
    readonly paneId: string;
    readonly options: { readonly itemId?: string };
  }> = [];
  const disposable = () => ({
    dispose() {
      disposed += 1;
    },
  });
  const host = {
    appearance: {
      header: {
        registerProperties() {
          return { ...disposable(), update() {} };
        },
        getProperties() {
          return {};
        },
      },
      getColorScheme() {
        return "light" as const;
      },
      openColorPicker() {
        return { ...disposable(), result: Promise.resolve(undefined) };
      },
    },
    menus: {
      thread: {
        transformItems(transform: typeof threadTransform) {
          threadTransform = transform;
          return disposable();
        },
      },
      assistantSelection: {
        transformItems(transform: typeof selectionTransform) {
          selectionTransform = transform;
          return disposable();
        },
      },
    },
    threads: {
      list: {
        registerItem() {
          return { ...disposable(), invalidate() {} };
        },
      },
      getCurrent() {
        return { hostId: "host-1", threadId: "thread-1", title: "Thread" };
      },
      subscribe(listener: (thread: LegacyThread) => void) {
        listener({ hostId: "host-1", threadId: "thread-1", title: "Thread" });
        return disposable();
      },
    },
    settings: {
      ui: {
        toggle: (value: unknown) => value,
        select: (value: unknown) => value,
        button: (value: unknown) => value,
        textField: (value: unknown) => value,
      },
      transformCategories: () => ({ ...disposable(), invalidate() {} }),
      transformGroups: () => ({ ...disposable(), invalidate() {} }),
      transformItems: () => ({ ...disposable(), invalidate() {} }),
      async open(paneId: string, options: { readonly itemId?: string }) {
        settingsOpenCalls.push({ paneId, options });
        return true;
      },
    },
  };
  const module = {
    activate(next: RendererExtensionContext) {
      context = next;
      next.api.contributions.transform("thread.header.menu", (items, owner) => {
        publicThreadItems = items;
        const separatorIndex = items.findIndex((item) => item.kind === "separator");
        const insertionIndex = separatorIndex < 0 ? items.length : separatorIndex;
        const action: ThreadHeaderMenuItem = {
          kind: "action",
          id: "action",
          label: "Action",
          items: [
            {
              kind: "action",
              id: "nested-action",
              label: "Nested action",
            },
          ],
          onActivate() {
            assert.equal(owner.thread?.ref.threadId, "thread-1");
            threadActionCount += 1;
          },
        };
        return [
          ...items.slice(0, insertionIndex),
          action,
          ...items.slice(insertionIndex),
        ];
      });
      next.api.contributions.transform(
        "assistant-selection.actions",
        (items, owner) => {
          publicSelectionItems = items;
          return [
            ...items,
            {
              kind: "action",
              id: "react",
              label: "👍",
              onActivate() {
                void owner.createResponseAnnotation("User reacted with 👍");
              },
            },
          ];
        },
      );
    },
  };

  activateExactBuildRendererExtension(
    host,
    { id: "adapter-test", version: "1.0.0", manifestDigest: "digest" },
    module,
    "renderer",
  );
  assert.equal(context?.extension.id, "adapter-test");
  await context?.api.settings.open({ sectionId: "settings" });
  await context?.api.settings.open({
    sectionId: "reactions.settings",
    controlId: "emojis",
  });
  await context?.api.settings.open({ sectionId: "general-settings" });
  await context?.api.settings.open();
  assert.deepEqual(settingsOpenCalls, [
    { paneId: "adapter-test.settings", options: {} },
    {
      paneId: "reactions.settings",
      options: { itemId: "reactions.settings.emojis" },
    },
    { paneId: "codex.settings.general-settings", options: {} },
    { paneId: "codex.settings.general-settings", options: {} },
  ]);
  const cancelledOpen = new AbortController();
  cancelledOpen.abort();
  await assert.rejects(
    context!.api.settings.open({ signal: cancelledOpen.signal }),
    (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
  );
  assert.equal(settingsOpenCalls.length, 4);
  await assert.rejects(
    context!.api.settings.open({ hostId: "host-1" }),
    /Host-scoped settings navigation is not available/,
  );
  await assert.rejects(
    context!.api.settings.listSections(),
    /Settings section listing is not available/,
  );

  const threadItems = threadTransform?.(
    [
      {
        kind: "action",
        id: "threadHeader.simplified.archive",
        label: "Archive",
      },
      { kind: "separator", id: "native.separator" },
      { kind: "action", id: "native.action", label: "Native action" },
    ],
    {
      hostId: "host-1",
      threadId: "thread-1",
      title: "Thread",
    },
  );
  assert.deepEqual(
    publicThreadItems.map(({ kind, id }) => ({ kind, id })),
    [
      { kind: "action", id: "app.archive" },
      { kind: "separator", id: "app.separator:1" },
      { kind: "opaque", id: "app.opaque:2" },
    ],
  );
  assert.equal(threadItems?.[0]?.id, "threadHeader.simplified.archive");
  assert.equal(threadItems?.[1]?.id, "adapter-test.action");
  assert.equal(threadItems?.[1]?.label, "Action");
  assert.equal(threadItems?.[1]?.items?.[0]?.id, "adapter-test.nested-action");
  assert.equal(threadItems?.[2]?.id, "native.separator");
  assert.equal(threadItems?.[3]?.id, "native.action");
  threadItems?.[1]?.onClick?.({ metaKey: false });
  assert.equal(threadActionCount, 1);

  const selectionItems = selectionTransform?.(
    [
      {
        kind: "action",
        id: "selectedTextOverlay.addToCodex",
        label: "Add to chat",
      },
      { kind: "action", id: "native.react", label: "Native reaction" },
    ],
    {
      selectedText: "Selected",
      async createResponseAnnotation(value) {
        annotation = value;
      },
    },
  );
  assert.deepEqual(
    publicSelectionItems.map(({ kind, id }) => ({ kind, id })),
    [
      { kind: "action", id: "app.add-to-chat" },
      { kind: "opaque", id: "app.opaque:1" },
    ],
  );
  assert.equal(selectionItems?.[0]?.id, "selectedTextOverlay.addToCodex");
  assert.equal(selectionItems?.[1]?.id, "native.react");
  assert.equal(selectionItems?.[2]?.id, "adapter-test.react");
  selectionItems?.[2]?.onClick?.({ metaKey: false });
  await Promise.resolve();
  assert.equal(annotation, "User reacted with 👍");

  deactivateExactBuildRendererExtension("adapter-test", module, "renderer");
  assert.equal(disposed, 2);
});

test("the exact-build UI bridge maps home, sidebar, mode, and composer actions", async () => {
  resetAdapterState();
  interface UiContext {
    readonly ownerId: string;
    readonly mode?: "chatgpt" | "work" | "codex";
    readonly kind?: "main";
    readonly focused?: boolean;
    readonly hostId?: string;
    readonly projectRoot?: string;
    readonly plan?: boolean;
    readonly layout?: "cards" | "list";
    readonly entryPoint?: string;
    readonly workModeAccess?: "chatgpt" | "chatgpt_work" | "work";
    readonly disabled?: boolean;
  }
  interface UiItem {
    readonly kind: "action" | "separator";
    readonly id: string;
    readonly label?: string;
    readonly description?: string;
    readonly disabled?: boolean;
    readonly isActive?: boolean;
    readonly onClick?: (activation?: {
      readonly metaKey?: boolean;
      readonly shiftKey?: boolean;
    }) =>
      | void
      | Promise<void>;
    readonly origin?: "app" | string;
  }
  interface AnnouncementItem {
    readonly kind: "announcement";
    readonly id: string;
    readonly isEligible: boolean;
    readonly title: string;
    readonly description?: string;
    readonly primaryAction?: UiItem;
    readonly dismissAction?: UiItem;
    readonly origin?: "app" | string;
  }
  type UiTransform = (
    items: readonly UiItem[],
    context: UiContext,
  ) => readonly UiItem[];
  type AnnouncementTransform = (
    items: readonly AnnouncementItem[],
    context: UiContext,
  ) => readonly AnnouncementItem[];
  interface ComposerDefinition {
    readonly id: string;
    readonly placement: string;
    readonly label: string;
    readonly menuItems?: readonly UiItem[];
    readonly isVisible?: (context: UiContext) => boolean;
    readonly isDisabled?: (context: UiContext) => boolean;
    readonly onClick: (
      context: UiContext,
      activation?: {
        readonly metaKey?: boolean;
        readonly shiftKey?: boolean;
      },
    ) => void | Promise<void>;
  }

  let suggestionTransform: UiTransform | undefined;
  let announcementTransform: AnnouncementTransform | undefined;
  let destinationTransform: UiTransform | undefined;
  let productModeTransform: UiTransform | undefined;
  let composerDefinition: ComposerDefinition | undefined;
  let disposed = 0;
  const invalidated: Array<string | undefined> = [];
  const disposable = () => ({
    dispose() {
      disposed += 1;
    },
  });
  const host = {
    ui: {
      transformSuggestions(transform: UiTransform) {
        suggestionTransform = transform;
        return {
          ...disposable(),
          invalidate(ownerId?: string) {
            invalidated.push(ownerId);
          },
        };
      },
      transformAnnouncements(transform: AnnouncementTransform) {
        announcementTransform = transform;
        return disposable();
      },
      transformSidebarDestinations(transform: UiTransform) {
        destinationTransform = transform;
        return disposable();
      },
      transformProductModeMenu(transform: UiTransform) {
        productModeTransform = transform;
        return disposable();
      },
      registerComposerAction(definition: ComposerDefinition) {
        composerDefinition = definition;
        return disposable();
      },
    },
  };
  const contexts: Record<string, unknown> = {};
  const evaluationSignals: AbortSignal[] = [];
  const activations: string[] = [];
  let suggestionRegistration:
    | { invalidate(ownerId?: string): void; dispose(): void }
    | undefined;
  const identity = {
    id: "ui-bridge-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(context: RendererExtensionContext) {
      suggestionRegistration = context.api.contributions.transform(
        "home.new-chat-suggestions",
        (items, owner, evaluation) => {
          contexts.suggestion = owner;
          evaluationSignals.push(evaluation.signal);
          return [
            ...items,
            {
              kind: "action",
              id: "custom-suggestion",
              label: "Custom suggestion",
              description: "Open the extension",
              onActivate(actionOwner) {
                assert.equal(actionOwner.ownerId, "home:new-thread");
                activations.push("suggestion");
              },
            },
          ];
        },
      );
      context.api.contributions.transform(
        "home.announcements",
        (items, owner) => {
          contexts.announcement = owner;
          return [
            ...items,
            {
              kind: "announcement",
              id: "custom-promo",
              isEligible: true,
              title: "Try the extension",
              primaryAction: {
                kind: "action",
                id: "start",
                label: "Start",
                onActivate() {
                  activations.push("announcement");
                },
              },
            },
          ];
        },
      );
      context.api.contributions.transform(
        "sidebar.destinations",
        (items, owner) => {
          contexts.sidebar = owner;
          const builtIn = items[0];
          assert.equal(
            builtIn?.kind === "destination"
              ? builtIn.isCurrentDestination?.(owner)
              : undefined,
            true,
          );
          return [
            ...items,
            {
              kind: "destination",
              id: "custom-destination",
              label: "Extension",
              destination: { kind: "extension", routeId: "main" },
              onSelect() {
                activations.push("destination");
              },
            },
          ];
        },
      );
      context.api.contributions.transform(
        "sidebar.product-mode.menu",
        (items, owner) => {
          contexts.productMode = owner;
          return [
            ...items,
            {
              kind: "action",
              id: "custom-mode-action",
              label: "Extension settings",
              onActivate() {
                activations.push("product-mode");
              },
            },
          ];
        },
      );
      context.api.contributions.register("composer-action", {
        kind: "action",
        id: "composer-tool",
        placement: "composer.footer.leading",
        label: "Tool",
        isDisabled: () => false,
        menuItems: [
          {
            kind: "action",
            id: "menu-item",
            label: "Menu item",
            onActivate(owner) {
              assert.equal(owner.composer.focused, true);
              activations.push("composer-menu");
            },
          },
        ],
        onActivate(owner, activation) {
          assert.equal(owner.composer.kind, "main");
          assert.equal(activation.shiftKey, true);
          activations.push("composer-action");
        },
      });
    },
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "renderer");
    assert.ok(suggestionTransform);
    assert.ok(announcementTransform);
    assert.ok(destinationTransform);
    assert.ok(productModeTransform);
    assert.ok(composerDefinition);

    const homeContext: UiContext = {
      ownerId: "home:new-thread",
      mode: "codex",
      kind: "main",
      focused: true,
      hostId: "local-host",
      projectRoot: "/project",
      plan: true,
      layout: "cards",
      entryPoint: "home",
    };
    const suggestions = suggestionTransform(
      [{
        kind: "action",
        id: "codex-explore",
        label: "Explore",
        origin: "app",
      }],
      homeContext,
    );
    assert.deepEqual(suggestions.map((item) => item.id), [
      "codex-explore",
      "ui-bridge-test.custom-suggestion",
    ]);
    assert.equal(
      (contexts.suggestion as { readonly composerMode: string }).composerMode,
      "chat",
    );
    assert.equal(
      (contexts.suggestion as { readonly hostId: string }).hostId,
      "local-host",
    );
    await suggestions[1]?.onClick?.({ metaKey: true });

    const announcements = announcementTransform(
      [{
        kind: "announcement",
        id: "voice",
        isEligible: true,
        title: "Try Voice",
        origin: "app",
      }],
      homeContext,
    );
    assert.deepEqual(announcements.map((item) => item.id), [
      "voice",
      "ui-bridge-test.custom-promo",
    ]);
    await announcements[1]?.primaryAction?.onClick?.();

    const destinations = destinationTransform(
      [{
        kind: "action",
        id: "app.pull-requests",
        label: "Pull requests",
        isActive: true,
        origin: "app",
      }],
      { ownerId: "sidebar:destinations", mode: "codex" },
    );
    assert.deepEqual(destinations.map((item) => item.id), [
      "app.pull-requests",
      "ui-bridge-test.custom-destination",
    ]);
    assert.equal(destinations[0]?.isActive, true);
    await destinations[1]?.onClick?.();

    const productItems = productModeTransform(
      [{
        kind: "action",
        id: "app.work",
        label: "Work",
        origin: "app",
      }],
      {
        ownerId: "sidebar:product-mode",
        mode: "codex",
        workModeAccess: "chatgpt_work",
        disabled: false,
      },
    );
    assert.deepEqual(productItems.map((item) => item.id), [
      "app.work",
      "ui-bridge-test.custom-mode-action",
    ]);
    await productItems[1]?.onClick?.();

    assert.equal(composerDefinition.id, "ui-bridge-test.composer-tool");
    assert.equal(composerDefinition.placement, "composer.footer.leading");
    const composerContext: UiContext = {
      ownerId: "composer:main",
      mode: "codex",
      kind: "main",
      focused: true,
    };
    assert.equal(composerDefinition.isVisible?.(composerContext), true);
    assert.equal(composerDefinition.isDisabled?.(composerContext), false);
    await composerDefinition.menuItems?.[0]?.onClick?.();
    await composerDefinition.onClick(composerContext, {
      metaKey: true,
      shiftKey: true,
    });
    assert.deepEqual(activations, [
      "suggestion",
      "announcement",
      "destination",
      "product-mode",
      "composer-menu",
      "composer-action",
    ]);

    suggestionRegistration?.invalidate("home:new-thread");
    assert.equal(evaluationSignals[0]?.aborted, true);
    assert.deepEqual(invalidated, ["home:new-thread"]);
    assert.equal(disposed, 0);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    assert.equal(disposed, 5);
    resetAdapterState();
  }
});

test("composer render points mount through the exact UI owner and clean up", async () => {
  resetAdapterState();
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousMutationObserver = Object.getOwnPropertyDescriptor(
    globalThis,
    "MutationObserver",
  );
  class FakeElement {
    isConnected = false;
    readonly style: Record<string, string> = {};
  }
  let observerDisconnects = 0;
  class FakeMutationObserver {
    constructor(_callback: MutationCallback) {}
    observe() {}
    disconnect() {
      observerDisconnects += 1;
    }
  }
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: new FakeElement(),
      createElement() {
        return new FakeElement();
      },
    },
  });
  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    value: FakeMutationObserver,
  });

  interface ComposerOwner {
    readonly ownerId: string;
    readonly mode: "codex";
    readonly kind: "main";
    readonly focused: boolean;
  }
  let point = "";
  let provider:
    | ((context: ComposerOwner) => { readonly view: () => HTMLElement } | undefined)
    | undefined;
  const invalidations: Array<string | undefined> = [];
  let legacyDisposals = 0;
  const host = {
    ui: {
      registerRender(
        nextPoint: string,
        nextProvider: (
          context: ComposerOwner,
        ) => { readonly view: () => HTMLElement } | undefined,
      ) {
        point = nextPoint;
        provider = nextProvider;
        return {
          invalidate(ownerId?: string) {
            invalidations.push(ownerId);
          },
          dispose() {
            legacyDisposals += 1;
          },
        };
      },
    },
  };
  const signals: AbortSignal[] = [];
  let renderDisposals = 0;
  let registration:
    | { invalidate(ownerId?: string): void; dispose(): void }
    | undefined;
  const identity = {
    id: "composer-render-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(context: RendererExtensionContext) {
      registration = context.api.contributions.render(
        "composer.utility.leading",
        {
          render(mount) {
            assert.equal(mount.context.composer.kind, "main");
            assert.equal(mount.context.composer.focused, true);
            signals.push(mount.signal);
            return {
              dispose() {
                renderDisposals += 1;
              },
            };
          },
        },
      );
    },
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "renderer");
    assert.equal(point, "composer.utility.leading");
    assert.ok(provider);
    assert.ok(registration);
    const element = provider({
      ownerId: "composer:main",
      mode: "codex",
      kind: "main",
      focused: true,
    })?.view() as FakeElement | undefined;
    assert.ok(element);
    assert.equal(element.style.display, "contents");
    element.isConnected = true;
    await Promise.resolve();
    assert.equal(signals[0]?.aborted, false);

    registration.invalidate("composer:main");
    assert.equal(signals[0]?.aborted, true);
    assert.equal(renderDisposals, 1);
    assert.deepEqual(invalidations, ["composer:main"]);

    const replacement = provider({
      ownerId: "composer:main",
      mode: "codex",
      kind: "main",
      focused: true,
    })?.view() as FakeElement | undefined;
    assert.ok(replacement);
    replacement.isConnected = true;
    await Promise.resolve();
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    assert.equal(signals[1]?.aborted, true);
    assert.equal(renderDisposals, 2);
    assert.equal(legacyDisposals, 1);
    assert.equal(observerDisconnects, 1);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    restoreProperty("document", previousDocument);
    restoreProperty("MutationObserver", previousMutationObserver);
    resetAdapterState();
  }
});

test("rich-content definitions map host JSON, mount, invalidate, and dispose", () => {
  resetAdapterState();
  interface CapturedDefinition {
    readonly id: string;
    readonly matches?: (context: never) => boolean;
    readonly provider: (
      context: never,
      container: HTMLElement,
    ) => { dispose(): void } | undefined;
  }
  const captured = new Map<string, CapturedDefinition>();
  const invalidations: Array<[string, string | undefined]> = [];
  let legacyDisposals = 0;
  const registration = (kind: string, definition: CapturedDefinition) => {
    captured.set(kind, definition);
    return {
      invalidate(ownerId?: string) {
        invalidations.push([kind, ownerId]);
      },
      dispose() {
        legacyDisposals += 1;
      },
    };
  };
  const host = {
    ui: {
      registerAssistantDirective(definition: CapturedDefinition) {
        return registration("assistant-directive", definition);
      },
      registerAssistantContentReference(definition: CapturedDefinition) {
        return registration("assistant-content-reference", definition);
      },
      registerAssistantCodeBlock(definition: CapturedDefinition) {
        return registration("assistant-code-block", definition);
      },
      registerConversationItem(definition: CapturedDefinition) {
        return registration("conversation-item", definition);
      },
    },
  };
  const signals: AbortSignal[] = [];
  const seen: unknown[] = [];
  let renderDisposals = 0;
  let directiveRegistration:
    | { invalidate(ownerId?: string): void }
    | undefined;
  const identity = {
    id: "rich-content-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(context: RendererExtensionContext) {
      directiveRegistration = context.api.contributions.register(
        "assistant-directive",
        {
          id: "probe-directive",
          name: "chatgptx-probe",
          render(mount) {
            seen.push(mount.context);
            signals.push(mount.signal);
            assert.equal(mount.context.directive.attributes.token, "directive");
            assert.equal(
              mount.context.directive.directiveId,
              "chatgptx-probe-directive:0",
            );
            assert.equal(mount.context.directive.terminalInline, true);
            return { dispose: () => { renderDisposals += 1; } };
          },
        },
      );
      context.api.contributions.register("assistant-content-reference", {
        id: "probe-reference",
        type: "chatgptx-probe",
        matches: (value) => value.reference.data.token === "reference",
        render(mount) {
          seen.push(mount.context);
          signals.push(mount.signal);
          assert.deepEqual(mount.context.reference.data, {
            type: "chatgptx-probe",
            token: "reference",
            nested: { value: 42 },
            values: [{ label: "deep" }],
          });
          return { dispose: () => { renderDisposals += 1; } };
        },
      });
      context.api.contributions.register("assistant-code-block", {
        id: "probe-code",
        language: "chatgptx-probe",
        matches: (value) => value.codeBlock.info === "chatgptx-probe",
        render(mount) {
          seen.push(mount.context);
          signals.push(mount.signal);
          assert.equal(mount.context.codeBlock.content, '{"token":"code"}');
          assert.equal(mount.context.codeBlock.info, "chatgptx-probe");
          return { dispose: () => { renderDisposals += 1; } };
        },
      });
      context.api.contributions.register("conversation-item", {
        id: "probe-item",
        type: "chatgptx-probe",
        matches: (value) =>
          value.item.kind === "opaque" &&
          value.item.data.token === "item",
        render(mount) {
          seen.push(mount.context);
          signals.push(mount.signal);
          assert.equal(mount.context.item.kind, "opaque");
          if (mount.context.item.kind === "opaque") {
            assert.equal(mount.context.item.sourceKind, "chatgptx-probe");
            assert.equal(
              (mount.context.item.data.nested as { readonly value: number }).value,
              42,
            );
          }
          return { dispose: () => { renderDisposals += 1; } };
        },
      });
    },
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "renderer");
    assert.equal(captured.size, 4);
    const base = {
      scope: "execution" as const,
      ownerId: "rich-owner",
      conversationId: "conversation-1",
      turnId: "turn-1",
      hostId: "host-1",
      streaming: false,
    };
    const contexts = new Map<string, unknown>([
      [
        "assistant-directive",
        {
          ...base,
          messageId: "turn-message-1",
          directive: {
            name: "chatgptx-probe",
            kind: "leaf",
            attributes: Object.freeze({ token: "directive" }),
            directiveId: "chatgptx-probe-directive:0",
            terminalInline: true,
          },
        },
      ],
      [
        "assistant-content-reference",
        {
          ...base,
          messageId: "reference-message-1",
          reference: {
            type: "chatgptx-probe",
            data: Object.freeze({
              type: "chatgptx-probe",
              token: "reference",
              nested: Object.freeze({ value: 42 }),
              values: Object.freeze([Object.freeze({ label: "deep" })]),
            }),
          },
          index: 0,
          terminalInline: false,
        },
      ],
      [
        "assistant-code-block",
        {
          ...base,
          messageId: "turn-message-1",
          codeBlock: {
            index: 0,
            language: "chatgptx-probe",
            content: '{"token":"code"}',
            fenceOpen: false,
            info: "chatgptx-probe",
          },
        },
      ],
      [
        "conversation-item",
        {
          scope: "execution",
          ownerId: "rich-item-owner",
          conversationId: "conversation-1",
          turnId: "turn-1",
          hostId: "host-1",
          itemType: "chatgptx-probe",
          itemLayout: "standalone",
          item: Object.freeze({
            id: "item-1",
            type: "chatgptx-probe",
            token: "item",
            nested: Object.freeze({ value: 42 }),
            values: Object.freeze([Object.freeze({ label: "deep" })]),
            status: "complete",
          }),
        },
      ],
    ]);
    const mounts: Array<{ dispose(): void }> = [];
    const container = {} as HTMLElement;
    for (const [kind, context] of contexts) {
      const definition = captured.get(kind);
      assert.ok(definition);
      if (definition.matches) {
        assert.equal(definition.matches(context as never), true);
      }
      const mounted = definition.provider(context as never, container);
      assert.ok(mounted);
      mounts.push(mounted);
    }
    assert.equal(seen.length, 4);
    assert.ok(signals.every((signal) => !signal.aborted));
    const directiveSeen = seen[0] as {
      readonly messageId?: string;
      readonly directive: {
        readonly kind: string;
        readonly directiveId?: string;
        readonly terminalInline: boolean;
      };
    };
    assert.equal(directiveSeen.messageId, "turn-message-1");
    assert.deepEqual(
      (directiveSeen as unknown as { readonly thread: unknown }).thread,
      {
        scope: "execution",
        hostId: "host-1",
        threadId: "conversation-1",
      },
    );
    assert.deepEqual(directiveSeen.directive, {
      name: "chatgptx-probe",
      kind: "leaf",
      attributes: { token: "directive" },
      directiveId: "chatgptx-probe-directive:0",
      terminalInline: true,
    });
    const referenceSeen = seen[1] as {
      readonly messageId?: string;
      readonly reference: { readonly data: Record<string, unknown> };
    };
    assert.equal(referenceSeen.messageId, "reference-message-1");
    assert.ok(Object.isFrozen(referenceSeen.reference.data.nested));
    assert.ok(Object.isFrozen(referenceSeen.reference.data.values));
    assert.ok(
      Object.isFrozen(
        (referenceSeen.reference.data.values as readonly object[])[0],
      ),
    );
    assert.ok(
      Object.isFrozen(
        (seen[3] as { readonly item: { readonly data: object } }).item.data,
      ),
    );

    const conversationDefinition = captured.get("conversation-item");
    assert.ok(conversationDefinition);
    const cloudContext = {
      scope: "cloud",
      ownerId: "rich-cloud-item-owner",
      conversationId: "cloud-conversation-1",
      turnId: "cloud-turn-1",
      hostId: "remote-host-1",
      accountId: "account-1",
      workspaceId: "workspace-1",
      itemType: "chatgptx-probe",
      itemLayout: "standalone",
      item: Object.freeze({
        id: "cloud-item-1",
        type: "chatgptx-probe",
        token: "item",
        nested: Object.freeze({ value: 42 }),
        status: "complete",
      }),
    };
    assert.equal(conversationDefinition.matches?.(cloudContext as never), true);
    const cloudMount = conversationDefinition.provider(
      cloudContext as never,
      container,
    );
    assert.ok(cloudMount);
    mounts.push(cloudMount);
    assert.equal(seen.length, 5);
    assert.deepEqual(
      (seen[4] as {
        readonly item: { readonly thread: object };
      }).item.thread,
      {
        scope: "cloud",
        accountId: "account-1",
        workspaceId: "workspace-1",
        threadId: "cloud-conversation-1",
      },
    );
    const { accountId: _accountId, ...cloudWithoutAccount } = cloudContext;
    assert.throws(
      () => conversationDefinition.matches?.(cloudWithoutAccount as never),
      /requires accountId/,
    );

    directiveRegistration?.invalidate("rich-owner");
    assert.deepEqual(invalidations, [["assistant-directive", "rich-owner"]]);

    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    assert.ok(signals.every((signal) => signal.aborted));
    assert.equal(legacyDisposals, 4);
    for (const mount of mounts) mount.dispose();
    assert.equal(renderDisposals, 5);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    resetAdapterState();
  }
});

test("signed-in sidebar menus use cloud identity and asynchronous transforms", async () => {
  resetAdapterState();
  const threadTransforms: Array<
    (
      items: readonly LegacyMenuItem[],
      thread: LegacyThread,
    ) => readonly LegacyMenuItem[] | Promise<readonly LegacyMenuItem[]>
  > = [];
  const sidebarContexts: SidebarThreadRowContext[] = [];
  const sidebarBuiltInIds: string[][] = [];
  let headerCalls = 0;
  let sidebarCalls = 0;
  let actionContext: SidebarThreadRowContext | undefined;
  const host = {
    menus: {
      thread: {
        transformItems(transform: (typeof threadTransforms)[number]) {
          threadTransforms.push(transform);
          return { dispose() {} };
        },
      },
    },
  };
  const identity = {
    id: "signed-in-sidebar-menu-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(context: RendererExtensionContext) {
      context.api.contributions.transform("thread.header.menu", (items) => {
        headerCalls += 1;
        return items;
      });
      context.api.contributions.transform(
        "sidebar.thread-row.menu",
        async (items, owner) => {
          sidebarCalls += 1;
          sidebarContexts.push(owner);
          sidebarBuiltInIds.push(items.map((item) => item.id));
          await Promise.resolve();
          const action: UiMenuItem<SidebarThreadRowContext> = {
            kind: "action",
            id: "inspect",
            label: "Inspect",
            onActivate(nextOwner) {
              actionContext = nextOwner;
            },
          };
          return [...items, action];
        },
      );
    },
  };
  const rawItems: readonly LegacyMenuItem[] = [{
    kind: "action",
    id: "archive-chatgpt-conversation",
    label: "Archive",
  }];
  const headerThread: LegacyThread = {
    scope: "execution",
    surface: "header",
    hostId: "local",
    threadId: "same-thread-id",
    title: "Local thread",
  };
  const firstCloudThread: LegacyThread = {
    scope: "cloud",
    surface: "sidebar",
    accountId: "account-a",
    workspaceId: "workspace-a",
    threadId: "same-thread-id",
    title: "Cloud thread A",
    mode: "chatgpt",
    location: "cloud",
    selected: true,
    pinned: true,
  };
  const secondCloudThread: LegacyThread = {
    ...firstCloudThread,
    accountId: "account-b",
    workspaceId: "workspace-b",
    title: "Cloud thread B",
    selected: false,
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "renderer");
    assert.equal(threadTransforms.length, 2);

    const headerResult = threadTransforms[0]!(rawItems, headerThread);
    assert.ok(!isPromiseLike(headerResult));
    assert.equal(headerCalls, 1);
    assert.deepEqual(
      await threadTransforms[1]!(rawItems, headerThread),
      rawItems,
    );
    assert.equal(sidebarCalls, 0);

    assert.deepEqual(
      await threadTransforms[0]!(rawItems, firstCloudThread),
      rawItems,
    );
    assert.equal(headerCalls, 1);
    assert.throws(
      () =>
        threadTransforms[1]!(rawItems, {
          scope: "cloud",
          surface: "sidebar",
          threadId: "same-thread-id",
          title: "Missing account",
        }),
      /ChatGPT account identity for a cloud thread/,
    );
    const firstResult = await threadTransforms[1]!(rawItems, firstCloudThread);
    const secondResult = await threadTransforms[1]!(rawItems, secondCloudThread);
    assert.equal(sidebarCalls, 2);
    assert.deepEqual(sidebarBuiltInIds, [["app.archive"], ["app.archive"]]);
    assert.equal(firstResult[0]?.id, "archive-chatgpt-conversation");
    assert.equal(firstResult[1]?.id, "signed-in-sidebar-menu-test.inspect");
    assert.equal(secondResult[1]?.id, "signed-in-sidebar-menu-test.inspect");

    assert.deepEqual(sidebarContexts[0]?.thread.ref, {
      scope: "cloud",
      accountId: "account-a",
      workspaceId: "workspace-a",
      threadId: "same-thread-id",
    });
    assert.deepEqual(sidebarContexts[1]?.thread.ref, {
      scope: "cloud",
      accountId: "account-b",
      workspaceId: "workspace-b",
      threadId: "same-thread-id",
    });
    assert.notEqual(sidebarContexts[0]?.ownerId, sidebarContexts[1]?.ownerId);
    assert.equal(sidebarContexts[0]?.selected, true);
    assert.equal(sidebarContexts[0]?.thread.pinned, true);
    assert.equal(sidebarContexts[0]?.thread.mode, "chatgpt");
    assert.equal(sidebarContexts[0]?.thread.location, "cloud");

    firstResult[1]?.onClick?.({ metaKey: true });
    assert.equal(actionContext, sidebarContexts[0]);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    resetAdapterState();
  }
});

test("extension settings events cross renderer documents", async () => {
  const stateKey = Symbol.for("chatgptx.v5.exact-build-adapter.26.825.51511");
  const root = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  const files = new Map<string, string>();
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      const key = `${String(parameters.extensionId)}/${String(parameters.path)}`;
      switch (method) {
        case "extension-storage.read-text":
          return files.get(key) ?? null;
        case "extension-storage.write-text":
          files.set(key, String(parameters.contents));
          return null;
        default:
          throw new Error(`Unexpected runtime request: ${method}`);
      }
    },
  };

  let first: RendererExtensionContext | undefined;
  let second: RendererExtensionContext | undefined;
  const firstModule = {
    activate(context: RendererExtensionContext) {
      first = context;
    },
  };
  const secondModule = {
    activate(context: RendererExtensionContext) {
      second = context;
    },
  };
  const identity = {
    id: "settings-cross-document-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };

  delete root[stateKey];
  activateExactBuildRendererExtension({}, identity, firstModule, "renderer");
  const firstState = root[stateKey];
  delete root[stateKey];
  activateExactBuildRendererExtension({}, identity, secondModule, "renderer");
  const secondState = root[stateKey];

  try {
    assert.ok(first);
    assert.ok(second);
    const received = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for a settings event")),
        1_000,
      );
      const unsubscribe = second!.api.settings
        .events({ kind: "extension" })
        .subscribe((message) => {
          if (
            message.type === "event" &&
            message.value.event.key === "emoji" &&
            typeof message.value.event.value === "string"
          ) {
            clearTimeout(timeout);
            unsubscribe();
            resolve(message.value.event.value);
          }
        });
    });
    await first.api.settings.set("emoji", "👍", {
      scope: { kind: "extension" },
    });
    assert.equal(await received, "👍");
  } finally {
    for (const state of [firstState, secondState]) {
      if (!state || typeof state !== "object") continue;
      const settings = (state as { settings?: Map<string, { channel?: BroadcastChannel }> })
        .settings;
      for (const hub of settings?.values() ?? []) hub.channel?.close();
    }
    delete root[stateKey];
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
  }
});

test("the last active extension phase closes and replaces its settings channel", () => {
  resetAdapterState();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  let channels = 0;
  let closes = 0;
  class FakeBroadcastChannel {
    constructor() {
      channels += 1;
    }
    addEventListener() {}
    unref() {}
    close() {
      closes += 1;
    }
  }
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    writable: true,
    value: FakeBroadcastChannel,
  });
  const identity = {
    id: "settings-channel-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const rendererModule = { activate() {} };
  const settingsModule = { activate() {} };

  try {
    activateExactBuildRendererExtension({}, identity, rendererModule, "renderer");
    activateExactBuildRendererExtension({}, identity, settingsModule, "settings");
    deactivateExactBuildRendererExtension(
      identity.id,
      rendererModule,
      "renderer",
    );
    assert.equal(closes, 0);
    deactivateExactBuildRendererExtension(
      identity.id,
      settingsModule,
      "settings",
    );
    assert.equal(closes, 1);
    activateExactBuildRendererExtension({}, identity, rendererModule, "renderer");
    assert.equal(channels, 2);
    deactivateExactBuildRendererExtension(
      identity.id,
      rendererModule,
      "renderer",
    );
    assert.equal(closes, 2);
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "BroadcastChannel", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "BroadcastChannel");
    }
    resetAdapterState();
  }
});

test("a native settings button runs its registered extension command", async () => {
  const stateKey = Symbol.for("chatgptx.v5.exact-build-adapter.26.825.51511");
  const root = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method) {
      if (method === "extension-storage.read-text") return null;
      if (method === "extension-storage.write-text") return null;
      throw new Error(`Unexpected runtime request: ${method}`);
    },
  };
  delete root[stateKey];

  let categoryTransform:
    | ((categories: readonly LegacySettingsCategory[]) => readonly LegacySettingsCategory[])
    | undefined;
  let groupTransform:
    | ((
        groups: readonly LegacySettingsGroup[],
        pane: LegacySettingsPane,
      ) => readonly LegacySettingsGroup[])
    | undefined;
  let itemTransform:
    | ((
        items: readonly LegacySettingsItem[],
        context: { readonly group: LegacySettingsGroup },
      ) => readonly LegacySettingsItem[])
    | undefined;
  let commandRuns = 0;
  const disposable = () => ({ dispose() {}, invalidate() {} });
  const host = {
    settings: {
      ui: {
        toggle: (options: unknown) => options,
        select: (options: unknown) => options,
        textField: (options: unknown) => options,
        button: (options: unknown) => options,
      },
      transformCategories(transform: typeof categoryTransform) {
        categoryTransform = transform;
        return disposable();
      },
      transformGroups(transform: typeof groupTransform) {
        groupTransform = transform;
        return disposable();
      },
      transformItems(transform: typeof itemTransform) {
        itemTransform = transform;
        return disposable();
      },
      async open() {
        return true;
      },
    },
  };
  const module = {
    activate(context: RendererExtensionContext) {
      context.api.contributions.register("command", {
        id: "reset",
        title: "Reset",
        handler() {
          commandRuns += 1;
        },
      });
      context.api.contributions.register("settings-section", {
        id: "settings",
        title: "Example",
        group: "integrations",
        content: "controls",
        controls: [
          {
            id: "reset",
            type: "button",
            title: "Reset",
            commandId: "reset",
          },
          {
            id: "open-reactions",
            type: "button",
            title: "Open Reactions",
            destination: {
              sectionId: "reactions.settings",
              controlId: "emojis",
            },
          },
        ],
      });
    },
  };

  try {
    activateExactBuildRendererExtension(
      host,
      { id: "settings-command-test", version: "1.0.0", manifestDigest: "digest" },
      module,
      "settings",
    );
    const categories = categoryTransform?.([{ id: "integrations", panes: [] }]);
    const pane = categories?.[0]?.panes[0];
    assert.ok(pane);
    const groups = groupTransform?.([], pane);
    const group = groups?.[0];
    assert.ok(group);
    const items = itemTransform?.([], { group });
    const button = items?.[0]?.control as
      | { readonly disabled: boolean; onClick(): Promise<void> }
      | undefined;
    assert.ok(button);
    assert.equal(button.disabled, false);
    await button.onClick();
    assert.equal(commandRuns, 1);
    assert.deepEqual(items?.[1]?.destination, {
      paneId: "reactions.settings",
      itemId: "reactions.settings.emojis",
    });
  } finally {
    const state = root[stateKey] as
      | { settings?: Map<string, { channel?: BroadcastChannel }> }
      | undefined;
    for (const hub of state?.settings?.values() ?? []) hub.channel?.close();
    delete root[stateKey];
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
  }
});

test("the native settings shape preserves every supported group and control field", async () => {
  resetAdapterState();
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  const writes: string[] = [];
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      if (method === "renderer-entry.report") return null;
      if (method === "extension-storage.read-text") return null;
      if (method === "extension-storage.write-text") {
        writes.push(String(parameters.contents));
        return null;
      }
      throw new Error(`Unexpected runtime request: ${method}`);
    },
  };
  const categoryTransforms: Array<
    (categories: readonly LegacySettingsCategory[]) => readonly LegacySettingsCategory[]
  > = [];
  const groupTransforms: Array<
    (
      groups: readonly LegacySettingsGroup[],
      pane: LegacySettingsPane,
    ) => readonly LegacySettingsGroup[]
  > = [];
  const itemTransforms: Array<
    (
      items: readonly LegacySettingsItem[],
      context: { readonly group: LegacySettingsGroup },
    ) => readonly LegacySettingsItem[]
  > = [];
  const disposable = () => ({ dispose() {}, invalidate() {} });
  const host = {
    settings: {
      ui: {
        toggle: (options: Record<string, unknown>) => ({ kind: "toggle", ...options }),
        select: (options: Record<string, unknown>) => ({ kind: "select", ...options }),
        textField: (options: Record<string, unknown>) => ({ kind: "text", ...options }),
        button: (options: Record<string, unknown>) => ({ kind: "button", ...options }),
      },
      transformCategories(transform: (typeof categoryTransforms)[number]) {
        categoryTransforms.push(transform);
        return disposable();
      },
      transformGroups(transform: (typeof groupTransforms)[number]) {
        groupTransforms.push(transform);
        return disposable();
      },
      transformItems(transform: (typeof itemTransforms)[number]) {
        itemTransforms.push(transform);
        return disposable();
      },
      async open() {
        return true;
      },
    },
  };
  const definitions: readonly NativeSettingsControlsSectionDefinition[] = [
    {
      id: "personal-section",
      title: "Personal section",
      group: "personal",
      content: "controls",
      searchEntries: [{ title: "Personal search", keywords: ["profile"] }],
      controls: [{
        id: "enabled",
        type: "toggle",
        title: "Enabled",
        description: "Personal toggle",
        settingKey: "enabled",
        defaultValue: true,
        disabled: true,
        restartRequired: true,
        destination: { sectionId: "general-settings" },
      }],
    },
    {
      id: "integrations-section",
      title: "Integrations section",
      group: "integrations",
      content: "controls",
      searchEntries: [{ title: "Integrations search", keywords: ["service"] }],
      controls: [{
        id: "choice",
        type: "select",
        title: "Choice",
        settingKey: "choice",
        defaultValue: "two",
        disabled: false,
        options: [
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
        ],
      }],
    },
    {
      id: "coding-section",
      title: "Coding section",
      group: "coding",
      content: "controls",
      searchEntries: [{ title: "Coding search", keywords: ["code"] }],
      controls: [{
        id: "label",
        type: "text",
        title: "Label",
        settingKey: "label",
        defaultValue: "Default",
        placeholder: "Enter label",
        disabled: true,
      }],
    },
    {
      id: "archived-section",
      title: "Archived section",
      group: "archived",
      content: "controls",
      searchEntries: [{ title: "Archived search", keywords: ["old"] }],
      controls: [{
        id: "open-general",
        type: "button",
        title: "Open General",
        description: "Native disclosure",
        destination: { sectionId: "general-settings" },
      }],
    },
  ];
  const module = {
    activate(context: RendererExtensionContext) {
      for (const definition of definitions) {
        context.api.contributions.register("settings-section", definition);
      }
    },
  };
  const identity = {
    id: "settings-shape-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "settings");
    let categories: readonly LegacySettingsCategory[] = definitions.map(
      (definition) => ({ id: definition.group!, panes: [] }),
    );
    for (const transform of categoryTransforms) categories = transform(categories);

    for (const definition of definitions) {
      const paneId = `${identity.id}.${definition.id}`;
      const category = categories.find(({ id }) => id === definition.group);
      const pane = category?.panes.find(({ id }) => id === paneId);
      assert.ok(pane);
      assert.deepEqual(pane.keywords, [
        `${definition.group![0]!.toUpperCase()}${definition.group!.slice(1)} search`,
        definition.searchEntries?.[0]?.keywords?.[0],
      ]);

      let groups: readonly LegacySettingsGroup[] = [];
      for (const transform of groupTransforms) groups = transform(groups, pane);
      const group = groups.find(({ id }) => id === `${paneId}.controls`);
      assert.ok(group);
      assert.equal(
        group.footer,
        definition.group === "personal"
          ? "Changes apply after ChatGPT restarts."
          : undefined,
      );

      let items: readonly LegacySettingsItem[] = [];
      for (const transform of itemTransforms) {
        items = transform(items, { group });
      }
      assert.equal(items.length, 1);
      const item = items[0]!;
      if (definition.group === "personal") {
        assert.deepEqual(item.destination, {
          paneId: "codex.settings.general-settings",
        });
        const control = item.control as {
          readonly kind: string;
          readonly checked: boolean;
          readonly disabled: boolean;
          onChange(value: boolean): Promise<void>;
        };
        assert.equal(control.kind, "toggle");
        assert.equal(control.checked, true);
        assert.equal(control.disabled, true);
        await control.onChange(false);
        assert.equal(JSON.parse(writes.at(-1) ?? "null").enabled, false);
      } else if (definition.group === "integrations") {
        assert.deepEqual(item.control, {
          kind: "select",
          value: "two",
          options: [
            { value: "one", label: "One" },
            { value: "two", label: "Two" },
          ],
          disabled: false,
          onChange: (item.control as { onChange: unknown }).onChange,
        });
      } else if (definition.group === "coding") {
        assert.deepEqual(item.control, {
          kind: "text",
          value: "Default",
          placeholder: "Enter label",
          disabled: true,
          onChange: (item.control as { onChange: unknown }).onChange,
        });
      } else {
        assert.equal(item.control, undefined);
        assert.equal(item.description, "Native disclosure");
        assert.deepEqual(item.destination, {
          paneId: "codex.settings.general-settings",
        });
      }
    }
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "settings");
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
    resetAdapterState();
  }
});

test("a disposed settings section ignores a late storage load", async () => {
  resetAdapterState();
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  let resolveRead: ((value: unknown) => void) | undefined;
  const read = new Promise((resolve) => {
    resolveRead = resolve;
  });
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method) {
      if (method === "renderer-entry.report") return null;
      if (method === "extension-storage.read-text") return read;
      throw new Error(`Unexpected runtime request: ${method}`);
    },
  };
  let itemInvalidations = 0;
  let itemDisposals = 0;
  let section: { dispose(): void } | undefined;
  const host = {
    settings: {
      ui: {
        toggle: (options: unknown) => options,
        select: (options: unknown) => options,
        textField: (options: unknown) => options,
        button: (options: unknown) => options,
      },
      transformCategories() {
        return { invalidate() {}, dispose() {} };
      },
      transformGroups() {
        return { invalidate() {}, dispose() {} };
      },
      transformItems() {
        return {
          invalidate() {
            itemInvalidations += 1;
          },
          dispose() {
            itemDisposals += 1;
          },
        };
      },
      async open() {
        return true;
      },
    },
  };
  const identity = {
    id: "late-settings-load-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(context: RendererExtensionContext) {
      section = context.api.contributions.register("settings-section", {
        id: "settings",
        title: "Settings",
        content: "controls",
        controls: [],
      });
    },
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "settings");
    assert.ok(section);
    section.dispose();
    assert.equal(itemDisposals, 1);
    resolveRead?.(null);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(itemInvalidations, 0);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "settings");
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
    resetAdapterState();
  }
});

test("a native text setting keeps invalid drafts and commits only valid text", async () => {
  const stateKey = Symbol.for("chatgptx.v5.exact-build-adapter.26.825.51511");
  const root = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  const writes: string[] = [];
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      if (method === "extension-storage.read-text") return null;
      if (method === "extension-storage.write-text") {
        writes.push(String(parameters.contents));
        return null;
      }
      throw new Error(`Unexpected runtime request: ${method}`);
    },
  };
  delete root[stateKey];

  let itemTransform:
    | ((
        items: readonly LegacySettingsItem[],
        context: { readonly group: LegacySettingsGroup },
      ) => readonly LegacySettingsItem[])
    | undefined;
  const disposable = () => ({ dispose() {}, invalidate() {} });
  const host = {
    settings: {
      ui: {
        toggle: (options: unknown) => options,
        select: (options: unknown) => options,
        textField: (options: unknown) => options,
        button: (options: unknown) => options,
      },
      transformCategories() {
        return disposable();
      },
      transformGroups() {
        return disposable();
      },
      transformItems(transform: typeof itemTransform) {
        itemTransform = transform;
        return disposable();
      },
      async open() {
        return true;
      },
    },
  };
  const committed: string[] = [];
  const module = {
    activate(context: RendererExtensionContext) {
      context.api.settings
        .events({ kind: "extension" })
        .subscribe((message) => {
          if (
            message.type === "event" &&
            message.value.event.key === "emojis" &&
            typeof message.value.event.value === "string"
          ) {
            committed.push(message.value.event.value);
          }
        });
      context.api.contributions.register("settings-section", {
        id: "settings",
        title: "Draft settings",
        group: "integrations",
        content: "controls",
        controls: [
          {
            id: "emojis",
            type: "text",
            title: "Emojis",
            description: "Enter one or more emoji.",
            settingKey: "emojis",
            defaultValue: "👍",
            validate: (value) =>
              value === "🔥" || value === "👍"
                ? undefined
                : "Enter emoji only.",
          },
        ],
      });
    },
  };

  const renderItem = () => {
    const items = itemTransform?.([], {
      group: { id: "draft-settings-test.settings.controls", items: [] },
    });
    assert.ok(items?.[0]);
    return items[0];
  };

  try {
    activateExactBuildRendererExtension(
      host,
      { id: "draft-settings-test", version: "1.0.0", manifestDigest: "digest" },
      module,
      "settings",
    );
    const initial = renderItem();
    const initialField = initial.control as {
      readonly value: string;
      onChange(value: string): void | Promise<void>;
    };
    assert.equal(initialField.value, "👍");

    await initialField.onChange("");
    const invalid = renderItem();
    assert.equal(
      (invalid.control as { readonly value: string }).value,
      "",
    );
    assert.equal(invalid.description, "Enter emoji only.");
    assert.deepEqual(committed, []);
    assert.deepEqual(writes, []);

    await (
      invalid.control as {
        onChange(value: string): void | Promise<void>;
      }
    ).onChange("🔥");
    const valid = renderItem();
    assert.equal(
      (valid.control as { readonly value: string }).value,
      "🔥",
    );
    assert.equal(valid.description, "Enter one or more emoji.");
    assert.deepEqual(committed, ["🔥"]);
    assert.deepEqual(JSON.parse(writes.at(-1) ?? "null"), { emojis: "🔥" });
  } finally {
    deactivateExactBuildRendererExtension(
      "draft-settings-test",
      module,
      "settings",
    );
    const state = root[stateKey] as
      | { settings?: Map<string, { channel?: BroadcastChannel }> }
      | undefined;
    for (const hub of state?.settings?.values() ?? []) hub.channel?.close();
    delete root[stateKey];
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
  }
});

test("extension settings enforce scope, cancellation, cursor, and phase lifetime", async () => {
  resetAdapterState();
  const stateKey = Symbol.for("chatgptx.v5.exact-build-adapter.26.825.51511");
  const root = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  const storageRequests: string[] = [];
  const writes: string[] = [];
  let resolveInitialRead: ((value: unknown) => void) | undefined;
  const initialRead = new Promise((resolve) => {
    resolveInitialRead = resolve;
  });
  let firstRead = true;
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      if (method === "renderer-entry.report") return null;
      storageRequests.push(method);
      if (method === "extension-storage.read-text") {
        if (firstRead) {
          firstRead = false;
          return initialRead;
        }
        return null;
      }
      if (method === "extension-storage.write-text") {
        writes.push(String(parameters.contents));
        return null;
      }
      throw new Error(`Unexpected runtime request: ${method}`);
    },
  };
  let context: RendererExtensionContext | undefined;
  const identity = {
    id: "settings-options-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(value: RendererExtensionContext) {
      context = value;
    },
  };

  try {
    activateExactBuildRendererExtension({}, identity, module, "renderer");
    assert.ok(context);

    const preAborted = new AbortController();
    preAborted.abort();
    const requestCount = storageRequests.length;
    await assert.rejects(
      context.api.settings.get("theme", { signal: preAborted.signal }),
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
    assert.equal(storageRequests.length, requestCount);
    await assert.rejects(
      context.api.settings.set("theme", "dark", {
        scope: { kind: "account", accountId: "account-1" },
      }),
      (error: unknown) => {
        assert.equal((error as { readonly name?: string }).name, "ChatGPTXApiError");
        assert.equal(
          (error as { readonly code?: string }).code,
          "capability-unavailable",
        );
        return true;
      },
    );
    assert.equal(storageRequests.length, requestCount);

    const inFlightController = new AbortController();
    const inFlight = context.api.settings.set("theme", "dark", {
      signal: inFlightController.signal,
    });
    await Promise.resolve();
    inFlightController.abort();
    resolveInitialRead?.(null);
    await assert.rejects(
      inFlight,
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
    assert.deepEqual(writes, []);

    await context.api.settings.set("theme", "dark", {
      scope: { kind: "extension" },
    });
    assert.equal(await context.api.settings.get("theme"), "dark");
    assert.deepEqual(JSON.parse(writes.at(-1) ?? "null"), { theme: "dark" });

    const messages: unknown[] = [];
    const subscriptionController = new AbortController();
    context.api.settings
      .events({ kind: "extension" })
      .subscribe((message) => messages.push(message), {
        signal: subscriptionController.signal,
      });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(messages.length, 1);
    subscriptionController.abort();
    await context.api.settings.set("theme", "light");
    assert.equal(messages.length, 1);
    const resumedMessages: unknown[] = [];
    const unsubscribeResumed = context.api.settings
      .events({ kind: "extension" })
      .subscribe(
        (message) => resumedMessages.push(message),
        { afterCursor: "1" },
      );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(
      (resumedMessages[0] as { readonly type?: string }).type,
      "reset",
    );
    assert.equal(
      (resumedMessages[0] as { readonly reason?: string }).reason,
      "cursor-expired",
    );
    assert.equal(
      (resumedMessages[1] as { readonly type?: string }).type,
      "snapshot",
    );
    unsubscribeResumed();

    const unsubscribe = context.api.settings
      .events({ kind: "extension" })
      .subscribe(() => {});
    const state = root[stateKey] as {
      settings: Map<string, { listeners: Set<unknown> }>;
    };
    assert.equal(state.settings.get(identity.id)?.listeners.size, 1);
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    assert.equal(state.settings.get(identity.id), undefined);
    unsubscribe();
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
    resetAdapterState();
  }
});

test("the exact-build adapter scopes extension management to the caller", async () => {
  const stateKey = Symbol.for("chatgptx.v5.exact-build-adapter.26.825.51511");
  const root = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  const requests: Array<{
    readonly method: string;
    readonly parameters: Record<string, unknown>;
  }> = [];
  const validResponse = [
    {
      id: "reactions",
      name: "Reactions",
      description: "Adds reactions.",
      version: "1.0.0",
      enabled: true,
      required: false,
      settingsSectionId: "reactions.settings",
    },
  ];
  let response: unknown = validResponse;
  let pendingResponse: Promise<unknown> | undefined;
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      requests.push({ method, parameters });
      if (pendingResponse) return pendingResponse;
      return response;
    },
  };
  delete root[stateKey];

  let context: RendererExtensionContext | undefined;
  const module = {
    activate(next: RendererExtensionContext) {
      context = next;
    },
  };

  try {
    activateExactBuildRendererExtension(
      {},
      { id: "extensions", version: "1.0.0", manifestDigest: "digest" },
      module,
      "renderer",
    );
    assert.ok(context);
    const installed = await context.extensions.list();
    assert.deepEqual(installed, [
      {
        id: "reactions",
        name: "Reactions",
        description: "Adds reactions.",
        version: "1.0.0",
        enabled: true,
        required: false,
        settingsSectionId: "reactions.settings",
      },
    ]);
    await context.extensions.setEnabled("reactions", false);
    assert.deepEqual(requests, [
      {
        method: "renderer-entry.report",
        parameters: {
          extensionId: "extensions",
          phase: "renderer",
          status: "activated",
        },
      },
      {
        method: "extensions.list",
        parameters: { extensionId: "extensions" },
      },
      {
        method: "extensions.set-enabled",
        parameters: {
          extensionId: "extensions",
          targetExtensionId: "reactions",
          enabled: false,
        },
      },
    ]);
    const preAborted = new AbortController();
    preAborted.abort();
    const requestCount = requests.length;
    await assert.rejects(
      context.extensions.list({ signal: preAborted.signal }),
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
    assert.equal(requests.length, requestCount);

    let resolvePending: ((value: unknown) => void) | undefined;
    pendingResponse = new Promise((resolve) => {
      resolvePending = resolve;
    });
    const inFlightController = new AbortController();
    const inFlight = context.extensions.list({
      signal: inFlightController.signal,
    });
    await Promise.resolve();
    inFlightController.abort();
    resolvePending?.(validResponse);
    await assert.rejects(
      inFlight,
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
    pendingResponse = undefined;

    const setEnabledPreAborted = new AbortController();
    setEnabledPreAborted.abort();
    const beforeSetEnabled = requests.length;
    await assert.rejects(
      context.extensions.setEnabled("reactions", false, {
        signal: setEnabledPreAborted.signal,
      }),
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
    assert.equal(requests.length, beforeSetEnabled);

    pendingResponse = new Promise((resolve) => {
      resolvePending = resolve;
    });
    const setEnabledController = new AbortController();
    const setEnabled = context.extensions.setEnabled("reactions", false, {
      signal: setEnabledController.signal,
    });
    await Promise.resolve();
    setEnabledController.abort();
    resolvePending?.(validResponse);
    await assert.rejects(
      setEnabled,
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
    pendingResponse = undefined;

    response = [{ id: "invalid" }];
    await assert.rejects(
      context.extensions.list(),
      /Invalid installed extension listing/,
    );
  } finally {
    deactivateExactBuildRendererExtension("extensions", module, "renderer");
    const state = root[stateKey] as
      | { settings?: Map<string, { channel?: BroadcastChannel }> }
      | undefined;
    for (const hub of state?.settings?.values() ?? []) hub.channel?.close();
    delete root[stateKey];
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
  }
});

test("runtime information honors request cancellation before and during dispatch", async () => {
  resetAdapterState();
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  const requests: string[] = [];
  let pending: Promise<unknown> | undefined;
  let resolvePending: ((value: unknown) => void) | undefined;
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method) {
      requests.push(method);
      if (method === "renderer-entry.report") return null;
      if (method !== "runtime.info") {
        throw new Error(`Unexpected runtime request: ${method}`);
      }
      if (pending) return pending;
      return { apiVersion: "0.2.0" };
    },
  };
  let context: RendererExtensionContext | undefined;
  const identity = {
    id: "runtime-cancellation-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(value: RendererExtensionContext) {
      context = value;
    },
  };

  try {
    activateExactBuildRendererExtension({}, identity, module, "renderer");
    assert.ok(context);
    const preAborted = new AbortController();
    preAborted.abort();
    const requestCount = requests.length;
    await assert.rejects(
      context.api.runtime.getInfo({ signal: preAborted.signal }),
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
    assert.equal(requests.length, requestCount);

    pending = new Promise((resolve) => {
      resolvePending = resolve;
    });
    const controller = new AbortController();
    const operation = context.api.runtime.getInfo({ signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    resolvePending?.({ apiVersion: "0.2.0" });
    await assert.rejects(
      operation,
      (error: unknown) => (error as { readonly name?: string }).name === "AbortError",
    );
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
    resetAdapterState();
  }
});

test("discovery and runtime capabilities report the complete stable UI catalog", async () => {
  resetAdapterState();
  let context: RendererExtensionContext | undefined;
  const identity = {
    id: "adapter-discovery-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(next: RendererExtensionContext) {
      context = next;
    },
  };

  try {
    activateExactBuildRendererExtension({}, identity, module, "renderer");
    assert.ok(context);

    const points = await context.api.contributions.listPoints();
    const transforms = points.filter((point) => point.operation === "transform");
    const renders = points.filter((point) => point.operation === "render");
    assert.equal(points.length, 40);
    assert.equal(transforms.length, 10);
    assert.equal(renders.length, 30);
    assert.deepEqual(
      transforms.map((point) => point.id),
      expectedTransformPoints,
    );
    assert.deepEqual(
      renders.map((point) => point.id),
      expectedRenderPoints,
    );

    const threadHeader = transforms.find(
      (point) => point.id === "thread.header.menu",
    );
    assert.ok(threadHeader);
    assert.equal(threadHeader.state, "available");
    assert.equal(threadHeader.asynchronous, false);
    assert.ok(threadHeader.builtInItemIds.includes("app.archive"));
    assert.equal(
      transforms.find((point) => point.id === "sidebar.destinations")?.state,
      "available",
    );
    assert.deepEqual(
      transforms.find((point) => point.id === "home.new-chat-suggestions")
        ?.builtInItemIds,
      ["codex-explore", "codex-create", "codex-review", "codex-fix"],
    );
    assert.deepEqual(
      transforms.find((point) => point.id === "sidebar.product-mode.menu")
        ?.builtInItemIds,
      ["app.work", "app.codex"],
    );
    assert.deepEqual(
      renders.filter((point) => point.state === "available").map((point) => point.id),
      [
        "sidebar.thread-row.title-prefix",
        "sidebar.thread-row.priority-indicator",
        "composer.footer.leading",
        "composer.footer.trailing",
        "composer.action-bar.leading",
        "composer.action-bar.trailing",
        "composer.utility.leading",
        "composer.utility.trailing",
        "composer.attachments",
      ],
    );
    assert.equal(
      renders.find(
        (point) => point.id === "assistant-message.additional-actions",
      )?.unavailableReason,
      "binding-unavailable",
    );
    const currentWindowPoints = await context.api.contributions.listPoints({
      scope: {
        kind: "window",
        windowId: context.document.windowId,
      },
    });
    assert.equal(
      currentWindowPoints.find((point) => point.id === "thread.header.menu")?.state,
      "available",
    );
    const otherWindowPoints = await context.api.contributions.listPoints({
      scope: { kind: "window", windowId: "window:other" },
    });
    assert.equal(
      otherWindowPoints.find((point) => point.id === "thread.header.menu")?.state,
      "unavailable",
    );
    const executionThreadPoints = await context.api.contributions.listPoints({
      scope: {
        kind: "thread",
        thread: {
          scope: "execution",
          hostId: "host-1",
          threadId: "thread-1",
        },
        windowId: context.document.windowId,
      },
    });
    assert.equal(
      executionThreadPoints.find((point) => point.id === "thread.header.menu")
        ?.state,
      "available",
    );
    assert.deepEqual(
      executionThreadPoints
        .filter((point) => point.state === "available")
        .map((point) => point.id),
      [
        "assistant-selection.actions",
        "thread.header.menu",
        "sidebar.thread-row.title-prefix",
        "sidebar.thread-row.priority-indicator",
      ],
    );
    const cloudThreadPoints = await context.api.contributions.listPoints({
      scope: {
        kind: "thread",
        thread: {
          scope: "cloud",
          accountId: "account-1",
          threadId: "cloud-thread-1",
        },
        windowId: context.document.windowId,
      },
    });
    assert.equal(
      cloudThreadPoints.find((point) => point.id === "thread.header.menu")?.state,
      "unavailable",
    );
    assert.equal(
      cloudThreadPoints.find(
        (point) => point.id === "sidebar.thread-row.menu",
      )?.state,
      "available",
    );
    assert.equal(
      cloudThreadPoints.find(
        (point) => point.id === "sidebar.thread-row.title-prefix",
      )?.state,
      "available",
    );
    assert.equal(
      cloudThreadPoints.find(
        (point) => point.id === "sidebar.thread-row.priority-indicator",
      )?.state,
      "available",
    );
    assert.ok(
      cloudThreadPoints
        .filter((point) =>
          point.id !== "sidebar.thread-row.menu" &&
          point.id !== "sidebar.thread-row.title-prefix" &&
          point.id !== "sidebar.thread-row.priority-indicator"
        )
        .every((point) => point.state === "unavailable"),
    );
    const sharedThreadPoints = await context.api.contributions.listPoints({
      scope: {
        kind: "thread",
        thread: {
          scope: "shared",
          shareId: "share-1",
          threadId: "shared-thread-1",
        },
        windowId: context.document.windowId,
      },
    });
    assert.ok(
      sharedThreadPoints.every((point) => point.state === "unavailable"),
    );

    const definitions = await context.api.contributions.listDefinitionKinds();
    assert.equal(definitions.length, 11);
    assert.deepEqual(
      definitions.map((definition) => definition.kind),
      expectedDefinitionKinds,
    );
    assert.deepEqual(
      definitions
        .filter((definition) => definition.state === "available")
        .map((definition) => definition.kind),
      [
        "assistant-code-block",
        "assistant-content-reference",
        "assistant-directive",
        "command",
        "composer-action",
        "conversation-item",
        "settings-section",
      ],
    );
    const settingsDefinition = definitions.find(
      (definition) => definition.kind === "settings-section",
    );
    assert.ok(settingsDefinition);
    const activeContext = context;
    assert.ok(activeContext);
    const registerInvalidSettings = (definition: unknown) =>
      activeContext.api.contributions.register(
        "settings-section",
        definition as NativeSettingsControlsSectionDefinition,
      );
    assert.deepEqual(settingsDefinition.supportedDefinitionShapes, [
      "native-controls",
    ]);
    const accountDefinitions = await context.api.contributions.listDefinitionKinds({
      scope: { kind: "account", accountId: "account-1" },
    });
    assert.equal(
      accountDefinitions.find((definition) =>
        definition.kind === "settings-section"
      )?.state,
      "unavailable",
    );
    const sharedThreadDefinitions =
      await context.api.contributions.listDefinitionKinds({
        scope: {
          kind: "thread",
          thread: {
            scope: "shared",
            shareId: "share-1",
            threadId: "shared-thread-1",
          },
          windowId: context.document.windowId,
        },
      });
    assert.ok(
      sharedThreadDefinitions.every(
        (definition) => definition.state === "unavailable",
      ),
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "nested.settings",
        title: "Nested settings",
        content: "controls",
        controls: [],
      }),
      /local id without dots/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "rendered",
        title: "Rendered",
        content: "render",
        render: () => undefined,
      }),
      /supports native settings controls only/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "unsupported-control",
        title: "Unsupported control",
        content: "controls",
        controls: [{
          id: "path",
          type: "file",
          title: "Path",
        }],
      }),
      /does not support the file settings control/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "unsupported-link",
        title: "Unsupported link",
        content: "controls",
        controls: [{
          id: "documentation",
          type: "link",
          title: "Documentation",
          href: "https://example.com",
        }],
      }),
      /does not support the link settings control/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "ordered",
        title: "Ordered",
        order: 10,
        content: "controls",
        controls: [],
      }),
      /NativeSettingsControlsSectionDefinition shape only/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "secure",
        title: "Secure",
        content: "controls",
        controls: [{
          id: "secret",
          type: "text",
          title: "Secret",
          settingKey: "secret",
          secure: true,
        }],
      }),
      /does not support secure text settings controls/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "radio",
        title: "Radio",
        content: "controls",
        controls: [{
          id: "choice",
          type: "radio",
          title: "Choice",
          settingKey: "choice",
          options: [{ value: "one", label: "One" }],
        }],
      }),
      /does not support the radio settings control/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "button",
        title: "Button",
        content: "controls",
        controls: [{
          id: "noop",
          type: "button",
          title: "No operation",
        }],
      }),
      /requires commandId or destination/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "button-extra-fields",
        title: "Button extra fields",
        content: "controls",
        controls: [{
          id: "reset",
          type: "button",
          title: "Reset",
          commandId: "reset",
          href: "https://example.com",
          settingKey: "ignored",
        }],
      }),
      /does not support href or settingKey/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "search-entry-id",
        title: "Search entry id",
        content: "controls",
        searchEntries: [{
          id: "discarded",
          title: "Search",
          keywords: ["entry"],
        }],
        controls: [],
      }),
      /does not preserve settings search entry ids/,
    );
    assert.throws(
      () => registerInvalidSettings({
        id: "disabled-destination",
        title: "Disabled destination",
        content: "controls",
        controls: [{
          id: "open",
          type: "button",
          title: "Open",
          destination: { sectionId: "general-settings" },
          disabled: true,
        }],
      }),
      /cannot disable a destination-only button settings control/,
    );
    assert.ok(
      definitions
        .filter((definition) => definition.state === "unavailable")
        .every(
          (definition) =>
            definition.unavailableReason === "binding-unavailable",
        ),
    );

    const capabilities = context.api.runtime.capabilities;
    assert.ok(capabilities);
    const snapshot = await capabilities.getSnapshot();
    const actualUiCapabilityIds = snapshot.statuses
      .map((status) => status.id)
      .filter(
        (id) => id.startsWith("ui.point.") || id.startsWith("ui.definition."),
      );
    const expectedUiCapabilityIds = [
      ...expectedTransformPoints.map((id) => `ui.point.${id}`),
      ...expectedRenderPoints.map((id) => `ui.point.${id}`),
      ...expectedDefinitionKinds.map((kind) => `ui.definition.${kind}`),
    ];
    assert.equal(actualUiCapabilityIds.length, expectedUiCapabilityIds.length);
    assert.deepEqual(actualUiCapabilityIds, expectedUiCapabilityIds);
    const runtimeInfo = await capabilities.get("runtime.info");
    assert.equal(runtimeInfo.state, "available");
    assert.deepEqual(runtimeInfo.operations, ["getInfo"]);
    assert.equal(
      snapshot.statuses.find((status) => status.id === "runtime.info")?.state,
      "available",
    );

    const available = await capabilities.get("ui.point.thread.header.menu");
    assert.equal(available.state, "available");
    assert.deepEqual(available.operations, ["transform"]);
    await capabilities.require("ui.point.thread.header.menu");

    assert.equal((await capabilities.get("settings.read")).state, "available");
    for (const capabilityId of [
      "commands.execute",
      "commands.read",
      "selections.annotate",
      "selections.read",
    ] as const) {
      assert.equal(
        (await capabilities.get(capabilityId)).state,
        "unavailable",
      );
    }
    assert.equal(
      (await capabilities.get("settings.read", {
        scope: { kind: "account", accountId: "account-1" },
      })).state,
      "unavailable",
    );
    assert.equal((await capabilities.get("threads.read")).state, "available");
    assert.equal(
      (await capabilities.get("threads.read", {
        scope: {
          kind: "window",
          windowId: activeContext.document.windowId,
        },
      })).state,
      "available",
    );
    const otherWindowThreads = await capabilities.get("threads.read", {
      scope: { kind: "window", windowId: "window:other" },
    });
    assert.equal(otherWindowThreads.state, "unavailable");
    assert.match(otherWindowThreads.detail ?? "", /requested scope/);

    const unavailable = await capabilities.get(
      "ui.point.assistant-message.additional-actions",
    );
    assert.equal(unavailable.state, "unavailable");
    assert.equal(unavailable.unavailableReason, "binding-unavailable");
    assert.deepEqual(unavailable.operations, []);
    await assert.rejects(
      capabilities.require("ui.point.assistant-message.additional-actions"),
      (error: unknown) => {
        assert.equal((error as { readonly name?: string }).name, "ChatGPTXApiError");
        assert.equal(
          (error as { readonly code?: string }).code,
          "capability-unavailable",
        );
        assert.deepEqual(
          (error as { readonly details?: unknown }).details,
          {
            capabilityId: "ui.point.assistant-message.additional-actions",
            reason: "binding-unavailable",
          },
        );
        return true;
      },
    );
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    resetAdapterState();
  }
});

test("capability events and unavailable declared APIs obey lifetime and error contracts", async () => {
  resetAdapterState();
  let context: RendererExtensionContext | undefined;
  const identity = {
    id: "adapter-unavailable-api-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(next: RendererExtensionContext) {
      context = next;
    },
  };
  const unavailable = (path: string) => (error: unknown) => {
    assert.equal((error as { readonly name?: string }).name, "ChatGPTXApiError");
    assert.equal(
      (error as { readonly code?: string }).code,
      "capability-unavailable",
    );
    assert.deepEqual(
      (error as { readonly details?: unknown }).details,
      {
        operation: `API operation ${path}`,
        reason: "binding-unavailable",
      },
    );
    return true;
  };

  try {
    activateExactBuildRendererExtension({}, identity, module, "renderer");
    assert.ok(context);
    assert.throws(() => context!.api.threads.list(), unavailable("threads.list"));
    assert.throws(
      () => context!.api.commands.events.subscribe(() => {}),
      unavailable("commands.events.subscribe"),
    );
    assert.throws(
      () => context!.api.browser.events.subscribe(() => {}),
      unavailable("browser.events.subscribe"),
    );

    const resumed: unknown[] = [];
    const unsubscribe = context.api.runtime.capabilities.changed.subscribe(
      (message) => resumed.push(message),
      { afterCursor: "old" },
    );
    await Promise.resolve();
    assert.equal((resumed[0] as { readonly type?: string }).type, "reset");
    assert.equal(
      (resumed[0] as { readonly reason?: string }).reason,
      "cursor-expired",
    );
    assert.equal((resumed[1] as { readonly type?: string }).type, "snapshot");
    unsubscribe();

    const stopped: unknown[] = [];
    const capabilities = context.api.runtime.capabilities;
    context.api.runtime.capabilities.changed.subscribe((message) => {
      stopped.push(message);
    });
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    await Promise.resolve();
    assert.deepEqual(stopped, []);
    const inactiveStatus = await capabilities.get("runtime.info");
    assert.equal(inactiveStatus.state, "unavailable");
    assert.equal(
      inactiveStatus.unavailableReason,
      "extension-deactivated",
    );
    const inactiveSnapshot = await capabilities.getSnapshot();
    assert.ok(
      inactiveSnapshot.statuses.every(
        (status) =>
          status.state === "unavailable" &&
          status.unavailableReason === "extension-deactivated",
      ),
    );
    await assert.rejects(
      capabilities.require("runtime.info"),
      (error: unknown) => {
        assert.equal(
          (error as { readonly code?: string }).code,
          "capability-unavailable",
        );
        assert.deepEqual(
          (error as { readonly details?: unknown }).details,
          {
            capabilityId: "runtime.info",
            reason: "extension-deactivated",
          },
        );
        return true;
      },
    );
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    resetAdapterState();
  }
});

test("transform evaluations abort on reevaluation, invalidation, and disposal", () => {
  resetAdapterState();
  const threadTransforms: Array<
    (items: readonly LegacyMenuItem[], thread: LegacyThread) => readonly LegacyMenuItem[]
  > = [];
  const selectionTransforms: Array<
    (
      items: readonly LegacySelectionItem[],
      context: LegacySelectionContext,
    ) => readonly LegacySelectionItem[]
  > = [];
  let threadLegacyDisposals = 0;
  let selectionLegacyDisposals = 0;
  const host = {
    menus: {
      thread: {
        transformItems(transform: (typeof threadTransforms)[number]) {
          threadTransforms.push(transform);
          return {
            dispose() {
              threadLegacyDisposals += 1;
            },
          };
        },
      },
      assistantSelection: {
        transformItems(transform: (typeof selectionTransforms)[number]) {
          selectionTransforms.push(transform);
          return {
            dispose() {
              selectionLegacyDisposals += 1;
            },
          };
        },
      },
    },
    threads: {
      getCurrent() {
        return { hostId: "host-1", threadId: "thread-1", title: "Thread" };
      },
    },
  };
  const threadSignals: AbortSignal[] = [];
  const threadOwnerIds: string[] = [];
  const selectionSignals: AbortSignal[] = [];
  let threadRegistration:
    | { invalidate(ownerId?: string): void; dispose(): void }
    | undefined;
  let selectionRegistration:
    | { invalidate(ownerId?: string): void; dispose(): void }
    | undefined;
  const identity = {
    id: "adapter-transform-lifecycle-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(context: RendererExtensionContext) {
      threadRegistration = context.api.contributions.transform(
        "thread.header.menu",
        (items, owner, evaluation) => {
          threadOwnerIds.push(owner.ownerId);
          threadSignals.push(evaluation.signal);
          return items;
        },
      );
      selectionRegistration = context.api.contributions.transform(
        "assistant-selection.actions",
        (items, _owner, evaluation) => {
          selectionSignals.push(evaluation.signal);
          return items;
        },
      );
    },
  };
  const selectionContext: LegacySelectionContext = {
    selectedText: "Selected",
    async createResponseAnnotation() {},
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "renderer");
    assert.ok(threadRegistration);
    assert.ok(selectionRegistration);
    assert.equal(threadTransforms.length, 1);
    assert.equal(selectionTransforms.length, 1);

    threadTransforms[0]!([], {
      hostId: "host-1",
      threadId: "thread-1",
      title: "Thread",
    });
    threadTransforms[0]!([], {
      hostId: "host-2",
      threadId: "thread-1",
      title: "Thread on second host",
    });
    assert.equal(threadSignals[0]?.aborted, false);
    assert.equal(threadSignals[1]?.aborted, false);
    assert.notEqual(threadOwnerIds[0], threadOwnerIds[1]);

    threadTransforms[0]!([], {
      hostId: "host-1",
      threadId: "thread-1",
      title: "Thread",
    });
    assert.equal(threadSignals[0]?.aborted, true);
    assert.equal(threadSignals[1]?.aborted, false);
    assert.equal(threadSignals[2]?.aborted, false);
    assert.equal(threadOwnerIds[0], threadOwnerIds[2]);

    selectionTransforms[0]!([], selectionContext);
    selectionTransforms[0]!([], selectionContext);
    assert.equal(selectionSignals[0]?.aborted, true);
    assert.equal(selectionSignals[1]?.aborted, false);

    threadRegistration.invalidate(threadOwnerIds[1]);
    selectionRegistration.invalidate("active-selection");
    assert.equal(threadSignals[1]?.aborted, true);
    assert.equal(threadSignals[2]?.aborted, false);
    assert.equal(selectionSignals[1]?.aborted, true);
    assert.equal(threadLegacyDisposals, 1);
    assert.equal(selectionLegacyDisposals, 1);
    assert.equal(threadTransforms.length, 2);
    assert.equal(selectionTransforms.length, 2);

    threadTransforms[1]!([], {
      hostId: "host-1",
      threadId: "thread-1",
      title: "Thread",
    });
    selectionTransforms[1]!([], selectionContext);
    assert.equal(threadSignals[2]?.aborted, true);
    assert.equal(threadSignals[3]?.aborted, false);
    assert.equal(selectionSignals[2]?.aborted, false);

    threadRegistration.dispose();
    selectionRegistration.dispose();
    assert.equal(threadSignals[3]?.aborted, true);
    assert.equal(selectionSignals[2]?.aborted, true);
    assert.equal(threadLegacyDisposals, 2);
    assert.equal(selectionLegacyDisposals, 2);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    resetAdapterState();
  }
});

test("render mounts abort and dispose on native removal, invalidation, and registration disposal", async () => {
  resetAdapterState();
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousMutationObserver = Object.getOwnPropertyDescriptor(
    globalThis,
    "MutationObserver",
  );
  let observerDisconnects = 0;
  let fireObserver: (() => void) | undefined;
  class FakeElement {
    readonly style: Record<string, string> = {};
    isConnected = false;
  }
  class FakeMutationObserver {
    constructor(callback: MutationCallback) {
      fireObserver = () => callback([], this as unknown as MutationObserver);
    }
    observe() {}
    disconnect() {
      observerDisconnects += 1;
    }
  }
  const fakeDocument = {
    documentElement: new FakeElement(),
    querySelectorAll() {
      return [];
    },
    createElement() {
      return new FakeElement();
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument,
  });
  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    value: FakeMutationObserver,
  });

  let provider:
    | ((thread: LegacyThread) => { readonly view: () => HTMLElement } | undefined)
    | undefined;
  const legacyInvalidations: Array<string | undefined> = [];
  let legacyDisposals = 0;
  const host = {
    threads: {
      list: {
        registerItem(
          next: (thread: LegacyThread) =>
            | { readonly view: () => HTMLElement }
            | undefined,
        ) {
          provider = next;
          return {
            invalidate(ownerId?: string) {
              legacyInvalidations.push(ownerId);
            },
            dispose() {
              legacyDisposals += 1;
            },
          };
        },
      },
      getCurrent() {
        return { hostId: "host-1", threadId: "thread-1", title: "Thread" };
      },
    },
  };
  const signals: AbortSignal[] = [];
  const ownerIds: string[] = [];
  const selectedStates: boolean[] = [];
  let renderDisposals = 0;
  let registration:
    | { invalidate(ownerId?: string): void; dispose(): void }
    | undefined;
  const identity = {
    id: "adapter-render-lifecycle-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    activate(context: RendererExtensionContext) {
      registration = context.api.contributions.render(
        "sidebar.thread-row.title-prefix",
        {
          render(mount) {
            signals.push(mount.signal);
            ownerIds.push(mount.ownerId);
            selectedStates.push(mount.context.selected);
            return {
              dispose() {
                renderDisposals += 1;
              },
            };
          },
        },
      );
    },
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "renderer");
    assert.ok(provider);
    assert.ok(registration);
    const firstThread = {
      hostId: "host-1",
      threadId: "thread-1",
      title: "Thread on first host",
    };
    const secondThread = {
      hostId: "host-2",
      threadId: "thread-1",
      title: "Thread on second host",
    };
    const firstElement = provider(firstThread)?.view() as FakeElement | undefined;
    assert.ok(firstElement);
    firstElement.isConnected = true;
    await Promise.resolve();
    assert.equal(signals[0]?.aborted, false);
    const duplicateElement = provider(firstThread)?.view() as
      | FakeElement
      | undefined;
    assert.ok(duplicateElement);
    duplicateElement.isConnected = true;
    await Promise.resolve();
    assert.equal(signals[0]?.aborted, false);
    assert.equal(signals[1]?.aborted, false);
    assert.equal(ownerIds[0], ownerIds[1]);
    assert.equal(renderDisposals, 0);

    const secondElement = provider(secondThread)?.view() as FakeElement | undefined;
    assert.ok(secondElement);
    secondElement.isConnected = true;
    await Promise.resolve();
    assert.equal(signals[2]?.aborted, false);
    assert.notEqual(ownerIds[1], ownerIds[2]);
    assert.deepEqual(selectedStates, [true, true, false]);

    firstElement.isConnected = false;
    fireObserver?.();
    assert.equal(signals[0]?.aborted, true);
    assert.equal(signals[1]?.aborted, false);
    assert.equal(signals[2]?.aborted, false);
    assert.equal(renderDisposals, 1);

    registration.invalidate(ownerIds[1]);
    assert.equal(signals[1]?.aborted, true);
    assert.equal(signals[2]?.aborted, false);
    assert.equal(renderDisposals, 2);
    assert.deepEqual(legacyInvalidations, ["thread-1"]);

    const replacementElement = provider(firstThread)?.view() as
      | FakeElement
      | undefined;
    assert.ok(replacementElement);
    replacementElement.isConnected = true;
    await Promise.resolve();
    assert.equal(signals[3]?.aborted, false);

    const abandonedElement = provider({
      hostId: "host-3",
      threadId: "thread-3",
      title: "Abandoned thread",
    })?.view() as FakeElement | undefined;
    assert.ok(abandonedElement);
    await Promise.resolve();
    assert.equal(signals[4]?.aborted, true);
    assert.equal(renderDisposals, 3);

    registration.dispose();
    assert.equal(signals[2]?.aborted, true);
    assert.equal(signals[3]?.aborted, true);
    assert.equal(renderDisposals, 5);
    assert.equal(legacyDisposals, 1);
    assert.equal(observerDisconnects, 1);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    restoreProperty("document", previousDocument);
    restoreProperty("MutationObserver", previousMutationObserver);
    resetAdapterState();
  }
});

test("a synchronous activation failure clears active state for a retry", () => {
  resetAdapterState();
  const identity = {
    id: "adapter-activation-retry-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  let failedDeactivations = 0;
  let retryActivations = 0;
  const failure = {
    activate() {
      throw new Error("activation failed");
    },
    deactivate() {
      failedDeactivations += 1;
    },
  };
  const retry = {
    activate() {
      retryActivations += 1;
    },
  };
  const previousError = console.error;
  const errors: unknown[][] = [];
  console.error = (...arguments_: unknown[]) => {
    errors.push(arguments_);
  };

  try {
    activateExactBuildRendererExtension({}, identity, failure, "renderer");
    assert.equal(failedDeactivations, 1);
    assert.equal(errors.length, 1);

    activateExactBuildRendererExtension({}, identity, retry, "renderer");
    assert.equal(retryActivations, 1);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, retry, "renderer");
    console.error = previousError;
    resetAdapterState();
  }
});

test("a renderer resource acquired after deactivation is disposed immediately", async () => {
  resetAdapterState();
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  const reports: Array<{ readonly method: string; readonly parameters: unknown }> = [];
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      reports.push({ method, parameters });
      return null;
    },
  };
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let disposed = 0;
  const host = {
    appearance: {
      header: {
        registerProperties() {
          return {
            update() {},
            dispose() {
              disposed += 1;
            },
          };
        },
      },
    },
  };
  const identity = {
    id: "late-renderer-resource-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    async activate(context: RendererExtensionContext) {
      await gate;
      context.api.appearance.header.registerProperties({});
    },
  };

  try {
    activateExactBuildRendererExtension(host, identity, module, "renderer");
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    resume();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(disposed, 1);
    assert.deepEqual(reports, []);
  } finally {
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
    resetAdapterState();
  }
});

test("main-channel subscriptions stop during async renderer deactivation", async () => {
  resetAdapterState();
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  let bridgeListener: ((payload: unknown) => void) | undefined;
  let bridgeDisposals = 0;
  let listenerCalls = 0;
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  globalThis.__CGPTX_RUNTIME__ = {
    async request() {
      return null;
    },
    subscribe(extensionId, event, listener) {
      assert.equal(extensionId, "main-channel-lifetime-test");
      assert.equal(event, "update");
      bridgeListener = listener;
      return () => {
        bridgeDisposals += 1;
      };
    },
  };
  const identity = {
    id: "main-channel-lifetime-test",
    version: "1.0.0",
    manifestDigest: "digest",
  };
  const module = {
    async activate(context: RendererExtensionContext) {
      context.main.on("update", () => {
        listenerCalls += 1;
      });
      await gate;
    },
  };

  try {
    activateExactBuildRendererExtension({}, identity, module, "renderer");
    bridgeListener?.({ value: true });
    assert.equal(listenerCalls, 1);
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    assert.equal(bridgeDisposals, 1);
    bridgeListener?.({ value: false });
    assert.equal(listenerCalls, 1);
    resume();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(bridgeDisposals, 1);
  } finally {
    deactivateExactBuildRendererExtension(identity.id, module, "renderer");
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
    resetAdapterState();
  }
});

function restoreProperty(
  name: "document" | "MutationObserver",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, name);
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { readonly then?: unknown }).then === "function"
  );
}

function resetAdapterState(): void {
  const stateKey = Symbol.for("chatgptx.v5.exact-build-adapter.26.825.51511");
  const root = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  const state = root[stateKey] as
    | { settings?: Map<string, { channel?: BroadcastChannel }> }
    | undefined;
  for (const hub of state?.settings?.values() ?? []) hub.channel?.close();
  delete root[stateKey];
}

interface LegacyThread {
  readonly scope?: "execution" | "cloud";
  readonly surface?: "header" | "sidebar";
  readonly hostId?: string;
  readonly accountId?: string;
  readonly workspaceId?: string;
  readonly threadId: string;
  readonly title: string;
  readonly workingDirectory?: string;
  readonly mode?: "chatgpt" | "work" | "codex";
  readonly location?: "cloud" | "local" | "remote" | "shared";
  readonly selected?: boolean;
  readonly archived?: boolean;
  readonly pinned?: boolean;
  readonly unread?: boolean;
  readonly temporary?: boolean;
}

interface LegacyMenuItem {
  readonly kind: "action" | "separator";
  readonly id: string;
  readonly label?: string;
  readonly onClick?: (activation: { readonly metaKey?: boolean }) => void;
  readonly items?: readonly LegacyMenuItem[];
}

interface LegacySelectionItem {
  readonly kind: "action";
  readonly id: string;
  readonly label: string;
  readonly onClick?: (activation: { readonly metaKey?: boolean }) => void;
}

interface LegacySelectionContext {
  readonly selectedText: string;
  createResponseAnnotation(value: string): Promise<void>;
}

interface LegacySettingsCategory {
  readonly id: string;
  readonly panes: readonly LegacySettingsPane[];
}

interface LegacySettingsPane {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
}

interface LegacySettingsGroup {
  readonly id?: string;
  readonly title?: string;
  readonly footer?: string;
  readonly items: readonly LegacySettingsItem[];
}

interface LegacySettingsItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly destination?: {
    readonly paneId: string;
    readonly itemId?: string;
  };
  readonly control?: unknown;
}
