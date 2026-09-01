"use strict";
(() => {
  // runtime/renderer-host.ts
  var extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/;
  var semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  var appVersionPattern = /^\d+(?:\.\d+)+$/;
  var digestPattern = /^[a-f0-9]{64}$/;
  function validateIdentity(value) {
    if (!value || typeof value !== "object") {
      throw new TypeError("A renderer extension identity is required");
    }
    if (!extensionIdPattern.test(value.id)) {
      throw new TypeError("Invalid renderer extension id");
    }
    if (!semanticVersionPattern.test(value.version)) {
      throw new TypeError("Invalid renderer extension version");
    }
    if (!digestPattern.test(value.manifestDigest)) {
      throw new TypeError("Invalid renderer extension manifest digest");
    }
  }
  function validateModule(value) {
    if (!value || typeof value !== "object" || typeof value.activate !== "function") {
      throw new TypeError("The renderer bundle must export activate");
    }
    if (value.deactivate !== void 0 && typeof value.deactivate !== "function") {
      throw new TypeError("The renderer bundle deactivate export must be a function");
    }
  }
  function validateAdapter(adapter) {
    if (!adapter || typeof adapter !== "object" || !appVersionPattern.test(adapter.version) || typeof adapter.activate !== "function" || typeof adapter.deactivate !== "function") {
      throw new TypeError("A valid renderer binding adapter is required");
    }
  }
  function createRendererHost(adapter) {
    validateAdapter(adapter);
    const registered = /* @__PURE__ */ new Map();
    let deactivated = false;
    function bridge2(identity, module, phase) {
      return Object.freeze({
        activate(hostApi) {
          adapter.activate(hostApi, identity, module, phase);
        },
        deactivate() {
          adapter.deactivate(identity.id, module, phase);
        }
      });
    }
    function registerRendererEntry(identity, phase, module, settingsSectionId) {
      validateIdentity(identity);
      validateModule(module);
      if (phase !== "renderer" && phase !== "settings") {
        throw new TypeError("Invalid renderer extension phase");
      }
      const exactHost = globalThis.__CGPTX_HOST__;
      if (!exactHost || exactHost.version !== adapter.version) {
        throw new Error(`The ChatGPT ${adapter.version} binding host is unavailable`);
      }
      const key = `${identity.id}:${phase}`;
      if (deactivated) {
        throw new Error("The renderer document is inactive");
      }
      if (registered.has(key)) return true;
      const entry = bridge2(identity, module, phase);
      if (phase === "settings") {
        if (typeof settingsSectionId !== "string" || !settingsSectionId.startsWith(`${identity.id}.`) || settingsSectionId.length <= identity.id.length + 1) {
          throw new TypeError("Invalid renderer extension settings section id");
        }
        exactHost.registerExtensionSettings(identity.id, entry, settingsSectionId);
      } else {
        if (settingsSectionId !== void 0) {
          throw new TypeError("A renderer entry cannot declare a settings section id");
        }
        exactHost.registerExtension(identity.id, entry);
      }
      registered.set(key, entry);
      return true;
    }
    function registeredRendererEntries() {
      return Object.freeze([...registered.keys()].sort());
    }
    function deactivateRendererEntries() {
      if (deactivated) return;
      deactivated = true;
      for (const entry of [...registered.values()].reverse()) {
        try {
          entry.deactivate?.();
        } catch (error) {
          console.error("Renderer entry deactivation failed", error);
        }
      }
    }
    const host = Object.freeze({
      registerRendererEntry,
      registeredRendererEntries,
      deactivateRendererEntries
    });
    globalThis.addEventListener?.("pagehide", deactivateRendererEntries, {
      once: true
    });
    return host;
  }

  // runtime/extension-storage.ts
  function bridge() {
    const runtime = globalThis.__CGPTX_RUNTIME__;
    if (!runtime || typeof runtime.request !== "function") {
      throw new Error("ChatGPTX runtime is unavailable");
    }
    return runtime;
  }
  function createExtensionStorage(extensionId) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(extensionId)) {
      throw new TypeError("Invalid extension id");
    }
    const request = async (method, parameters, options) => {
      options?.signal?.throwIfAborted();
      const result = await bridge().request(method, { extensionId, ...parameters });
      options?.signal?.throwIfAborted();
      return result;
    };
    return Object.freeze({
      async listFiles(options) {
        const result = await request("extension-storage.list", {}, options);
        if (!Array.isArray(result) || !result.every((entry) => typeof entry === "string")) {
          throw new TypeError("Invalid extension storage listing");
        }
        return Object.freeze([...result]);
      },
      async readTextFile(file, options) {
        const result = await request(
          "extension-storage.read-text",
          { path: file },
          options
        );
        if (result === null) return void 0;
        if (typeof result !== "string") {
          throw new TypeError("Invalid extension storage contents");
        }
        return result;
      },
      async writeTextFile(file, contents, options) {
        await request(
          "extension-storage.write-text",
          {
            path: file,
            contents
          },
          options
        );
      },
      async deleteFile(file, options) {
        await request("extension-storage.delete", { path: file }, options);
      }
    });
  }

  // runtime/bindings/26.820.80927/renderer-adapter.ts
  var globalStateKey = Symbol.for("chatgptx.v5.exact-build-adapter.26.820.80927");
  var settingsFile = "chatgptx-settings.json";
  var extensionIdPattern2 = /^[a-z0-9][a-z0-9._-]*$/;
  var threadBuiltInIds = /* @__PURE__ */ new Map([
    ["threadHeader.simplified.archive", "app.archive"],
    ["threadHeader.simplified.pin", "app.pin"],
    ["threadHeader.simplified.unpin", "app.unpin"],
    ["threadHeader.simplified.rename", "app.rename"],
    ["threadHeader.copyAppLink", "app.copy-deep-link"],
    ["copyConversationMarkdown", "app.copy-markdown"],
    ["copyWorkingDirectory", "app.copy-working-directory"],
    ["forkIntoLocal", "app.fork-local"],
    ["forkIntoSameWorktree", "app.fork-worktree"],
    ["forkIntoWorktree", "app.fork-worktree"],
    ["newChatInWorktree", "app.new-chat-in-worktree"],
    ["openInNewWindow", "app.open-in-new-window"],
    ["openSideChat", "app.open-side-chat"],
    ["sidebarElectron.archiveThread", "app.archive"],
    ["sidebarElectron.archiveThreadShort", "app.archive"],
    ["sidebarElectron.pinThread", "app.pin"],
    ["sidebarElectron.pinThreadShort", "app.pin"],
    ["sidebarElectron.unpinThread", "app.unpin"],
    ["sidebarElectron.unpinThreadShort", "app.unpin"],
    ["sidebarElectron.renameThread", "app.rename"],
    ["sidebarElectron.renameThreadShort", "app.rename"],
    ["sidebar.threadProject.moveToProject", "app.move-to-project"],
    ["pin-chatgpt-conversation", "app.pin"],
    ["unpin-chatgpt-conversation", "app.unpin"],
    ["rename-chatgpt-conversation", "app.rename"],
    ["archive-chatgpt-conversation", "app.archive"],
    ["delete-chatgpt-conversation", "app.delete"],
    ["move-chatgpt-conversation-to-project", "app.move-to-project"],
    ["share-chatgpt-conversation", "app.share"],
    ["open-in-chatgpt", "app.open-in-chatgpt"],
    ["open-in-quick-chat", "app.open-in-quick-chat"],
    ["handoff", "app.handoff"]
  ]);
  var selectionBuiltInIds = /* @__PURE__ */ new Map([
    ["selectedTextOverlay.addToCodex", "app.add-to-chat"],
    ["selectedTextOverlay.moreDetails", "app.more-details"],
    ["selectedTextOverlay.askInSideChat", "app.ask-in-side-chat"]
  ]);
  var homeSuggestionBuiltInIds = /* @__PURE__ */ new Set([
    "codex-explore",
    "codex-create",
    "codex-review",
    "codex-fix"
  ]);
  var productModeBuiltInIds = /* @__PURE__ */ new Set(["app.work", "app.codex"]);
  var sidebarBuiltInIds = /* @__PURE__ */ new Set([
    "app.archive",
    "app.automations",
    "app.debug",
    "app.finance",
    "app.library",
    "app.projects",
    "app.pull-requests",
    "app.security",
    "app.sites",
    "app.skills"
  ]);
  function isSidebarBuiltInId(id) {
    return sidebarBuiltInIds.has(id) || id.startsWith("app.mcp:");
  }
  var listPointIds = [
    "home.new-chat-suggestions",
    "home.announcements",
    "assistant-selection.actions",
    "thread.header.menu",
    "sidebar.destinations",
    "sidebar.product-mode.menu",
    "sidebar.thread-row.actions",
    "sidebar.thread-row.menu",
    "profile.menu",
    "surface.new-tab"
  ];
  var renderPointIds = [
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
    "bottom-panel.empty-state"
  ];
  var definitionKinds = [
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
    "settings-section"
  ];
  var asynchronousListPoints = /* @__PURE__ */ new Set([
    "sidebar.thread-row.menu",
    "profile.menu"
  ]);
  var availableListPoints = /* @__PURE__ */ new Set([
    "assistant-selection.actions",
    "thread.header.menu",
    "sidebar.destinations",
    "sidebar.product-mode.menu",
    "sidebar.thread-row.menu"
  ]);
  var availableRenderPoints = /* @__PURE__ */ new Set([
    "sidebar.thread-row.title-prefix",
    "sidebar.thread-row.priority-indicator",
    "composer.footer.leading",
    "composer.footer.trailing",
    "composer.action-bar.leading",
    "composer.action-bar.trailing",
    "composer.utility.leading",
    "composer.utility.trailing",
    "composer.attachments"
  ]);
  var availableDefinitionKinds = /* @__PURE__ */ new Set([
    "assistant-code-block",
    "assistant-content-reference",
    "assistant-directive",
    "command",
    "conversation-item",
    "composer-action",
    "settings-section"
  ]);
  var nativeSettingsControlTypes = [
    "toggle",
    "text",
    "select",
    "button"
  ];
  var nativeSettingsControlTypeSet = new Set(nativeSettingsControlTypes);
  var nativeSettingsGroups = /* @__PURE__ */ new Set([
    "personal",
    "integrations",
    "coding",
    "archived"
  ]);
  var builtInSettingsSectionIds = /* @__PURE__ */ new Set([
    "agent",
    "appearance",
    "appshots",
    "browser-use",
    "chronicle",
    "cloud-environments",
    "cloud-settings",
    "code-review",
    "debug",
    "environments",
    "general-settings",
    "git-settings",
    "hooks-settings",
    "import",
    "keyboard-shortcuts",
    "local-environments",
    "mcp-settings",
    "personalization",
    "plugins-settings",
    "skills-settings",
    "usage",
    "voice",
    "worktrees"
  ]);
  var builtInCapabilityIds = [
    "accounts.read",
    "accounts.write",
    "appearance.color-picker",
    "appearance.read",
    "appearance.write",
    "apps.invoke",
    "apps.read",
    "artifacts.read",
    "automations.read",
    "automations.write",
    "browser.control",
    "browser.read",
    "commands.execute",
    "commands.read",
    "composer.draft",
    "composer.interrupt",
    "composer.queue",
    "composer.steer",
    "composer.submit",
    "files.read",
    "files.write",
    "goals.read",
    "goals.write",
    "mcp.invoke",
    "mcp.read",
    "messages.branch",
    "messages.edit",
    "messages.read",
    "messages.regenerate",
    "messages.stream",
    "models.read",
    "navigation.read",
    "navigation.write",
    "native.electron",
    "native.macos",
    "native.node",
    "native.objc",
    "notifications.hide",
    "notifications.show",
    "plugins.manage",
    "plugins.read",
    "projects.read",
    "projects.write",
    "pull-requests.read",
    "pull-requests.write",
    "review.read",
    "review.write",
    "runtime.info",
    "settings.read",
    "settings.write",
    "selections.annotate",
    "selections.read",
    "sidebar.read",
    "sidebar.write",
    "skills.manage",
    "skills.read",
    "sources.read",
    "subagents.read",
    "summaries.read",
    "summaries.write",
    "surfaces.layout",
    "surfaces.open",
    "surfaces.read",
    "terminal.read",
    "terminal.use",
    "threads.delete",
    "threads.fork",
    "threads.list",
    "threads.pin",
    "threads.read",
    "threads.search",
    "threads.write",
    "toasts.close",
    "toasts.show",
    "ui.contribute",
    "workspaces.read"
  ];
  var availableCapabilityOperations = /* @__PURE__ */ new Map([
    ["appearance.color-picker", ["openColorPicker"]],
    ["appearance.read", ["getColorScheme", "header.getProperties"]],
    ["appearance.write", ["header.registerProperties"]],
    ["runtime.info", ["getInfo"]],
    ["settings.read", ["get", "events", "open"]],
    ["settings.write", ["set", "delete", "batch"]],
    ["threads.read", ["getCurrent", "events"]],
    ["ui.contribute", ["transform", "render", "register"]]
  ]);
  function randomId(prefix) {
    const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
  }
  function adapterState() {
    const root = globalThis;
    const runtimeDocument = globalThis.__CGPTX_RUNTIME__?.document;
    root[globalStateKey] ??= {
      documentId: runtimeDocument?.id ?? randomId("document"),
      windowId: runtimeDocument?.windowId ?? randomId("window"),
      active: /* @__PURE__ */ new Map(),
      commands: /* @__PURE__ */ new Map(),
      settings: /* @__PURE__ */ new Map(),
      sequence: 0
    };
    return root[globalStateKey];
  }
  function threadRef(thread) {
    if (thread.scope === "cloud") {
      if (typeof thread.accountId !== "string" || thread.accountId.length === 0) {
        return unsupported("ChatGPT account identity for a cloud thread");
      }
      return {
        scope: "cloud",
        accountId: thread.accountId,
        ...typeof thread.workspaceId === "string" && thread.workspaceId.length > 0 ? { workspaceId: thread.workspaceId } : {},
        threadId: thread.threadId
      };
    }
    if (typeof thread.hostId !== "string" || thread.hostId.length === 0) {
      return unsupported("ChatGPT thread host identity");
    }
    return {
      scope: "execution",
      hostId: thread.hostId,
      threadId: thread.threadId
    };
  }
  function threadOwnerId(thread) {
    const ref = threadRef(thread);
    return ref.scope === "cloud" ? JSON.stringify([
      ref.scope,
      ref.accountId,
      ref.workspaceId ?? null,
      ref.threadId
    ]) : JSON.stringify([ref.scope, ref.hostId, ref.threadId]);
  }
  function threadSummary(thread) {
    return Object.freeze({
      ref: threadRef(thread),
      title: thread.title,
      mode: thread.mode ?? (thread.scope === "cloud" ? "chatgpt" : "codex"),
      location: thread.location ?? (thread.scope === "cloud" ? "cloud" : "local"),
      archived: thread.archived ?? false,
      pinned: thread.pinned ?? false,
      unread: thread.unread ?? false,
      temporary: thread.temporary ?? false,
      state: "idle",
      operations: Object.freeze([])
    });
  }
  function sameThreadIdentity(left, right) {
    return left !== void 0 && threadOwnerId(left) === threadOwnerId(right);
  }
  function activation(value) {
    return Object.freeze({
      source: "unknown",
      ...value?.metaKey === void 0 ? {} : { metaKey: value.metaKey },
      ...value?.shiftKey === void 0 ? {} : { shiftKey: value.shiftKey },
      ...value?.altKey === void 0 ? {} : { altKey: value.altKey },
      ...value?.controlKey === void 0 ? {} : { controlKey: value.controlKey }
    });
  }
  function legacyActivation(value) {
    return Object.freeze({
      ...value.metaKey === void 0 ? {} : { metaKey: value.metaKey },
      ...value.shiftKey === void 0 ? {} : { shiftKey: value.shiftKey },
      ...value.altKey === void 0 ? {} : { altKey: value.altKey },
      ...value.controlKey === void 0 ? {} : { controlKey: value.controlKey }
    });
  }
  function headerContext(thread) {
    const state = adapterState();
    return Object.freeze({
      kind: "thread",
      ownerId: threadOwnerId(thread),
      windowId: state.windowId,
      thread: threadSummary(thread)
    });
  }
  function sidebarThreadRowContext(thread) {
    const state = adapterState();
    return Object.freeze({
      ownerId: threadOwnerId(thread),
      windowId: state.windowId,
      thread: threadSummary(thread),
      selected: thread.selected ?? false
    });
  }
  function isAppOwned(origin) {
    return origin === void 0 || origin === "app";
  }
  function opaqueItem(item, mapping) {
    let id;
    do {
      mapping.opaqueSequence += 1;
      id = `app.opaque:${mapping.opaqueSequence}`;
    } while (mapping.rawByPublicId.has(id));
    mapping.rawByPublicId.set(id, item);
    return Object.freeze({
      kind: "opaque",
      id,
      ...item.label === void 0 ? {} : { label: item.label },
      origin: "app"
    });
  }
  function publicThreadMenuItem(item, context, mapping) {
    const appOwned = isAppOwned(item.origin);
    const stableId = appOwned ? threadBuiltInIds.get(item.id) : void 0;
    if (item.kind === "separator") {
      let id2;
      do {
        mapping.opaqueSequence += 1;
        id2 = `app.separator:${mapping.opaqueSequence}`;
      } while (mapping.rawByPublicId.has(id2));
      mapping.rawByPublicId.set(id2, item);
      return Object.freeze({
        kind: "separator",
        id: id2,
        origin: appOwned ? "app" : `extension:${item.origin}`
      });
    }
    if (appOwned && stableId === void 0) {
      return opaqueItem(item, mapping);
    }
    const id = stableId ?? item.id;
    if (mapping.rawByPublicId.has(id)) return opaqueItem(item, mapping);
    mapping.rawByPublicId.set(id, item);
    return Object.freeze({
      kind: "action",
      id,
      label: item.label ?? id,
      ...item.icon === void 0 ? {} : { icon: item.icon },
      ...item.rightIcon === void 0 ? {} : { rightIcon: item.rightIcon },
      ...item.subText === void 0 ? {} : { subText: item.subText },
      ...item.keyboardShortcut === void 0 ? {} : { keybinding: item.keyboardShortcut },
      ...item.disabled === void 0 ? {} : { disabled: item.disabled },
      ...item.items === void 0 ? {} : {
        items: item.items.map(
          (child) => publicThreadMenuItem(child, context, mapping)
        )
      },
      ...item.onClick === void 0 ? {} : {
        onActivate: (_owner, next) => item.onClick?.(legacyActivation(next))
      },
      origin: appOwned ? "app" : `extension:${item.origin}`
    });
  }
  function legacyThreadMenuItem(item, context, extensionId, mapping) {
    const existing = mapping.rawByPublicId.get(item.id);
    if (item.kind === "opaque") {
      if (!existing) {
        throw new Error(`Opaque thread item is not from this evaluation: ${item.id}`);
      }
      return existing;
    }
    const id = existing?.id ?? namespacedId(extensionId, item.id);
    if (item.kind === "separator") {
      return { kind: "separator", id };
    }
    const existingAction = existing?.kind === "action" ? existing : void 0;
    const icon = item.icon ?? existingAction?.icon;
    const rightIcon = item.rightIcon ?? existingAction?.rightIcon;
    const subText = item.subText ?? existingAction?.subText;
    const keyboardShortcut = item.keybinding ?? existingAction?.keyboardShortcut;
    const disabled = item.disabled ?? existingAction?.disabled;
    const children = item.items ?? existingAction?.items;
    return {
      kind: "action",
      id,
      label: item.label,
      ...icon === void 0 ? {} : { icon },
      ...rightIcon === void 0 ? {} : { rightIcon },
      ...subText === void 0 ? {} : { subText },
      ...keyboardShortcut === void 0 ? {} : { keyboardShortcut },
      ...disabled === void 0 ? {} : { disabled },
      ...children === void 0 ? {} : {
        items: children.map(
          (child) => legacyThreadMenuItem(
            child,
            context,
            extensionId,
            mapping
          )
        )
      },
      ...item.onActivate === void 0 && existingAction?.onClick === void 0 ? {} : item.onActivate === void 0 ? { onClick: existingAction.onClick } : {
        onClick: (next) => {
          const onActivate = item.onActivate;
          onActivate?.(context, activation(next));
        }
      }
    };
  }
  function selectionContext(context, currentThread) {
    const state = adapterState();
    if (!currentThread) {
      throw new Error("The current binding did not provide the selection thread");
    }
    const ownerId = threadOwnerId(currentThread);
    return Object.freeze({
      id: `${ownerId}:${context.selectedText}`,
      ownerId,
      windowId: state.windowId,
      thread: threadRef(currentThread),
      selectedText: context.selectedText,
      rects: Object.freeze([]),
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      createResponseAnnotation: (annotation, options) => context.createResponseAnnotation(annotation, options)
    });
  }
  function selectionTreeHasUnmappedAppItem(items) {
    return items?.some(
      (item) => isAppOwned(item.origin) && !selectionBuiltInIds.has(item.id) || selectionTreeHasUnmappedAppItem(item.items)
    ) ?? false;
  }
  function publicSelectionItem(item, context, mapping) {
    const appOwned = isAppOwned(item.origin);
    const stableId = appOwned ? selectionBuiltInIds.get(item.id) : void 0;
    const hasOpaqueChild = selectionTreeHasUnmappedAppItem(item.items);
    if (appOwned && (stableId === void 0 || hasOpaqueChild)) {
      return opaqueItem(item, mapping);
    }
    const id = stableId ?? item.id;
    if (mapping.rawByPublicId.has(id)) return opaqueItem(item, mapping);
    mapping.rawByPublicId.set(id, item);
    return Object.freeze({
      kind: "action",
      id,
      label: item.label,
      ...item.placement === void 0 ? {} : { placement: item.placement },
      ...item.labelScale === void 0 ? {} : { labelScale: item.labelScale },
      ...item.verticalPadding === void 0 ? {} : { verticalPadding: item.verticalPadding },
      ...item.disabled === void 0 ? {} : { disabled: item.disabled },
      ...item.items === void 0 ? {} : {
        items: item.items.map(
          (child) => publicSelectionItem(child, context, mapping)
        )
      },
      ...item.onClick === void 0 ? {} : {
        onActivate: (_owner, next) => item.onClick?.(legacyActivation(next))
      },
      origin: appOwned ? "app" : `extension:${item.origin}`
    });
  }
  function legacySelectionItem(item, context, extensionId, mapping) {
    const existing = mapping.rawByPublicId.get(item.id);
    if (item.kind === "opaque") {
      if (!existing) {
        throw new Error(`Opaque selection item is not from this evaluation: ${item.id}`);
      }
      return existing;
    }
    const id = existing?.id ?? namespacedId(extensionId, item.id);
    const placement = item.placement ?? existing?.placement;
    const labelScale = item.labelScale ?? existing?.labelScale;
    const verticalPadding = item.verticalPadding ?? existing?.verticalPadding;
    const disabled = item.disabled ?? existing?.disabled;
    return {
      kind: "action",
      id,
      label: item.label,
      ...placement === void 0 ? {} : { placement },
      ...labelScale === void 0 ? {} : { labelScale },
      ...verticalPadding === void 0 ? {} : { verticalPadding },
      ...disabled === void 0 ? {} : { disabled },
      ...item.items !== void 0 ? {
        items: item.items.map(
          (child) => legacySelectionItem(child, context, extensionId, mapping)
        )
      } : existing?.items === void 0 ? {} : { items: existing.items },
      ...item.onActivate === void 0 && existing?.onClick === void 0 ? {} : item.onActivate === void 0 ? { onClick: existing.onClick } : {
        onClick: (next) => {
          item.onActivate?.(context, activation(next));
        }
      }
    };
  }
  function legacyComposerState(context) {
    if (context.composer) return context.composer;
    return Object.freeze({
      id: context.ownerId === "composer:main" ? context.ownerId : "composer:main",
      kind: context.kind ?? "main",
      focused: context.focused ?? false,
      content: Object.freeze([]),
      attachments: Object.freeze([]),
      planMode: context.plan ?? false,
      fastMode: false,
      submitting: false
    });
  }
  function composerContext(context) {
    return Object.freeze({
      ownerId: context.ownerId,
      windowId: adapterState().windowId,
      composer: legacyComposerState(context)
    });
  }
  function sidebarDestinationContext(context) {
    const mode = context.mode ?? "codex";
    const selectedDestination = context.selectedDestination ?? destinationFromId(context.selectedDestinationId, mode);
    return Object.freeze({
      ownerId: context.ownerId,
      windowId: adapterState().windowId,
      mode,
      selectedDestination
    });
  }
  function destinationFromId(id, mode) {
    switch (id) {
      case void 0:
        return { kind: "home", mode };
      case "app.archive":
        return { kind: "archive" };
      case "app.automations":
        return { kind: "automations" };
      case "app.debug":
        return { kind: "debug" };
      case "app.finance":
        return { kind: "finance" };
      case "app.library":
        return { kind: "library" };
      case "app.plugins":
        return { kind: "plugins" };
      case "app.projects":
        return { kind: "project" };
      case "app.pull-requests":
        return { kind: "pull-request" };
      case "app.security":
        return { kind: "security" };
      case "app.sites":
        return { kind: "sites" };
      case "app.skills":
        return { kind: "skills" };
      default:
        return id.startsWith("app.mcp:") ? { kind: "connections" } : { kind: "extension", routeId: id };
    }
  }
  function productModeMenuContext(context) {
    return Object.freeze({
      ownerId: context.ownerId,
      windowId: adapterState().windowId,
      mode: context.mode === "work" ? "work" : "codex",
      workModeAccess: context.workModeAccess ?? "chatgpt",
      disabled: context.disabled ?? false
    });
  }
  function legacyComposerMenuItem(item, context, extensionId) {
    if (item.kind === "opaque") {
      throw new TypeError("A composer action definition cannot contain an opaque menu item");
    }
    if (item.kind === "separator") {
      return {
        kind: "separator",
        id: namespacedId(extensionId, item.id),
        origin: extensionId
      };
    }
    return {
      kind: "action",
      id: namespacedId(extensionId, item.id),
      label: item.label,
      ...item.tooltip === void 0 ? {} : { tooltip: item.tooltip },
      ...item.icon === void 0 ? {} : { icon: item.icon },
      ...item.rightIcon === void 0 ? {} : { rightIcon: item.rightIcon },
      ...item.disabled === void 0 ? {} : { disabled: item.disabled },
      ...item.checked === void 0 ? {} : { checked: item.checked },
      ...item.keybinding === void 0 ? {} : { keybinding: item.keybinding },
      ...item.message === void 0 ? {} : { message: item.message },
      ...item.subText === void 0 ? {} : { subText: item.subText },
      ...item.href === void 0 ? {} : { href: item.href },
      ...item.items === void 0 ? {} : {
        items: item.items.map(
          (child) => legacyComposerMenuItem(child, context, extensionId)
        )
      },
      ...item.onActivate === void 0 ? {} : {
        onClick: (next) => item.onActivate?.(context(), activation(next))
      },
      origin: extensionId
    };
  }
  function publicSidebarDestinationItem(item, context, mapping) {
    const appOwned = isAppOwned(item.origin);
    if (appOwned && !isSidebarBuiltInId(item.id)) {
      return opaqueItem(item, mapping);
    }
    if (mapping.rawByPublicId.has(item.id)) return opaqueItem(item, mapping);
    mapping.rawByPublicId.set(item.id, item);
    return Object.freeze({
      kind: "destination",
      id: item.id,
      label: item.label ?? item.id,
      ...item.icon === void 0 ? {} : { icon: item.icon },
      ...item.railIcon === void 0 ? {} : { railIcon: item.railIcon },
      ...item.animatedIcon === void 0 ? {} : { animatedIcon: item.animatedIcon },
      ...item.customizable === void 0 ? {} : { customizable: item.customizable },
      ...item.defaultLocation === void 0 ? {} : { defaultLocation: item.defaultLocation },
      ...item.visibleByDefault === void 0 ? {} : { visibleByDefault: item.visibleByDefault },
      ...item.destination === void 0 ? {} : { destination: item.destination },
      ...item.hasUnreadActivity === void 0 ? {} : { hasUnreadActivity: item.hasUnreadActivity },
      ...item.disabled === void 0 ? {} : { disabled: item.disabled },
      ...item.isCurrentDestination === void 0 && item.isActive === void 0 ? {} : {
        isCurrentDestination: () => item.isCurrentDestination ?? item.isActive ?? false
      },
      ...item.onPrefetch === void 0 ? {} : { onPrefetch: () => item.onPrefetch?.() },
      ...item.onClick === void 0 ? {} : {
        onSelect: (_owner, next) => item.onClick?.(legacyActivation(next))
      },
      origin: appOwned ? "app" : `extension:${item.origin}`
    });
  }
  function legacySidebarDestinationItem(item, context, extensionId, mapping) {
    const existing = mapping.rawByPublicId.get(item.id);
    if (item.kind === "opaque") {
      if (!existing) {
        throw new Error(`Opaque sidebar destination is not from this evaluation: ${item.id}`);
      }
      return existing;
    }
    const isCurrentDestination = item.isCurrentDestination?.(context);
    return {
      kind: "action",
      id: existing?.id ?? namespacedId(extensionId, item.id),
      label: item.label,
      ...item.icon === void 0 ? {} : { icon: item.icon },
      ...item.railIcon === void 0 ? {} : { railIcon: item.railIcon },
      ...item.animatedIcon === void 0 ? {} : { animatedIcon: item.animatedIcon },
      ...item.customizable === void 0 ? {} : { customizable: item.customizable },
      ...item.defaultLocation === void 0 ? {} : { defaultLocation: item.defaultLocation },
      ...item.visibleByDefault === void 0 ? {} : { visibleByDefault: item.visibleByDefault },
      ...item.destination === void 0 ? {} : { destination: item.destination },
      ...item.hasUnreadActivity === void 0 ? {} : { hasUnreadActivity: item.hasUnreadActivity },
      ...item.disabled === void 0 ? {} : { disabled: item.disabled },
      ...isCurrentDestination === void 0 ? {} : {
        isActive: isCurrentDestination,
        isCurrentDestination
      },
      ...item.onPrefetch === void 0 ? {} : { onPrefetch: () => item.onPrefetch?.(context) },
      ...item.onSelect === void 0 ? {} : {
        onClick: (next) => item.onSelect?.(context, activation(next))
      },
      origin: existing?.origin ?? extensionId
    };
  }
  function publicProductModeMenuItem(item, context, mapping) {
    const appOwned = isAppOwned(item.origin);
    if (item.kind === "separator") {
      const publicId = appOwned ? `app.separator:${++mapping.opaqueSequence}` : item.id;
      mapping.rawByPublicId.set(publicId, item);
      return Object.freeze({
        kind: "separator",
        id: publicId,
        origin: appOwned ? "app" : `extension:${item.origin}`
      });
    }
    if (appOwned && !productModeBuiltInIds.has(item.id)) {
      return opaqueItem(item, mapping);
    }
    if (mapping.rawByPublicId.has(item.id)) return opaqueItem(item, mapping);
    mapping.rawByPublicId.set(item.id, item);
    return Object.freeze({
      kind: "action",
      id: item.id,
      label: item.label ?? item.id,
      ...item.tooltip === void 0 ? {} : { tooltip: item.tooltip },
      ...item.icon === void 0 ? {} : { icon: item.icon },
      ...item.rightIcon === void 0 ? {} : { rightIcon: item.rightIcon },
      ...item.disabled === void 0 ? {} : { disabled: item.disabled },
      ...item.checked === void 0 ? {} : { checked: item.checked },
      ...item.keybinding === void 0 ? {} : { keybinding: item.keybinding },
      ...item.message === void 0 ? {} : { message: item.message },
      ...item.subText === void 0 ? {} : { subText: item.subText },
      ...item.href === void 0 ? {} : { href: item.href },
      ...item.items === void 0 ? {} : {
        items: item.items.map(
          (child) => publicProductModeMenuItem(child, context, mapping)
        )
      },
      ...item.onClick === void 0 ? {} : {
        onActivate: (_owner, next) => item.onClick?.(legacyActivation(next))
      },
      origin: appOwned ? "app" : `extension:${item.origin}`
    });
  }
  function legacyProductModeMenuItem(item, context, extensionId, mapping) {
    const existing = mapping.rawByPublicId.get(item.id);
    if (item.kind === "opaque") {
      if (!existing) {
        throw new Error(`Opaque product mode item is not from this evaluation: ${item.id}`);
      }
      return existing;
    }
    if (item.kind === "separator") {
      return {
        kind: "separator",
        id: existing?.id ?? namespacedId(extensionId, item.id),
        origin: existing?.origin ?? extensionId
      };
    }
    return {
      kind: "action",
      id: existing?.id ?? namespacedId(extensionId, item.id),
      label: item.label,
      ...item.tooltip === void 0 ? {} : { tooltip: item.tooltip },
      ...item.icon === void 0 ? {} : { icon: item.icon },
      ...item.rightIcon === void 0 ? {} : { rightIcon: item.rightIcon },
      ...item.disabled === void 0 ? {} : { disabled: item.disabled },
      ...item.checked === void 0 ? {} : { checked: item.checked },
      ...item.keybinding === void 0 ? {} : { keybinding: item.keybinding },
      ...item.message === void 0 ? {} : { message: item.message },
      ...item.subText === void 0 ? {} : { subText: item.subText },
      ...item.href === void 0 ? {} : { href: item.href },
      ...item.items === void 0 ? {} : {
        items: item.items.map(
          (child) => legacyProductModeMenuItem(child, context, extensionId, mapping)
        )
      },
      ...item.onActivate === void 0 ? {} : {
        onClick: (next) => item.onActivate?.(context, activation(next))
      },
      origin: existing?.origin ?? extensionId
    };
  }
  function tracked(entry, value) {
    if (entry.controller.signal.aborted) {
      try {
        value.dispose();
      } catch (error) {
        console.error("Late renderer resource cleanup failed", error);
      }
      throw new Error("The renderer extension entry is inactive");
    }
    entry.disposables.add(value);
    return value;
  }
  function beginEvaluation(entry, evaluations, ownerId) {
    abortEvaluations(evaluations, ownerId);
    const controller = new AbortController();
    const onLifetimeAbort = () => controller.abort(entry.controller.signal.reason);
    entry.controller.signal.addEventListener("abort", onLifetimeAbort, { once: true });
    const record = {
      controller,
      unlink() {
        entry.controller.signal.removeEventListener("abort", onLifetimeAbort);
      }
    };
    evaluations.set(ownerId, record);
    return record;
  }
  function abortEvaluations(evaluations, ownerId) {
    const records = ownerId === void 0 ? [...evaluations.entries()] : [[ownerId, evaluations.get(ownerId)]];
    for (const [key, record] of records) {
      if (!record) continue;
      evaluations.delete(key);
      record.unlink();
      record.controller.abort();
    }
  }
  function refreshingRegistration(entry, register, beforeRefresh) {
    let value = register();
    let disposed = false;
    const result = Object.freeze({
      invalidate(ownerId) {
        if (disposed) return;
        beforeRefresh(ownerId);
        value.dispose();
        value = register();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        beforeRefresh();
        value.dispose();
        entry.disposables.delete(result);
      }
    });
    return tracked(entry, result);
  }
  function invalidatingRegistration(entry, register, beforeInvalidate) {
    let value = register();
    let disposed = false;
    const result = Object.freeze({
      invalidate(ownerId) {
        if (disposed) return;
        beforeInvalidate(ownerId);
        if (value.invalidate) {
          value.invalidate(ownerId);
        } else {
          value.dispose();
          value = register();
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        beforeInvalidate();
        value.dispose();
        entry.disposables.delete(result);
      }
    });
    return tracked(entry, result);
  }
  function assistantContentContext(context) {
    const thread = context.scope === "execution" ? (() => {
      if (context.hostId === void 0 || context.hostId.length === 0) {
        throw new TypeError(
          "Execution assistant-content context requires hostId"
        );
      }
      return Object.freeze({
        scope: "execution",
        hostId: context.hostId,
        threadId: context.conversationId
      });
    })() : (() => {
      if (context.accountId === void 0 || context.accountId.length === 0) {
        throw new TypeError(
          "Cloud assistant-content context requires accountId"
        );
      }
      return Object.freeze({
        scope: "cloud",
        accountId: context.accountId,
        ...context.workspaceId === void 0 ? {} : { workspaceId: context.workspaceId },
        threadId: context.conversationId
      });
    })();
    return {
      ownerId: context.ownerId,
      windowId: adapterState().windowId,
      thread,
      conversationId: context.conversationId,
      ...context.messageId === void 0 ? {} : { messageId: context.messageId },
      ...context.turnId === void 0 ? {} : { turnId: context.turnId },
      ...context.hostId === void 0 ? {} : { hostId: context.hostId },
      streaming: context.streaming
    };
  }
  function assistantDirectiveContext(context) {
    return Object.freeze({
      ...assistantContentContext(context),
      directive: Object.freeze({
        name: context.directive.name,
        kind: context.directive.kind,
        attributes: Object.freeze({ ...context.directive.attributes }),
        ...context.directive.directiveId === void 0 ? {} : { directiveId: context.directive.directiveId },
        terminalInline: context.directive.terminalInline,
        ...context.directive.content === void 0 ? {} : { content: context.directive.content }
      })
    });
  }
  function assistantContentReferenceContext(context) {
    return Object.freeze({
      ...assistantContentContext(context),
      reference: Object.freeze({
        type: context.reference.type,
        data: context.reference.data
      }),
      index: context.index,
      terminalInline: context.terminalInline
    });
  }
  function assistantCodeBlockContext(context) {
    return Object.freeze({
      ...assistantContentContext(context),
      codeBlock: Object.freeze({
        index: context.codeBlock.index,
        ...context.codeBlock.language === void 0 ? {} : { language: context.codeBlock.language },
        content: context.codeBlock.content,
        fenceOpen: context.codeBlock.fenceOpen,
        ...context.codeBlock.info === void 0 ? {} : { info: context.codeBlock.info }
      })
    });
  }
  function conversationItemContext(context) {
    const item = context.item;
    const rawStatus = item.status;
    const status = rawStatus === "pending" || rawStatus === "running" || rawStatus === "complete" || rawStatus === "failed" || rawStatus === "cancelled" ? rawStatus : item.completed === true ? "complete" : "running";
    const thread = context.scope === "execution" ? Object.freeze({
      scope: "execution",
      hostId: context.hostId ?? "local",
      threadId: context.conversationId
    }) : (() => {
      if (context.accountId === void 0) {
        throw new TypeError(
          "Cloud conversation-item context requires accountId"
        );
      }
      return Object.freeze({
        scope: "cloud",
        accountId: context.accountId,
        ...context.workspaceId === void 0 ? {} : { workspaceId: context.workspaceId },
        threadId: context.conversationId
      });
    })();
    const label = typeof item.label === "string" ? item.label : typeof item.title === "string" ? item.title : context.itemType;
    const text = typeof item.text === "string" ? item.text : typeof item.content === "string" ? item.content : void 0;
    return Object.freeze({
      ownerId: context.ownerId,
      windowId: adapterState().windowId,
      conversationId: context.conversationId,
      ...context.turnId === void 0 ? {} : { turnId: context.turnId },
      ...context.hostId === void 0 ? {} : { hostId: context.hostId },
      item: Object.freeze({
        id: typeof item.id === "string" ? item.id : `${context.itemType}:${context.ownerId}`,
        thread,
        ...context.turnId === void 0 ? {} : { turnId: context.turnId },
        status,
        kind: "opaque",
        sourceKind: context.itemType,
        data: item,
        presentationVersion: 1,
        label,
        ...text === void 0 ? {} : { text }
      }),
      layout: context.itemLayout
    });
  }
  function memoizedRichContext(mapper) {
    const cache = /* @__PURE__ */ new WeakMap();
    return (context) => {
      const existing = cache.get(context);
      if (existing) return existing;
      const mapped = mapper(context);
      cache.set(context, mapped);
      return mapped;
    };
  }
  function richContentProvider(entry, identity, kind, mapContext, render) {
    return (legacyContext, container) => {
      const context = mapContext(legacyContext);
      const controller = new AbortController();
      const onLifetimeAbort = () => controller.abort(entry.controller.signal.reason);
      entry.controller.signal.addEventListener("abort", onLifetimeAbort, {
        once: true
      });
      let disposer;
      try {
        const value = render({
          id: randomId(kind),
          ownerId: context.ownerId,
          windowId: adapterState().windowId,
          container,
          context,
          signal: controller.signal
        });
        if (value !== void 0 && (!value || typeof value !== "object" || typeof value.dispose !== "function")) {
          throw new TypeError("A render provider must return a Disposable or undefined");
        }
        disposer = value;
      } catch (error) {
        entry.controller.signal.removeEventListener("abort", onLifetimeAbort);
        controller.abort(error);
        throw error;
      }
      let disposed = false;
      return Object.freeze({
        dispose() {
          if (disposed) return;
          disposed = true;
          entry.controller.signal.removeEventListener("abort", onLifetimeAbort);
          controller.abort();
          try {
            disposer?.dispose();
          } catch (error) {
            console.error(`[${identity.id}] ${kind} disposal failed`, error);
          }
        }
      });
    };
  }
  function settingsHub(extensionId) {
    const state = adapterState();
    let hub = state.settings.get(extensionId);
    if (hub) return hub;
    hub = {
      extensionId,
      storage: createExtensionStorage(extensionId),
      listeners: /* @__PURE__ */ new Set(),
      invalidators: /* @__PURE__ */ new Set(),
      values: {},
      textDrafts: /* @__PURE__ */ new Map(),
      sourceId: state.documentId,
      operations: Promise.resolve(),
      revision: 0
    };
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel(`chatgptx-v5-settings:${extensionId}`);
      const unref = channel.unref;
      unref?.call(channel);
      channel.addEventListener("message", (event) => {
        const message = parseSettingsBroadcast(event.data);
        if (!message || message.sourceId === hub.sourceId) return;
        void loadSettings(hub).then(() => {
          if (message.deleted) {
            delete hub.values[message.key];
          } else {
            hub.values[message.key] = message.value;
          }
          emitSetting(hub, message.key, message.value, false);
        }).catch(
          (error) => console.error(`[${extensionId}] settings broadcast failed`, error)
        );
      });
      hub.channel = channel;
    }
    state.settings.set(extensionId, hub);
    return hub;
  }
  function parseSettingsBroadcast(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
    const candidate = value;
    if (typeof candidate.sourceId !== "string" || typeof candidate.key !== "string" || typeof candidate.deleted !== "boolean") {
      return void 0;
    }
    if (candidate.deleted) {
      return {
        sourceId: candidate.sourceId,
        key: candidate.key,
        deleted: true
      };
    }
    if (!("value" in candidate) || candidate.value === void 0) return void 0;
    return {
      sourceId: candidate.sourceId,
      key: candidate.key,
      deleted: false,
      value: candidate.value
    };
  }
  async function loadSettings(hub) {
    hub.load ??= hub.storage.readTextFile(settingsFile).then((contents) => {
      if (contents === void 0) return;
      const parsed = JSON.parse(contents);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("Extension settings must contain a JSON object");
      }
      Object.assign(hub.values, parsed);
      for (const [key, value] of Object.entries(hub.values)) {
        synchronizeTextDrafts(hub, key, value);
      }
    });
    await hub.load;
  }
  function extensionScope() {
    return Object.freeze({ kind: "extension" });
  }
  function emitSetting(hub, key, value, broadcast = true) {
    synchronizeTextDrafts(hub, key, value);
    hub.revision += 1;
    const change = Object.freeze({
      key,
      scope: extensionScope(),
      value
    });
    for (const listener of hub.listeners) {
      try {
        listener(change);
      } catch (error) {
        console.error(`[${hub.extensionId}] settings listener failed`, error);
      }
    }
    for (const invalidate of hub.invalidators) {
      try {
        invalidate();
      } catch (error) {
        console.error(`[${hub.extensionId}] settings invalidation failed`, error);
      }
    }
    if (broadcast) {
      hub.channel?.postMessage({
        sourceId: hub.sourceId,
        key,
        deleted: value === void 0,
        ...value === void 0 ? {} : { value }
      });
    }
  }
  function persistSettings(hub) {
    const contents = `${JSON.stringify(hub.values, null, 2)}
`;
    const operation = hub.operations.then(
      () => hub.storage.writeTextFile(settingsFile, contents)
    );
    hub.operations = operation.catch(() => void 0);
    return operation;
  }
  function settingDefault(control) {
    if ("defaultValue" in control) return control.defaultValue;
    return void 0;
  }
  function settingValue(hub, control) {
    if (!control.settingKey) return settingDefault(control);
    return hub.values[control.settingKey] ?? settingDefault(control);
  }
  function synchronizeTextDrafts(hub, key, value) {
    for (const draft of hub.textDrafts.values()) {
      if (draft.settingKey !== key) continue;
      draft.value = typeof value === "string" ? value : draft.defaultValue;
    }
  }
  function textDraft(hub, controlId, control) {
    let draft = hub.textDrafts.get(controlId);
    if (draft) return draft;
    const value = settingValue(hub, control);
    draft = {
      ...control.settingKey === void 0 ? {} : { settingKey: control.settingKey },
      defaultValue: control.defaultValue ?? "",
      value: typeof value === "string" ? value : ""
    };
    hub.textDrafts.set(controlId, draft);
    return draft;
  }
  function settingDescription(hub, controlId, control) {
    if (control.type !== "text" || control.validate === void 0) {
      return control.description;
    }
    return control.validate(textDraft(hub, controlId, control).value) ?? control.description;
  }
  function nativeControl(legacy, identity, hub, control, controlId, invalidate) {
    const key = control.settingKey;
    const save = async (value2) => {
      if (!key) return;
      hub.values[key] = value2;
      emitSetting(hub, key, value2);
      invalidate();
      await persistSettings(hub);
    };
    const value = settingValue(hub, control);
    switch (control.type) {
      case "toggle":
        return legacy.settings.ui.toggle({
          checked: typeof value === "boolean" ? value : false,
          ...control.disabled === void 0 ? {} : { disabled: control.disabled },
          onChange: (next) => save(next)
        });
      case "text": {
        const draft = textDraft(hub, controlId, control);
        return legacy.settings.ui.textField({
          value: draft.value,
          ...control.placeholder === void 0 ? {} : { placeholder: control.placeholder },
          ...control.disabled === void 0 ? {} : { disabled: control.disabled },
          onChange: (next) => {
            draft.value = next;
            invalidate();
            if (control.validate?.(next) !== void 0) return;
            return save(next);
          }
        });
      }
      case "number":
        return legacy.settings.ui.textField({
          value: typeof value === "number" ? String(value) : "",
          ...control.disabled === void 0 ? {} : { disabled: control.disabled },
          onChange: (next) => {
            const number = Number(next);
            if (!Number.isFinite(number)) return;
            return save(number);
          }
        });
      case "select":
      case "radio":
      case "segmented":
        return legacy.settings.ui.select({
          ...typeof value === "string" ? { value } : {},
          options: control.options,
          ...control.disabled === void 0 ? {} : { disabled: control.disabled },
          onChange: (next) => save(next)
        });
      case "button":
      case "link": {
        if (!control.commandId && control.destination) return void 0;
        const command = control.commandId ? adapterState().commands.get(namespacedId(identity.id, control.commandId)) : void 0;
        const commandContext = Object.freeze({});
        const commandEnabled = command !== void 0 && (command.definition.isEnabled?.(commandContext) ?? true);
        return legacy.settings.ui.button({
          label: control.title,
          disabled: control.disabled === true || !commandEnabled,
          async onClick() {
            if (!command || !commandEnabled) return;
            await command.definition.handler(commandContext);
            invalidate();
          }
        });
      }
      default:
        return void 0;
    }
  }
  function registerSettingsSection(legacy, identity, entry, definition) {
    if (typeof definition.id !== "string" || definition.id.length === 0 || definition.id.includes(".")) {
      throw new TypeError(
        "A native settings section id must be a non-empty local id without dots"
      );
    }
    if (definition.content !== "controls") {
      throw new Error("The current exact binding supports native settings controls only");
    }
    if ("icon" in definition && definition.icon !== void 0 || "order" in definition && definition.order !== void 0 || "isVisible" in definition && definition.isVisible !== void 0) {
      throw new Error(
        "The current exact binding supports the NativeSettingsControlsSectionDefinition shape only"
      );
    }
    if (definition.group !== void 0 && !nativeSettingsGroups.has(definition.group)) {
      throw new Error(`The current exact binding does not support settings group ${definition.group}`);
    }
    const unsupportedControl = definition.controls.find(
      (control) => !nativeSettingsControlTypeSet.has(control.type)
    );
    if (unsupportedControl) {
      throw new Error(
        `The current exact binding does not support the ${unsupportedControl.type} settings control`
      );
    }
    for (const control of definition.controls) {
      if ((control.type === "toggle" || control.type === "text" || control.type === "select") && (typeof control.settingKey !== "string" || control.settingKey.length === 0)) {
        throw new Error(
          `The current exact binding requires settingKey for the ${control.type} settings control`
        );
      }
      if (control.type === "text" && "secure" in control && control.secure !== void 0) {
        throw new Error("The current exact binding does not support secure text settings controls");
      }
      if (control.type === "select" && control.options.some(
        (option) => "description" in option && option.description !== void 0
      )) {
        throw new Error("The current exact binding does not support select option descriptions");
      }
      if (control.type === "button" && !control.commandId && control.destination === void 0) {
        throw new Error(
          "The current exact binding requires commandId or destination for a button settings control"
        );
      }
      if (control.type === "button" && ("href" in control && control.href !== void 0 || "settingKey" in control && control.settingKey !== void 0)) {
        throw new Error(
          "The current exact binding does not support href or settingKey on a button settings control"
        );
      }
      if (control.type === "button" && !control.commandId && control.destination !== void 0 && control.disabled !== void 0) {
        throw new Error(
          "The current exact binding cannot disable a destination-only button settings control"
        );
      }
    }
    if (definition.searchEntries?.some(
      (entry2) => Object.prototype.hasOwnProperty.call(entry2, "id")
    )) {
      throw new Error(
        "The current exact binding does not preserve settings search entry ids"
      );
    }
    const paneId = `${identity.id}.${definition.id}`;
    const groupId = `${paneId}.controls`;
    const categoryId = definition.group ?? "integrations";
    const hub = settingsHub(identity.id);
    let itemRegistration;
    const categories = legacy.settings.transformCategories(
      (current) => current.map(
        (category) => category.id === categoryId ? {
          ...category,
          panes: [
            ...category.panes,
            {
              id: paneId,
              label: definition.title,
              title: definition.title,
              ...definition.searchEntries === void 0 ? {} : {
                keywords: definition.searchEntries.flatMap((entry2) => [
                  entry2.title,
                  ...entry2.keywords ?? []
                ])
              }
            }
          ]
        } : category
      )
    );
    const groups = legacy.settings.transformGroups(
      (current, pane) => pane.id === paneId ? [
        ...current,
        {
          id: groupId,
          title: definition.title,
          ...definition.controls.some((control) => control.restartRequired) ? { footer: "Changes apply after ChatGPT restarts." } : {},
          items: []
        }
      ] : current
    );
    itemRegistration = legacy.settings.transformItems((current, context) => {
      if (context.group.id !== groupId) return current;
      return [
        ...current,
        ...definition.controls.map((control) => {
          const controlId = `${paneId}.${control.id}`;
          const description = settingDescription(hub, controlId, control);
          const destinationPaneId = control.destination ? settingsTargetId(identity.id, control.destination.sectionId) : void 0;
          return {
            id: controlId,
            label: control.title,
            ...description === void 0 ? {} : { description },
            ...control.destination === void 0 ? {} : {
              destination: {
                paneId: destinationPaneId,
                ...control.destination.controlId === void 0 ? {} : {
                  itemId: `${destinationPaneId}.${control.destination.controlId}`
                }
              }
            },
            control: nativeControl(
              legacy,
              identity,
              hub,
              control,
              controlId,
              () => itemRegistration.invalidate()
            )
          };
        })
      ];
    });
    const invalidateItems = () => itemRegistration.invalidate();
    hub.invalidators.add(invalidateItems);
    let disposed = false;
    void loadSettings(hub).then(() => {
      if (!disposed) itemRegistration.invalidate();
    }).catch(
      (error) => console.error(`[${identity.id}] settings load failed`, error)
    );
    const result = Object.freeze({
      invalidate() {
        if (!disposed) itemRegistration.invalidate();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        categories.dispose();
        groups.dispose();
        itemRegistration.dispose();
        hub.invalidators.delete(invalidateItems);
        for (const control of definition.controls) {
          hub.textDrafts.delete(`${paneId}.${control.id}`);
        }
        entry.disposables.delete(result);
      }
    });
    return tracked(entry, result);
  }
  function namespacedId(extensionId, id) {
    return id.startsWith(`${extensionId}.`) ? id : `${extensionId}.${id}`;
  }
  function settingsTargetId(extensionId, id) {
    if (id.includes(".")) return id;
    return builtInSettingsSectionIds.has(id) ? `codex.settings.${id}` : `${extensionId}.${id}`;
  }
  function extensionSettingsOptions(options) {
    const signal = options?.signal;
    signal?.throwIfAborted();
    if (options?.scope !== void 0 && options.scope.kind !== "extension") {
      return unsupported(`Settings scope ${options.scope.kind}`);
    }
    return signal;
  }
  function eventSubscriptionSignal(options) {
    const signal = options?.signal;
    signal?.throwIfAborted();
    return signal;
  }
  function registerCommand(identity, entry, definition) {
    const state = adapterState();
    const id = namespacedId(identity.id, definition.id);
    if (state.commands.has(id)) {
      throw new Error(`Command is already registered: ${id}`);
    }
    state.commands.set(id, { id, definition });
    let disposed = false;
    const result = Object.freeze({
      invalidate() {
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        state.commands.delete(id);
        entry.disposables.delete(result);
      }
    });
    return tracked(entry, result);
  }
  function apiError(code, message, details) {
    return Object.assign(new Error(message), {
      name: "ChatGPTXApiError",
      code,
      retryable: false,
      ...details === void 0 ? {} : { details: Object.freeze(details) }
    });
  }
  function unsupported(name) {
    throw apiError(
      "capability-unavailable",
      `${name} is not available in this exact-build adapter`,
      { operation: name, reason: "binding-unavailable" }
    );
  }
  function unavailableApiMember(path) {
    const callable = () => unsupported(`API operation ${path}`);
    return new Proxy(callable, {
      get(_target, property) {
        if (property === "then") return void 0;
        if (typeof property === "symbol") return void 0;
        return unavailableApiMember(`${path}.${String(property)}`);
      },
      apply() {
        return unsupported(`API operation ${path}`);
      }
    });
  }
  function apiNamespace(name, value) {
    return new Proxy(value, {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) {
          return Reflect.get(target, property, receiver);
        }
        if (typeof property === "symbol") return void 0;
        return unavailableApiMember(`${name}.${String(property)}`);
      }
    });
  }
  function requestedScope(options) {
    options?.signal?.throwIfAborted();
    return options?.scope ?? Object.freeze({ kind: "global" });
  }
  function rendererOwnerScopeAvailable(id, scope) {
    const windowId = adapterState().windowId;
    if (scope.kind === "global") return true;
    if (scope.kind === "window") return scope.windowId === windowId;
    if (scope.kind !== "thread") return false;
    if (scope.windowId !== void 0 && scope.windowId !== windowId) return false;
    if (id === "ui.definition.assistant-code-block" || id === "ui.definition.assistant-content-reference" || id === "ui.definition.assistant-directive" || id === "ui.definition.conversation-item") {
      return scope.thread.scope === "execution" || scope.thread.scope === "cloud";
    }
    if (scope.thread.scope === "execution") {
      return id === "ui.point.assistant-selection.actions" || id === "ui.point.thread.header.menu" || id === "ui.point.sidebar.thread-row.title-prefix" || id === "ui.point.sidebar.thread-row.priority-indicator";
    }
    if (scope.thread.scope !== "cloud") return false;
    return id === "ui.point.sidebar.thread-row.menu" || id === "ui.point.sidebar.thread-row.title-prefix" || id === "ui.point.sidebar.thread-row.priority-indicator";
  }
  function capabilityStatus(id, scope, extensionDeactivated = false) {
    if (extensionDeactivated) {
      return Object.freeze({
        id,
        scope,
        state: "unavailable",
        unavailableReason: "extension-deactivated",
        detail: "The renderer extension is inactive.",
        operations: Object.freeze([])
      });
    }
    let operations = availableCapabilityOperations.get(id);
    let scopeUnavailable = false;
    if (id.startsWith("ui.point.")) {
      const point = id.slice("ui.point.".length);
      const available = availableListPoints.has(point) || availableRenderPoints.has(point);
      operations = available ? [availableListPoints.has(point) ? "transform" : "render"] : void 0;
    } else if (id.startsWith("ui.definition.")) {
      const kind = id.slice("ui.definition.".length);
      operations = availableDefinitionKinds.has(kind) ? ["register"] : void 0;
    }
    if ((id.startsWith("ui.point.") || id.startsWith("ui.definition.")) && !rendererOwnerScopeAvailable(id, scope)) {
      operations = void 0;
      scopeUnavailable = true;
    }
    if ((id === "settings.read" || id === "settings.write") && scope.kind !== "global") {
      operations = void 0;
      scopeUnavailable = true;
    }
    if (id === "threads.read" && scope.kind !== "global" && !(scope.kind === "window" && scope.windowId === adapterState().windowId)) {
      operations = void 0;
      scopeUnavailable = true;
    }
    return Object.freeze({
      id,
      scope,
      state: operations === void 0 ? "unavailable" : "available",
      ...operations === void 0 ? {
        unavailableReason: "binding-unavailable",
        detail: scopeUnavailable ? "The exact-build adapter does not bind this capability for the requested scope." : "The exact-build adapter does not bind this capability.",
        operations: Object.freeze([])
      } : { operations: Object.freeze([...operations]) }
    });
  }
  function allCapabilityIds() {
    return Object.freeze([
      ...builtInCapabilityIds,
      ...listPointIds.map((id) => `ui.point.${id}`),
      ...renderPointIds.map((id) => `ui.point.${id}`),
      ...definitionKinds.map((kind) => `ui.definition.${kind}`)
    ]);
  }
  function capabilitySnapshot(scope, extensionDeactivated = false) {
    return Object.freeze({
      revision: 1,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      scope,
      statuses: Object.freeze(
        allCapabilityIds().map(
          (id) => capabilityStatus(id, scope, extensionDeactivated)
        )
      )
    });
  }
  function unavailableCapabilityError(status) {
    return Object.assign(
      new Error(`Capability is unavailable: ${status.id}`),
      {
        name: "ChatGPTXApiError",
        code: "capability-unavailable",
        retryable: false,
        details: {
          capabilityId: status.id,
          reason: status.unavailableReason ?? "binding-unavailable"
        }
      }
    );
  }
  function apiFor(legacy, identity, entry, extension) {
    const state = adapterState();
    const hub = settingsHub(identity.id);
    const capabilities = {
      async getSnapshot(options) {
        return capabilitySnapshot(
          requestedScope(options),
          entry.controller.signal.aborted
        );
      },
      async get(id, options) {
        return capabilityStatus(
          id,
          requestedScope(options),
          entry.controller.signal.aborted
        );
      },
      async require(id, options) {
        const status = capabilityStatus(
          id,
          requestedScope(options),
          entry.controller.signal.aborted
        );
        if (status.state === "unavailable") throw unavailableCapabilityError(status);
      },
      changed: {
        subscribe(listener, options) {
          if (typeof listener !== "function") {
            throw new TypeError("A capability event listener is required");
          }
          const signal = eventSubscriptionSignal(options);
          let active = true;
          let resource;
          const emit = (message) => {
            if (!active) return;
            try {
              listener(message);
            } catch (error) {
              console.error("Capability event listener failed", error);
            }
          };
          const dispose = () => {
            if (!active) return;
            active = false;
            signal?.removeEventListener("abort", dispose);
            entry.disposables.delete(resource);
          };
          resource = Object.freeze({ dispose });
          tracked(entry, resource);
          signal?.addEventListener("abort", dispose, { once: true });
          queueMicrotask(() => {
            if (!active) return;
            if (options?.afterCursor !== void 0) {
              emit({
                type: "reset",
                cursor: "1",
                reason: "cursor-expired"
              });
            }
            emit({
              type: "snapshot",
              cursor: "1",
              value: capabilitySnapshot(
                Object.freeze({ kind: "global" }),
                entry.controller.signal.aborted
              )
            });
          });
          return dispose;
        }
      }
    };
    const runtime = {
      async getInfo(options) {
        options?.signal?.throwIfAborted();
        const value = await globalThis.__CGPTX_RUNTIME__?.request("runtime.info", {
          extensionId: identity.id
        });
        options?.signal?.throwIfAborted();
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new TypeError("Invalid runtime information");
        }
        return Object.freeze({
          ...value,
          extension
        });
      },
      capabilities
    };
    const appearance = {
      header: {
        registerProperties(properties) {
          return tracked(entry, legacy.appearance.header.registerProperties(properties));
        },
        getProperties() {
          return legacy.appearance.header.getProperties();
        }
      },
      getColorScheme() {
        return legacy.appearance.getColorScheme();
      },
      openColorPicker(options) {
        return tracked(entry, legacy.appearance.openColorPicker(options));
      }
    };
    const threads = {
      async getCurrent(windowId, options) {
        options?.signal?.throwIfAborted();
        if (typeof windowId !== "string" || windowId.length === 0) {
          throw new TypeError("A window id is required");
        }
        if (windowId !== state.windowId) {
          return unsupported(`Current thread for window ${windowId}`);
        }
        const current = legacy.threads.getCurrent();
        options?.signal?.throwIfAborted();
        return current ? threadSummary(current) : null;
      },
      events: {
        subscribe(listener, options) {
          if (typeof listener !== "function") {
            throw new TypeError("A thread event listener is required");
          }
          const signal = eventSubscriptionSignal(options);
          let first = true;
          let revision = 0;
          let active = true;
          let subscription;
          let resource;
          const emit = (message) => {
            if (!active) return;
            try {
              listener(message);
            } catch (error) {
              console.error("Thread event listener failed", error);
            }
          };
          const dispose = () => {
            if (!active) return;
            active = false;
            signal?.removeEventListener("abort", dispose);
            subscription?.dispose();
            entry.disposables.delete(resource);
          };
          resource = Object.freeze({ dispose });
          tracked(entry, resource);
          signal?.addEventListener("abort", dispose, { once: true });
          if (options?.afterCursor !== void 0) {
            emit({
              type: "reset",
              cursor: "0",
              reason: "cursor-expired"
            });
          }
          subscription = legacy.threads.subscribe((thread) => {
            if (!active) return;
            revision += 1;
            if (first) {
              first = false;
              emit({
                type: "snapshot",
                cursor: String(revision),
                value: {
                  revision,
                  selectedByWindow: {
                    [state.windowId]: thread ? threadRef(thread) : null
                  },
                  sections: []
                }
              });
              return;
            }
            state.sequence += 1;
            emit({
              type: "event",
              cursor: String(revision),
              value: {
                id: `current-thread-${state.sequence}`,
                sequence: state.sequence,
                occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
                scope: { windowId: state.windowId },
                event: {
                  type: "selected",
                  windowId: state.windowId,
                  thread: thread ? threadRef(thread) : null
                }
              }
            });
          });
          if (!active) subscription.dispose();
          return dispose;
        }
      }
    };
    const contributions = {
      async listPoints(options) {
        const scope = requestedScope(options);
        return [
          ...listPointIds.map((id) => {
            const status = capabilityStatus(
              `ui.point.${id}`,
              scope,
              entry.controller.signal.aborted
            );
            const available = status.state === "available";
            const builtInItemIds = id === "thread.header.menu" || id === "sidebar.thread-row.menu" ? [...new Set(threadBuiltInIds.values())] : id === "assistant-selection.actions" ? [...new Set(selectionBuiltInIds.values())] : id === "home.new-chat-suggestions" ? [...homeSuggestionBuiltInIds] : id === "sidebar.destinations" ? [...sidebarBuiltInIds] : id === "sidebar.product-mode.menu" ? [...productModeBuiltInIds] : [];
            return {
              id,
              operation: "transform",
              asynchronous: asynchronousListPoints.has(id),
              capabilityId: `ui.point.${id}`,
              state: available ? "available" : "unavailable",
              ...available ? {} : {
                unavailableReason: status.unavailableReason ?? "binding-unavailable"
              },
              builtInItemIds: Object.freeze(builtInItemIds)
            };
          }),
          ...renderPointIds.map((id) => {
            const status = capabilityStatus(
              `ui.point.${id}`,
              scope,
              entry.controller.signal.aborted
            );
            const available = status.state === "available";
            return {
              id,
              operation: "render",
              capabilityId: `ui.point.${id}`,
              state: available ? "available" : "unavailable",
              ...available ? {} : {
                unavailableReason: status.unavailableReason ?? "binding-unavailable"
              },
              builtInItemIds: Object.freeze([])
            };
          })
        ];
      },
      async listDefinitionKinds(options) {
        const scope = requestedScope(options);
        return definitionKinds.map((kind) => {
          const status = capabilityStatus(
            `ui.definition.${kind}`,
            scope,
            entry.controller.signal.aborted
          );
          const available = status.state === "available";
          return {
            kind,
            capabilityId: `ui.definition.${kind}`,
            state: available ? "available" : "unavailable",
            ...available ? {} : {
              unavailableReason: status.unavailableReason ?? "binding-unavailable"
            },
            ...kind === "settings-section" ? {
              supportedDefinitionShapes: Object.freeze([
                "native-controls"
              ])
            } : {}
          };
        });
      },
      transform(point, transformer) {
        if (!availableListPoints.has(point)) {
          return unsupported(`Contribution transform ${point}`);
        }
        if (point === "sidebar.destinations") {
          const evaluations = /* @__PURE__ */ new Map();
          const register = () => legacy.ui.transformSidebarDestinations((items, legacyContext) => {
            const ownerId = legacyContext.ownerId;
            const evaluation = beginEvaluation(entry, evaluations, ownerId);
            try {
              const context = sidebarDestinationContext(legacyContext);
              const mapping = {
                rawByPublicId: /* @__PURE__ */ new Map(),
                opaqueSequence: 0
              };
              const mapped = items.map(
                (item) => publicSidebarDestinationItem(item, context, mapping)
              );
              const transformed = transformer(mapped, context, {
                id: randomId("sidebar-destinations"),
                signal: evaluation.controller.signal
              });
              if (transformed && typeof transformed.then === "function") {
                throw new Error(
                  "The current exact binding requires a synchronous sidebar destination transform"
                );
              }
              return transformed.map(
                (item) => legacySidebarDestinationItem(
                  item,
                  context,
                  identity.id,
                  mapping
                )
              );
            } catch (error) {
              abortEvaluations(evaluations, ownerId);
              throw error;
            }
          });
          return invalidatingRegistration(
            entry,
            register,
            (ownerId) => abortEvaluations(evaluations, ownerId)
          );
        }
        if (point === "sidebar.product-mode.menu") {
          const evaluations = /* @__PURE__ */ new Map();
          const register = () => legacy.ui.transformProductModeMenu(
            (items, legacyContext) => {
              const ownerId = legacyContext.ownerId;
              const evaluation = beginEvaluation(entry, evaluations, ownerId);
              try {
                const context = productModeMenuContext(legacyContext);
                const mapping = {
                  rawByPublicId: /* @__PURE__ */ new Map(),
                  opaqueSequence: 0
                };
                const mapped = items.map(
                  (item) => publicProductModeMenuItem(item, context, mapping)
                );
                const transformed = transformer(mapped, context, {
                  id: randomId("product-mode-menu"),
                  signal: evaluation.controller.signal
                });
                if (transformed && typeof transformed.then === "function") {
                  throw new Error(
                    "The current exact binding requires a synchronous product mode menu transform"
                  );
                }
                return transformed.map(
                  (item) => legacyProductModeMenuItem(
                    item,
                    context,
                    identity.id,
                    mapping
                  )
                );
              } catch (error) {
                abortEvaluations(evaluations, ownerId);
                throw error;
              }
            }
          );
          return invalidatingRegistration(
            entry,
            register,
            (ownerId) => abortEvaluations(evaluations, ownerId)
          );
        }
        if (point === "thread.header.menu" || point === "sidebar.thread-row.menu") {
          const evaluations = /* @__PURE__ */ new Map();
          const register = () => legacy.menus.thread.transformItems((items, thread) => {
            const isSidebarOwner = thread.surface === "sidebar";
            if (point === "thread.header.menu" && isSidebarOwner || point === "sidebar.thread-row.menu" && !isSidebarOwner) {
              return items;
            }
            const ownerId = threadOwnerId(thread);
            const evaluation = beginEvaluation(entry, evaluations, ownerId);
            try {
              const context = point === "thread.header.menu" ? headerContext(thread) : sidebarThreadRowContext(thread);
              const mapping = {
                rawByPublicId: /* @__PURE__ */ new Map(),
                opaqueSequence: 0
              };
              const mapped = items.map(
                (item) => publicThreadMenuItem(item, context, mapping)
              );
              const transformed = transformer(mapped, context, {
                id: randomId("thread-menu"),
                signal: evaluation.controller.signal
              });
              const isPromise = transformed !== null && typeof transformed === "object" && typeof transformed.then === "function";
              if (point === "thread.header.menu" && isPromise) {
                throw new Error(
                  "The current exact binding requires a synchronous thread menu transform"
                );
              }
              const mapResult = (result) => result.map(
                (item) => legacyThreadMenuItem(item, context, identity.id, mapping)
              );
              return isPromise ? Promise.resolve(transformed).then(
                (result) => mapResult(result)
              ) : mapResult(transformed);
            } catch (error) {
              abortEvaluations(evaluations, ownerId);
              throw error;
            }
          });
          return refreshingRegistration(
            entry,
            register,
            (ownerId) => abortEvaluations(evaluations, ownerId)
          );
        }
        if (point === "assistant-selection.actions") {
          const evaluations = /* @__PURE__ */ new Map();
          const register = () => legacy.menus.assistantSelection.transformItems(
            (items, legacyContext) => {
              const evaluation = beginEvaluation(entry, evaluations, "active-selection");
              try {
                const context = selectionContext(
                  legacyContext,
                  legacy.threads.getCurrent()
                );
                const mapping = {
                  rawByPublicId: /* @__PURE__ */ new Map(),
                  opaqueSequence: 0
                };
                const mapped = items.map(
                  (item) => publicSelectionItem(item, context, mapping)
                );
                const transformed = transformer(mapped, context, {
                  id: randomId("selection"),
                  signal: evaluation.controller.signal
                });
                if (transformed && typeof transformed.then === "function") {
                  throw new Error(
                    "The current exact binding requires a synchronous selection transform"
                  );
                }
                return transformed.map(
                  (item) => legacySelectionItem(item, context, identity.id, mapping)
                );
              } catch (error) {
                abortEvaluations(evaluations, "active-selection");
                throw error;
              }
            }
          );
          return refreshingRegistration(
            entry,
            register,
            (ownerId) => abortEvaluations(evaluations, ownerId)
          );
        }
        return unsupported(`Contribution transform ${point}`);
      },
      render(point, contribution) {
        if (point === "composer.footer.leading" || point === "composer.footer.trailing" || point === "composer.action-bar.leading" || point === "composer.action-bar.trailing" || point === "composer.utility.leading" || point === "composer.utility.trailing" || point === "composer.attachments") {
          const mounts2 = /* @__PURE__ */ new Map();
          const cleanupMount2 = (mount) => {
            if (mount.disposed) return;
            mount.disposed = true;
            entry.controller.signal.removeEventListener(
              "abort",
              mount.onLifetimeAbort
            );
            mount.controller.abort();
            try {
              mount.disposer?.dispose();
            } catch (error) {
              console.error(`[${identity.id}] render disposal failed`, error);
            }
            const ownerMounts = mounts2.get(mount.ownerId);
            ownerMounts?.delete(mount);
            if (ownerMounts?.size === 0) mounts2.delete(mount.ownerId);
          };
          const cleanupMounts2 = (ownerId) => {
            const records = ownerId === void 0 ? [...mounts2.values()].flatMap((values) => [...values]) : [...mounts2.get(ownerId) ?? []];
            for (const mount of records) cleanupMount2(mount);
          };
          const observer2 = typeof MutationObserver === "function" && document.documentElement ? new MutationObserver(() => {
            for (const values of mounts2.values()) {
              for (const mount of [...values]) {
                if (mount.container.isConnected) mount.seenConnected = true;
                else if (mount.seenConnected) cleanupMount2(mount);
              }
            }
          }) : void 0;
          observer2?.observe(document.documentElement, {
            childList: true,
            subtree: true
          });
          const provider = (legacyContext) => {
            const context = composerContext(legacyContext);
            if (contribution.isVisible && !contribution.isVisible(context)) {
              return void 0;
            }
            return {
              view() {
                const container = document.createElement("div");
                container.style.display = "contents";
                const controller = new AbortController();
                const onLifetimeAbort = () => controller.abort(entry.controller.signal.reason);
                entry.controller.signal.addEventListener(
                  "abort",
                  onLifetimeAbort,
                  { once: true }
                );
                const mount = {
                  ownerId: context.ownerId,
                  container,
                  controller,
                  onLifetimeAbort,
                  seenConnected: false,
                  disposed: false,
                  disposer: void 0
                };
                const ownerMounts = mounts2.get(context.ownerId) ?? /* @__PURE__ */ new Set();
                ownerMounts.add(mount);
                mounts2.set(context.ownerId, ownerMounts);
                try {
                  const disposer = contribution.render({
                    id: randomId(`composer-${point}`),
                    ownerId: context.ownerId,
                    windowId: state.windowId,
                    container,
                    context,
                    signal: controller.signal
                  });
                  if (disposer !== void 0 && (!disposer || typeof disposer !== "object" || typeof disposer.dispose !== "function")) {
                    throw new TypeError(
                      "A render provider must return a Disposable or undefined"
                    );
                  }
                  mount.disposer = disposer;
                } catch (error) {
                  cleanupMount2(mount);
                  throw error;
                }
                queueMicrotask(() => {
                  if (mount.disposed) return;
                  if (container.isConnected) mount.seenConnected = true;
                  else cleanupMount2(mount);
                });
                return container;
              }
            };
          };
          let legacyRegistration2 = legacy.ui.registerRender(point, provider);
          let disposed2 = false;
          const result2 = Object.freeze({
            invalidate(ownerId) {
              if (disposed2) return;
              cleanupMounts2(ownerId);
              if (legacyRegistration2.invalidate) {
                legacyRegistration2.invalidate(ownerId);
              } else {
                legacyRegistration2.dispose();
                legacyRegistration2 = legacy.ui.registerRender(point, provider);
              }
            },
            dispose() {
              if (disposed2) return;
              disposed2 = true;
              observer2?.disconnect();
              cleanupMounts2();
              legacyRegistration2.dispose();
              entry.disposables.delete(result2);
            }
          });
          return tracked(entry, result2);
        }
        if (point !== "sidebar.thread-row.title-prefix" && point !== "sidebar.thread-row.priority-indicator") {
          return unsupported(`Contribution render ${point}`);
        }
        const slot = point === "sidebar.thread-row.priority-indicator" ? "priority-indicator" : "title-prefix";
        const mounts = /* @__PURE__ */ new Map();
        const threadIdByOwnerId = /* @__PURE__ */ new Map();
        const cleanupMount = (mount) => {
          if (mount.disposed) return;
          mount.disposed = true;
          entry.controller.signal.removeEventListener(
            "abort",
            mount.onLifetimeAbort
          );
          mount.controller.abort();
          try {
            mount.disposer?.dispose();
          } catch (error) {
            console.error(`[${identity.id}] render disposal failed`, error);
          }
          const ownerMounts = mounts.get(mount.ownerId);
          ownerMounts?.delete(mount);
          if (ownerMounts?.size === 0) mounts.delete(mount.ownerId);
        };
        const cleanupMounts = (ownerId) => {
          const records = ownerId === void 0 ? [...mounts.values()].flatMap((values) => [...values]) : [...mounts.get(ownerId) ?? []];
          for (const mount of records) cleanupMount(mount);
        };
        const observer = typeof MutationObserver === "function" && document.documentElement ? new MutationObserver(() => {
          for (const values of mounts.values()) {
            for (const mount of [...values]) {
              if (mount.container.isConnected) mount.seenConnected = true;
              else if (mount.seenConnected) cleanupMount(mount);
            }
          }
        }) : void 0;
        observer?.observe(document.documentElement, { childList: true, subtree: true });
        const legacyRegistration = legacy.threads.list.registerItem((thread) => {
          const ownerId = threadOwnerId(thread);
          threadIdByOwnerId.set(ownerId, thread.threadId);
          const currentThread = legacy.threads.getCurrent();
          const context = {
            ownerId,
            windowId: state.windowId,
            thread: threadSummary(thread),
            selected: thread.selected ?? sameThreadIdentity(currentThread, thread)
          };
          if (contribution.isVisible && !contribution.isVisible(context)) {
            return void 0;
          }
          return {
            view() {
              const container = document.createElement("span");
              container.style.display = "block";
              container.style.height = "100%";
              const controller = new AbortController();
              const onLifetimeAbort = () => controller.abort(entry.controller.signal.reason);
              entry.controller.signal.addEventListener(
                "abort",
                onLifetimeAbort,
                { once: true }
              );
              const mount = {
                ownerId,
                container,
                controller,
                onLifetimeAbort,
                seenConnected: false,
                disposed: false,
                disposer: void 0
              };
              const ownerMounts = mounts.get(ownerId) ?? /* @__PURE__ */ new Set();
              ownerMounts.add(mount);
              mounts.set(ownerId, ownerMounts);
              try {
                const disposer = contribution.render({
                  id: randomId(`thread-row-${slot}`),
                  ownerId,
                  windowId: state.windowId,
                  container,
                  context,
                  signal: controller.signal
                });
                if (disposer !== void 0 && (!disposer || typeof disposer !== "object" || typeof disposer.dispose !== "function")) {
                  throw new TypeError("A render provider must return a Disposable or undefined");
                }
                mount.disposer = disposer;
              } catch (error) {
                cleanupMount(mount);
                throw error;
              }
              queueMicrotask(() => {
                if (mount.disposed) return;
                if (container.isConnected) mount.seenConnected = true;
                else cleanupMount(mount);
              });
              return container;
            }
          };
        }, { slot });
        let disposed = false;
        const result = Object.freeze({
          invalidate(ownerId) {
            if (disposed) return;
            cleanupMounts(ownerId);
            legacyRegistration.invalidate(
              ownerId === void 0 ? void 0 : threadIdByOwnerId.get(ownerId)
            );
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            observer?.disconnect();
            cleanupMounts();
            threadIdByOwnerId.clear();
            legacyRegistration.dispose();
            entry.disposables.delete(result);
          }
        });
        return tracked(entry, result);
      },
      register(kind, definition) {
        if (kind === "assistant-directive") {
          const next = definition;
          const context = memoizedRichContext(assistantDirectiveContext);
          const register = () => legacy.ui.registerAssistantDirective({
            id: namespacedId(identity.id, next.id),
            name: next.name,
            provider: richContentProvider(
              entry,
              identity,
              "assistant-directive",
              context,
              next.render
            )
          });
          return invalidatingRegistration(entry, register, () => {
          });
        }
        if (kind === "assistant-content-reference") {
          const next = definition;
          const context = memoizedRichContext(assistantContentReferenceContext);
          const register = () => legacy.ui.registerAssistantContentReference({
            id: namespacedId(identity.id, next.id),
            type: next.type,
            ...next.matches === void 0 ? {} : { matches: (legacyContext) => next.matches?.(context(legacyContext)) === true },
            provider: richContentProvider(
              entry,
              identity,
              "assistant-content-reference",
              context,
              next.render
            )
          });
          return invalidatingRegistration(entry, register, () => {
          });
        }
        if (kind === "assistant-code-block") {
          const next = definition;
          const context = memoizedRichContext(assistantCodeBlockContext);
          const register = () => legacy.ui.registerAssistantCodeBlock({
            id: namespacedId(identity.id, next.id),
            ...next.language === void 0 ? {} : { language: next.language },
            ...next.matches === void 0 ? {} : { matches: (legacyContext) => next.matches?.(context(legacyContext)) === true },
            provider: richContentProvider(
              entry,
              identity,
              "assistant-code-block",
              context,
              next.render
            )
          });
          return invalidatingRegistration(entry, register, () => {
          });
        }
        if (kind === "conversation-item") {
          const next = definition;
          const context = memoizedRichContext(conversationItemContext);
          const register = () => legacy.ui.registerConversationItem({
            id: namespacedId(identity.id, next.id),
            type: next.type,
            ...next.matches === void 0 ? {} : { matches: (legacyContext) => next.matches?.(context(legacyContext)) === true },
            provider: richContentProvider(
              entry,
              identity,
              "conversation-item",
              context,
              next.render
            )
          });
          return invalidatingRegistration(entry, register, () => {
          });
        }
        if (kind === "command") {
          return registerCommand(identity, entry, definition);
        }
        if (kind === "settings-section") {
          return registerSettingsSection(
            legacy,
            identity,
            entry,
            definition
          );
        }
        if (kind === "composer-action") {
          const action = definition;
          let currentContext = composerContext({
            ownerId: "composer:main",
            kind: "main"
          });
          const publicContext = (legacyContext) => {
            currentContext = composerContext(legacyContext);
            return currentContext;
          };
          const register = () => legacy.ui.registerComposerAction({
            id: namespacedId(identity.id, action.id),
            placement: action.placement,
            label: action.label,
            ...action.icon === void 0 ? {} : { icon: action.icon },
            ...action.tooltip === void 0 ? {} : { tooltip: action.tooltip },
            ...action.order === void 0 ? {} : { order: action.order },
            isVisible: (legacyContext) => action.isVisible?.(publicContext(legacyContext)) ?? true,
            isDisabled: (legacyContext) => action.isDisabled?.(publicContext(legacyContext)) ?? false,
            ...action.menuItems === void 0 ? {} : {
              menuItems: action.menuItems.map(
                (item) => legacyComposerMenuItem(
                  item,
                  () => currentContext,
                  identity.id
                )
              )
            },
            onClick: (legacyContext, next) => action.onActivate(publicContext(legacyContext), activation(next)),
            origin: identity.id
          });
          return invalidatingRegistration(entry, register, () => {
          });
        }
        return unsupported(`Contribution definition ${kind}`);
      }
    };
    const settings = {
      async get(key, options) {
        const signal = extensionSettingsOptions(options);
        await loadSettings(hub);
        signal?.throwIfAborted();
        return hub.values[key];
      },
      async set(key, value, options) {
        const signal = extensionSettingsOptions(options);
        await loadSettings(hub);
        signal?.throwIfAborted();
        hub.values[key] = value;
        emitSetting(hub, key, value);
        await persistSettings(hub);
        signal?.throwIfAborted();
      },
      async delete(key, options) {
        const signal = extensionSettingsOptions(options);
        await loadSettings(hub);
        signal?.throwIfAborted();
        delete hub.values[key];
        emitSetting(hub, key, void 0);
        await persistSettings(hub);
        signal?.throwIfAborted();
      },
      async batch(values, options) {
        const signal = extensionSettingsOptions(options);
        await loadSettings(hub);
        signal?.throwIfAborted();
        Object.assign(hub.values, values);
        for (const [key, value] of Object.entries(values)) {
          emitSetting(hub, key, value);
        }
        await persistSettings(hub);
        signal?.throwIfAborted();
      },
      async listSections(options) {
        options?.signal?.throwIfAborted();
        return unsupported("Settings section listing");
      },
      async open(options) {
        const signal = options?.signal;
        signal?.throwIfAborted();
        if (options?.hostId !== void 0) {
          return unsupported("Host-scoped settings navigation");
        }
        const sectionId = options?.sectionId ?? "general-settings";
        if (typeof sectionId !== "string" || sectionId.length === 0) {
          throw new TypeError("A settings section id must be non-empty");
        }
        if (options?.controlId !== void 0 && options.controlId.length === 0) {
          throw new TypeError("A settings control id must be non-empty");
        }
        const paneId = settingsTargetId(identity.id, sectionId);
        const opened = await legacy.settings.open(
          paneId,
          options?.controlId ? { itemId: `${paneId}.${options.controlId}` } : {}
        );
        signal?.throwIfAborted();
        if (!opened) throw new Error(`Settings section is unavailable: ${sectionId}`);
      },
      events(scope) {
        if (scope.kind !== "extension") {
          return unsupported("Non-extension settings scope");
        }
        return {
          subscribe(listener, options) {
            if (typeof listener !== "function") {
              throw new TypeError("A settings event listener is required");
            }
            const signal = eventSubscriptionSignal(options);
            let active = true;
            let resource;
            const emit = (message) => {
              if (!active) return;
              try {
                listener(message);
              } catch (error) {
                console.error(`[${identity.id}] settings listener failed`, error);
              }
            };
            const onChange = (change) => {
              if (!active) return;
              state.sequence += 1;
              emit({
                type: "event",
                cursor: String(hub.revision),
                value: {
                  id: `settings-${state.sequence}`,
                  sequence: state.sequence,
                  occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
                  scope: {},
                  event: change
                }
              });
            };
            hub.listeners.add(onChange);
            if (options?.afterCursor !== void 0) {
              emit({
                type: "reset",
                cursor: String(hub.revision),
                reason: "cursor-expired"
              });
            }
            void loadSettings(hub).then(() => {
              if (!active) return;
              emit({
                type: "snapshot",
                cursor: String(hub.revision),
                value: {
                  revision: hub.revision,
                  scope: extensionScope(),
                  values: { ...hub.values }
                }
              });
            }).catch((error) => {
              if (active) {
                console.error(`[${identity.id}] settings load failed`, error);
              }
            });
            const dispose = () => {
              if (!active) return;
              active = false;
              signal?.removeEventListener("abort", dispose);
              hub.listeners.delete(onChange);
              entry.disposables.delete(resource);
            };
            resource = Object.freeze({ dispose });
            tracked(entry, resource);
            signal?.addEventListener("abort", dispose, { once: true });
            if (signal?.aborted) dispose();
            return dispose;
          }
        };
      }
    };
    const implemented = {
      runtime: apiNamespace("runtime", runtime),
      appearance: apiNamespace("appearance", appearance),
      contributions: apiNamespace("contributions", contributions),
      settings: apiNamespace("settings", settings),
      threads: apiNamespace("threads", threads)
    };
    return new Proxy(implemented, {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
        if (typeof property === "symbol") return void 0;
        return unavailableApiMember(String(property));
      }
    });
  }
  function normalizeInstalledExtensions(value) {
    if (!Array.isArray(value)) {
      throw new TypeError("Invalid installed extension listing");
    }
    const ids = /* @__PURE__ */ new Set();
    return Object.freeze(
      value.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new TypeError("Invalid installed extension listing");
        }
        const candidate = entry;
        if (typeof candidate.id !== "string" || !extensionIdPattern2.test(candidate.id) || ids.has(candidate.id) || typeof candidate.name !== "string" || typeof candidate.description !== "string" || typeof candidate.version !== "string" || typeof candidate.enabled !== "boolean" || typeof candidate.required !== "boolean" || candidate.settingsSectionId !== void 0 && (typeof candidate.settingsSectionId !== "string" || !candidate.settingsSectionId.startsWith(`${candidate.id}.`))) {
          throw new TypeError("Invalid installed extension listing");
        }
        ids.add(candidate.id);
        return Object.freeze({
          id: candidate.id,
          name: candidate.name,
          description: candidate.description,
          version: candidate.version,
          enabled: candidate.enabled,
          required: candidate.required,
          ...candidate.settingsSectionId === void 0 ? {} : { settingsSectionId: candidate.settingsSectionId }
        });
      })
    );
  }
  function extensionsApi(callerExtensionId) {
    return Object.freeze({
      async list(options) {
        options?.signal?.throwIfAborted();
        const result = await globalThis.__CGPTX_RUNTIME__?.request(
          "extensions.list",
          { extensionId: callerExtensionId }
        );
        options?.signal?.throwIfAborted();
        return normalizeInstalledExtensions(result);
      },
      async setEnabled(extensionId, enabled, options) {
        if (!extensionIdPattern2.test(extensionId)) {
          throw new TypeError("Invalid extension id");
        }
        if (typeof enabled !== "boolean") {
          throw new TypeError("Extension enablement must be boolean");
        }
        options?.signal?.throwIfAborted();
        const result = await globalThis.__CGPTX_RUNTIME__?.request(
          "extensions.set-enabled",
          {
            extensionId: callerExtensionId,
            targetExtensionId: extensionId,
            enabled
          }
        );
        options?.signal?.throwIfAborted();
        return normalizeInstalledExtensions(result);
      }
    });
  }
  function contextFor(legacy, identity, entry, phase) {
    const state = adapterState();
    const extension = Object.freeze({
      ...identity,
      instanceId: `${identity.id}:${phase}:${state.documentId}`
    });
    return Object.freeze({
      extension,
      storage: createExtensionStorage(identity.id),
      extensions: extensionsApi(identity.id),
      lifetime: entry.controller.signal,
      api: apiFor(legacy, identity, entry, extension),
      document: Object.freeze(
        globalThis.__CGPTX_RUNTIME__?.document ?? {
          id: state.documentId,
          windowId: state.windowId,
          webContentsId: 0,
          url: globalThis.location?.href ?? "app://-/"
        }
      ),
      main: Object.freeze({
        async invoke(method, parameters, options) {
          if (typeof method !== "string" || method.length === 0) {
            throw new TypeError("A main-channel method is required");
          }
          options?.signal?.throwIfAborted();
          const callId = randomId("main-call");
          const onAbort = () => {
            void globalThis.__CGPTX_RUNTIME__?.request("main-channel.cancel", {
              extensionId: identity.id,
              documentId: globalThis.__CGPTX_RUNTIME__?.document?.id ?? state.documentId,
              callId
            });
          };
          options?.signal?.addEventListener("abort", onAbort, { once: true });
          try {
            const value = await globalThis.__CGPTX_RUNTIME__?.request(
              "main-channel.invoke",
              {
                extensionId: identity.id,
                documentId: globalThis.__CGPTX_RUNTIME__?.document?.id ?? state.documentId,
                callId,
                method,
                ...parameters === void 0 ? {} : { parameters }
              }
            );
            options?.signal?.throwIfAborted();
            return value;
          } finally {
            options?.signal?.removeEventListener("abort", onAbort);
          }
        },
        on(event, listener) {
          if (typeof event !== "string" || event.length === 0) {
            throw new TypeError("A main-channel event is required");
          }
          if (typeof listener !== "function") {
            throw new TypeError("A main-channel listener is required");
          }
          let disposed = false;
          const unsubscribe = globalThis.__CGPTX_RUNTIME__?.subscribe?.(
            identity.id,
            event,
            (payload) => {
              if (disposed || entry.controller.signal.aborted) return;
              try {
                listener(payload);
              } catch (error) {
                console.error(`[${identity.id}] main-channel listener failed`, error);
              }
            }
          );
          let result;
          const dispose = () => {
            if (disposed) return;
            disposed = true;
            unsubscribe?.();
            entry.disposables.delete(result);
          };
          result = Object.freeze({ dispose });
          return tracked(entry, result);
        }
      })
    });
  }
  function activateExactBuildRendererExtension(hostApi, identity, module, phase) {
    const state = adapterState();
    const key = `${identity.id}:${phase}`;
    if (state.active.has(key)) return;
    const entry = {
      controller: new AbortController(),
      disposables: /* @__PURE__ */ new Set()
    };
    state.active.set(key, entry);
    const context = contextFor(
      hostApi,
      identity,
      entry,
      phase
    );
    try {
      const result = module.activate(context);
      if (result && typeof result.then === "function") {
        void result.then(
          () => {
            if (state.active.get(key) === entry && !entry.controller.signal.aborted) {
              reportActivation(identity.id, phase, "activated");
            }
          },
          (error) => {
            if (state.active.get(key) !== entry) return;
            console.error(`[${identity.id}] ${phase} activation failed`, error);
            reportActivation(identity.id, phase, "failed", error);
            deactivateExactBuildRendererExtension(identity.id, module, phase);
          }
        );
      } else {
        reportActivation(identity.id, phase, "activated");
      }
    } catch (error) {
      console.error(`[${identity.id}] ${phase} activation failed`, error);
      reportActivation(identity.id, phase, "failed", error);
      deactivateExactBuildRendererExtension(identity.id, module, phase);
    }
  }
  function reportActivation(extensionId, phase, status, error) {
    try {
      void globalThis.__CGPTX_RUNTIME__?.request("renderer-entry.report", {
        extensionId,
        phase,
        status,
        ...error === void 0 ? {} : { error: String(error) }
      }).catch(() => {
      });
    } catch {
    }
  }
  function deactivateExactBuildRendererExtension(extensionId, module, phase) {
    const state = adapterState();
    const key = `${extensionId}:${phase}`;
    const entry = state.active.get(key);
    if (!entry) return;
    state.active.delete(key);
    entry.controller.abort();
    for (const value of [...entry.disposables].reverse()) {
      try {
        value.dispose();
      } catch (error) {
        console.error(`[${extensionId}] disposal failed`, error);
      }
    }
    entry.disposables.clear();
    const hasAnotherPhase = [...state.active.keys()].some(
      (activeKey) => activeKey.startsWith(`${extensionId}:`)
    );
    if (!hasAnotherPhase) {
      const hub = state.settings.get(extensionId);
      hub?.channel?.close();
      state.settings.delete(extensionId);
    }
    try {
      const result = module.deactivate?.();
      if (result && typeof result.then === "function") {
        void result.catch(
          (error) => console.error(`[${extensionId}] deactivation failed`, error)
        );
      }
    } catch (error) {
      console.error(`[${extensionId}] deactivation failed`, error);
    }
  }

  // runtime/bindings/26.820.80927/renderer-entry.ts
  globalThis.__CHATGPTX_V5_RENDERER_HOST__ = createRendererHost({
    version: "26.820.80927",
    activate: activateExactBuildRendererExtension,
    deactivate: deactivateExactBuildRendererExtension
  });
})();
