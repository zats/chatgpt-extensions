"use strict";

const crypto = require("node:crypto");

const targetAppVersion = "26.825.51511";
const targetAppBuild = "7377";

function lines(...values) {
  return values.join("\n");
}

const exactUiBridgeSource = String.raw`  const exactUiTransformers = Object.freeze({
    suggestions: [],
    announcements: [],
    sidebarDestinations: [],
    productModeMenu: [],
  });
  const exactUiRenderRegistrations = [];
  const exactComposerActionRegistrations = [];
  const exactRichContentRegistrations = Object.freeze({
    assistantDirective: [],
    assistantContentReference: [],
    assistantCodeBlock: [],
    conversationItem: [],
  });
  const exactRichOwnerHits = {
    assistantMarkdown: 0,
    assistantDirective: 0,
    assistantContentReference: 0,
    assistantCodeBlock: 0,
    localConversationItem: 0,
    cloudConversationItem: 0,
  };
  const exactRichLifecycle = Object.freeze({
    mounts: {
      assistantDirective: 0,
      assistantContentReference: 0,
      assistantCodeBlock: 0,
      conversationItem: 0,
    },
    disposals: {
      assistantDirective: 0,
      assistantContentReference: 0,
      assistantCodeBlock: 0,
      conversationItem: 0,
    },
  });
  const exactRichFallbacks = Object.freeze({
    assistantDirective: { rendererError: 0 },
    assistantContentReference: { nonMatch: 0, matcherError: 0, rendererError: 0 },
    assistantCodeBlock: { nonMatch: 0, matcherError: 0, rendererError: 0 },
    conversationItemLocal: { nonMatch: 0, matcherError: 0, rendererError: 0 },
    conversationItemCloud: { nonMatch: 0, matcherError: 0, rendererError: 0 },
  });
  const exactUiListeners = new Set();
  const exactRichRevisions = new WeakMap();
  let exactUiVersion = 0;
  let exactComposerMode = "work";
  let exactHomeHostId = "local";
  let exactHomeProjectRoot;
  let exactHomePlan = false;
  let exactHomeSuggestionLayout = "cards";
  let exactHomePageComposerMode = "work";
  let exactHomeAnnouncementState = Object.freeze({
    entryPoint: "home",
    homeComposerMode: "work",
    isLocalModeRemote: false,
  });
  let ExactUiMountComponent = null;
  let ExactComposerActionComponent = null;
  let ExactRichContentBoundaryComponent = null;
  let exactCloudConversationItemOwner = null;
  let exactCloudConversationItemOwnerDrift = false;
  let exactRichProbeRequested = false;
  let exactRichProbeContainer = null;
  let mountExactRichContentProbe = null;
  let unmountExactRichContentProbe = null;
  let runExactProductExtensionProbe = null;
  let runExactProductExtensionRealUiProbe = null;

  function primaryAppShellReady() {
    const root = document.querySelector(
      'main[data-app-shell-main-surface="default"]',
    );
    if (!(root instanceof HTMLElement) || !root.isConnected) return false;
    const header = root.querySelector(
      'header[data-pip-obstacle="app-shell-header"]',
    );
    const mainFocusArea = root.querySelector(
      '[data-app-shell-focus-area="main"]',
    );
    return (
      header instanceof HTMLElement &&
      mainFocusArea instanceof HTMLElement &&
      root.contains(header) &&
      root.contains(mainFocusArea)
    );
  }

  function subscribeExactUi(listener) {
    exactUiListeners.add(listener);
    return () => exactUiListeners.delete(listener);
  }

  function emitExactUiChange() {
    exactUiVersion += 1;
    for (const listener of exactUiListeners) listener();
  }

  function exactUiRegistration(collection, entry) {
    collection.push(entry);
    emitExactUiChange();
    let disposed = false;
    return Object.freeze({
      invalidate() {
        if (!disposed) emitExactUiChange();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        const index = collection.indexOf(entry);
        if (index >= 0) collection.splice(index, 1);
        emitExactUiChange();
      },
    });
  }

  function applyExactUiTransforms(collection, items, context, point) {
    let result = Object.freeze([...items]);
    for (const entry of collection) {
      try {
        const output = entry.transform(result, context);
        if (!Array.isArray(output)) {
          warn(point + " transformer from " + entry.extId + " returned a non-array");
          continue;
        }
        result = Object.freeze([...output]);
      } catch (error) {
        warn(point + " transformer from " + entry.extId + " failed", error);
      }
    }
    return result;
  }

  function exactOwnerContext(ownerId, extra = {}) {
    return Object.freeze({ ownerId, ...extra });
  }

  function exactJsonSnapshot(value, seen = new WeakSet()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "object") return undefined;
    if (seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      const output = value.map((item) => exactJsonSnapshot(item, seen) ?? null);
      seen.delete(value);
      return Object.freeze(output);
    }
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      const snapshot = exactJsonSnapshot(item, seen);
      if (snapshot !== undefined) output[key] = snapshot;
    }
    seen.delete(value);
    return Object.freeze(output);
  }

  function exactRichRegistration(collection, entry) {
    const revisions = { all: 0, owners: new Map() };
    exactRichRevisions.set(entry, revisions);
    collection.push(entry);
    emitExactUiChange();
    let disposed = false;
    return Object.freeze({
      invalidate(ownerId) {
        if (disposed) return;
        if (typeof ownerId === "string" && ownerId.length > 0) {
          revisions.owners.set(
            ownerId,
            (revisions.owners.get(ownerId) ?? 0) + 1,
          );
        } else {
          revisions.all += 1;
        }
        emitExactUiChange();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        exactRichRevisions.delete(entry);
        const index = collection.indexOf(entry);
        if (index >= 0) collection.splice(index, 1);
        emitExactUiChange();
      },
    });
  }

  function exactRichRevision(entry, ownerId) {
    const revisions = exactRichRevisions.get(entry);
    if (!revisions) return "0:0";
    return revisions.all + ":" + (revisions.owners.get(ownerId) ?? 0);
  }

  function exactRichProbeFallbackOutcome(kind, context) {
    if (kind === "assistantDirective") {
      const outcome = context.directive?.attributes?.outcome;
      return outcome === "unregistered" || outcome === "rendererError"
        ? outcome
        : null;
    }
    const value =
      kind === "assistantContentReference"
        ? context.reference?.data?.description
        : kind === "assistantCodeBlock"
          ? context.codeBlock?.content
          : kind === "conversationItem"
            ? context.item?.content
            : undefined;
    if (typeof value !== "string") return null;
    const match = /chatgptx-fallback:(nonMatch|matcherError|rendererError)/.exec(
      value,
    );
    return match?.[1] ?? null;
  }

  function recordExactRichFallback(kind, outcome, context) {
    if (exactRichProbeFallbackOutcome(kind, context) !== outcome) return;
    const surface =
      kind === "conversationItem"
        ? context.scope === "cloud"
          ? "conversationItemCloud"
          : "conversationItemLocal"
        : kind;
    const counters = exactRichFallbacks[surface];
    if (typeof counters?.[outcome] === "number") counters[outcome] += 1;
  }

  function exactRichFallbackStatus(surface, outcome) {
    const counters = exactRichFallbacks[surface];
    const labels = {
      assistantContentReference:
        "Rich probe content reference " + outcome + " first-party fallback",
      assistantCodeBlock:
        "Rich probe code block " + outcome + " first-party fallback",
      conversationItemLocal:
        "Rich probe local conversation item " + outcome + " first-party fallback",
      conversationItemCloud:
        "Rich probe cloud conversation item " + outcome + " first-party fallback",
    };
    const connected =
      surface === "assistantDirective"
        ? document.querySelector(
            '[data-cgptx-rich-first-party-directive="' + outcome + '"]',
          )?.isConnected === true
        : document.body?.innerText?.includes(labels[surface]) === true;
    return Object.freeze({
      attempts: counters?.[outcome] ?? 0,
      connected,
    });
  }

  function exactRichEntry(kind, context) {
    const collection = exactRichContentRegistrations[kind];
    if (!Array.isArray(collection)) return null;
    for (let index = collection.length - 1; index >= 0; index -= 1) {
      const entry = collection[index];
      if (kind === "assistantDirective" && entry.name !== context.directive.name) {
        continue;
      }
      if (
        kind === "assistantContentReference" &&
        entry.type !== context.reference.type
      ) {
        continue;
      }
      if (
        kind === "assistantCodeBlock" &&
        entry.language !== undefined &&
        entry.language !== context.codeBlock.language
      ) {
        continue;
      }
      if (kind === "conversationItem" && entry.type !== context.itemType) {
        continue;
      }
      try {
        if (typeof entry.matches === "function" && entry.matches(context) !== true) {
          recordExactRichFallback(kind, "nonMatch", context);
          continue;
        }
      } catch (error) {
        recordExactRichFallback(kind, "matcherError", context);
        warn(kind + " matcher from " + entry.extId + " failed", error);
        continue;
      }
      return entry;
    }
    return null;
  }

  function exactComposerContext(props = {}) {
    if (props.composerMode === "codex") exactComposerMode = "codex";
    else if (typeof props.composerMode === "string") exactComposerMode = "work";
    return exactOwnerContext("composer:main", {
      kind: "main",
      mode: exactComposerMode,
      focused: document.activeElement?.matches?.("textarea,[contenteditable='true']") === true,
      ...(typeof props.hostId === "string" ? { hostId: props.hostId } : {}),
      ...(typeof props.projectRoot === "string" ? { projectRoot: props.projectRoot } : {}),
    });
  }

  function exactText(value, fallback = "") {
    if (typeof value === "string") return value;
    const message = messageOf(value);
    return message?.defaultMessage ?? message?.id ?? fallback;
  }

  function exactUiIconName(icon) {
    if (typeof icon === "string") return icon;
    if (!icon || typeof icon !== "object") return null;
    if (icon.kind === "app" || icon.kind === "system") return icon.name;
    return null;
  }

  function exactUiIconComponent(icon, fallback) {
    if (typeof icon === "function") return icon;
    if (native?.React?.isValidElement?.(icon)) return icon.type;
    const name = exactUiIconName(icon);
    return (name ? resolveIcon(name) : null) ?? fallback ?? resolveIcon("plus");
  }

  function exactUiIconElement(icon, fallback, className = "icon-sm") {
    if (native.React.isValidElement(icon)) return icon;
    if (icon?.kind === "svg" && typeof icon.source === "string") {
      return native.jsx("span", {
        className,
        "aria-hidden": true,
        dangerouslySetInnerHTML: { __html: icon.source },
      });
    }
    if (icon?.kind === "color") {
      return native.jsx("span", {
        className: "inline-block size-4 rounded-sm",
        "aria-hidden": true,
        style: { background: icon.light },
      });
    }
    const Icon = exactUiIconComponent(icon, fallback);
    return Icon ? native.jsx(Icon, { className }) : null;
  }

  function exactUiActivation(event) {
    return Object.freeze({
      metaKey: event?.metaKey === true,
      shiftKey: event?.shiftKey === true,
      altKey: event?.altKey === true,
      controlKey: event?.ctrlKey === true,
    });
  }

  function exactUiMenuAction(item, context, nested) {
    const props = {
      LeftIcon: exactUiIconComponent(item.icon, null),
      RightIcon: item.checked
        ? resolveIcon("check")
        : exactUiIconComponent(item.rightIcon, null),
      SubText: item.subText ?? item.message,
      disabled: item.disabled === true,
      keyboardShortcut: item.keybinding,
      ...(item.href === undefined ? {} : { href: item.href }),
      ...(!nested && typeof item.onClick === "function"
        ? { onSelect: (event) => item.onClick(exactUiActivation(event)) }
        : {}),
      children: item.label,
    };
    return native.jsx(native.Item, props, item.id);
  }

  function exactUiMenuItem(item, context) {
    if (item.kind === "separator") {
      return native.jsx(native.Separator, {}, item.id);
    }
    const children = Array.isArray(item.items) ? item.items : [];
    if (children.length > 0) {
      return native.jsx(native.SubmenuItem, {
        trigger: exactUiMenuAction(item, context, true),
        children: children.map((child) => exactUiMenuItem(child, context)),
      }, item.id);
    }
    return exactUiMenuAction(item, context, false);
  }

  function exactSuggestionItems(rawItems, props) {
    const composerMode = props.composerMode === "chat" ? "chat" : "work";
    const context = exactOwnerContext("home:new-thread", {
      mode: exactComposerMode,
      composerMode,
      layout: props.layout === "list" ? "list" : "cards",
      hostId: exactHomeHostId,
      ...(exactHomeProjectRoot ? { projectRoot: exactHomeProjectRoot } : {}),
      plan: exactHomePlan,
    });
    const rawById = new Map();
    const items = rawItems.map((raw, index) => {
      const id = typeof raw?.id === "string" ? raw.id : "opaque:" + index;
      rawById.set(id, raw);
      return Object.freeze({
        kind: "action",
        id,
        label: exactText(raw?.label, id),
        ...(raw?.description == null ? {} : { description: exactText(raw.description) }),
        ...(raw?.tooltipContent == null ? {} : { tooltip: exactText(raw.tooltipContent) }),
        ...(raw?.keyboardShortcut == null
          ? {}
          : { keyboardShortcut: raw.keyboardShortcut }),
        ...(raw?.disabled == null ? {} : { disabled: raw.disabled === true }),
        ...(raw?.onClick == null ? {} : { onClick: raw.onClick }),
        ...(raw?.onDismiss == null ? {} : { onDismiss: raw.onDismiss }),
        origin: "app",
      });
    });
    return applyExactUiTransforms(
      exactUiTransformers.suggestions,
      items,
      context,
      "home suggestions",
    ).map((item) => {
      const raw = rawById.get(item.id);
      if (raw && item.origin === "app") {
        return {
          ...raw,
          label: item.label,
          ...(item.description === undefined ? {} : { description: item.description }),
          ...(item.tooltip === undefined ? {} : { tooltipContent: item.tooltip }),
          ...(item.icon === undefined
            ? {}
            : { icon: exactUiIconElement(item.icon, null, "icon-sm text-info") }),
          ...(item.listIcon === undefined
            ? {}
            : { listIcon: exactUiIconElement(item.listIcon, null, "icon-sm") }),
          ...(item.keyboardShortcut === undefined
            ? {}
            : { keyboardShortcut: item.keyboardShortcut }),
          disabled: item.disabled === true,
          ...(typeof item.onClick === "function" ? { onClick: item.onClick } : {}),
          ...(typeof item.onDismiss === "function"
            ? { onDismiss: item.onDismiss }
            : {}),
        };
      }
      return {
        id: item.id,
        label: native.jsx("span", {
          "data-cgptx-home-suggestion": item.id,
          children: item.label,
        }),
        ...(item.description === undefined ? {} : { description: item.description }),
        ...(item.tooltip === undefined ? {} : { tooltipContent: item.tooltip }),
        ...(item.listIcon === undefined
          ? {}
          : { listIcon: exactUiIconElement(item.listIcon, null, "icon-sm") }),
        ...(item.keyboardShortcut === undefined
          ? {}
          : { keyboardShortcut: item.keyboardShortcut }),
        disabled: item.disabled === true,
        icon: exactUiIconElement(item.icon, null, "icon-sm text-info"),
        onClick: typeof item.onClick === "function" ? item.onClick : () => {},
        ...(typeof item.onDismiss === "function"
          ? { onDismiss: item.onDismiss }
          : {}),
      };
    });
  }

  function exactAnnouncementItems(rawEntries) {
    const context = exactOwnerContext("home:announcements", {
      mode: exactComposerMode,
      ...exactHomeAnnouncementState,
      onboardingPromosHidden: false,
    });
    const rawById = new Map();
    const items = rawEntries.map((raw, index) => {
      const id = "app.announcement:" + index;
      rawById.set(id, raw);
      return Object.freeze({
        kind: "opaque",
        id,
        origin: "app",
      });
    });
    return applyExactUiTransforms(
      exactUiTransformers.announcements,
      items,
      context,
      "home announcements",
    ).map((item) => {
      const raw = rawById.get(item.id);
      if (raw && item.kind === "opaque") return raw;
      const primaryAction = item.primaryAction
        ? {
            label: item.primaryAction.label,
            disabled: item.primaryAction.disabled === true,
            onClick: item.primaryAction.onClick,
          }
        : undefined;
      const dismissAction = item.dismissAction
        ? {
            ariaLabel: item.dismissAction.label,
            disabled: item.dismissAction.disabled === true,
            icon: exactUiIconComponent(item.dismissAction.icon, resolveIcon("x")),
            onClick: item.dismissAction.onClick,
          }
        : undefined;
      return {
        isEligible: item.isEligible !== false,
        isLoading: item.isLoading === true,
        content: native.jsx(native.Banner, {
          title: native.jsx("span", {
            "data-cgptx-home-announcement": item.id,
            children: item.title,
          }),
          description: item.description,
          leadingVisual: exactUiIconElement(item.leadingVisual, null, "size-full"),
          ...(primaryAction ? { primaryAction } : {}),
          ...(dismissAction ? { dismissAction } : {}),
        }),
      };
    });
  }

  const exactSidebarBuiltInIds = Object.freeze({
    "builtin:archive": "app.archive",
    "builtin:automations": "app.automations",
    "builtin:debug": "app.debug",
    "builtin:finance": "app.finance",
    "builtin:library": "app.library",
    "builtin:projects": "app.projects",
    "builtin:pull-requests": "app.pull-requests",
    "builtin:security": "app.security",
    "builtin:sites": "app.sites",
    "builtin:skills": "app.skills",
  });

  function exactSidebarPublicId(id) {
    if (typeof id !== "string") return id;
    if (exactSidebarBuiltInIds[id]) return exactSidebarBuiltInIds[id];
    if (id.startsWith("mcp:")) return "app." + id;
    return id;
  }

  function exactSidebarDestinationItems(rawItems, props) {
    const selectedDestinationId = exactSidebarPublicId(rawItems.find(
      (item) => item?.isCurrentDestination === true,
    )?.id);
    const context = exactOwnerContext("sidebar:destinations", {
      mode:
        props.sidebarMode === "chatgpt"
          ? "chatgpt"
          : props.sidebarMode === "codex"
            ? "codex"
            : "work",
      ...(selectedDestinationId ? { selectedDestinationId } : {}),
    });
    const rawById = new Map();
    const items = rawItems.map((raw) => {
      const id = exactSidebarPublicId(raw.id);
      rawById.set(id, raw);
      return Object.freeze({
        kind: "destination",
        id,
        label: exactText(raw.label, id),
        ...(typeof raw.animatedIcon !== "string"
          ? {}
          : {
              animatedIcon: Object.freeze({
                kind: "app",
                name: raw.animatedIcon,
              }),
            }),
        customizable: true,
        defaultLocation: raw.visibleByDefault === false ? "explore" : "sidebar",
        visibleByDefault: raw.visibleByDefault !== false,
        hasUnreadActivity: raw.hasUnreadActivity === true,
        isCurrentDestination: raw.isCurrentDestination === true,
        ...(typeof raw.onPrefetch === "function" ? { onPrefetch: raw.onPrefetch } : {}),
        ...(typeof raw.onSelect === "function" ? { onClick: raw.onSelect } : {}),
        origin: "app",
      });
    });
    return applyExactUiTransforms(
      exactUiTransformers.sidebarDestinations,
      items,
      context,
      "sidebar destinations",
    ).map((item) => {
      const raw = rawById.get(item.id);
      if (raw && item.origin === "app") {
        return {
          ...raw,
          label: item.label,
          ...(item.icon === undefined
            ? {}
            : { icon: exactUiIconComponent(item.icon, raw.icon) }),
          ...(item.railIcon === undefined
            ? {}
            : { railIcon: exactUiIconElement(item.railIcon, null, "icon-base") }),
          ...(item.animatedIcon === undefined
            ? {}
            : { animatedIcon: exactUiIconName(item.animatedIcon) }),
          visibleByDefault: item.defaultLocation !== "explore",
          hasUnreadActivity: item.hasUnreadActivity === true,
          isCurrentDestination: item.isCurrentDestination === true,
          ...(typeof item.onPrefetch === "function" ? { onPrefetch: item.onPrefetch } : {}),
          ...(typeof item.onClick === "function" ? { onSelect: item.onClick } : {}),
        };
      }
      return {
        id: item.id,
        label: native.jsx("span", {
          "data-cgptx-sidebar-destination": item.id,
          children: item.label,
        }),
        icon: exactUiIconComponent(item.icon),
        railIcon: exactUiIconComponent(item.railIcon, exactUiIconComponent(item.icon)),
        animatedIcon: exactUiIconName(item.animatedIcon),
        visibleByDefault: item.defaultLocation !== "explore",
        hasUnreadActivity: item.hasUnreadActivity === true,
        isCurrentDestination: item.isCurrentDestination === true,
        onPrefetch: typeof item.onPrefetch === "function" ? item.onPrefetch : undefined,
        onSelect: typeof item.onClick === "function" ? item.onClick : () => {},
      };
    });
  }

  function exactProductModeItems(tree, props) {
    if (!isElement(tree) || !Array.isArray(tree.props?.children)) return tree;
    const rawChildren = childrenOf(tree.props.children);
    const workChild = rawChildren[0];
    const codexChild = rawChildren[1];
    if (!isElement(workChild) || !isElement(codexChild)) return tree;
    const context = exactOwnerContext("sidebar:product-mode", {
      mode: props.mode,
      workModeAccess: props.workModeAccess,
      disabled: props.disabled === true,
    });
    const rawById = new Map([
      ["app.work", workChild],
      ["app.codex", codexChild],
    ]);
    const items = [
      Object.freeze({
        kind: "action",
        id: "app.work",
        label:
          props.workModeAccess === "chatgpt"
            ? "ChatGPT"
            : props.workModeAccess === "chatgpt_work"
              ? "ChatGPT Work"
              : "Work",
        subText: "Create, learn, and explore",
        checked: props.mode === "work",
        onClick: workChild.props.onSelect,
        origin: "app",
      }),
      Object.freeze({
        kind: "action",
        id: "app.codex",
        label: "Codex",
        subText: "Build, debug, and ship",
        checked: props.mode === "codex",
        onClick: codexChild.props.onSelect,
        origin: "app",
      }),
    ];
    const transformed = applyExactUiTransforms(
      exactUiTransformers.productModeMenu,
      items,
      context,
      "product mode menu",
    );
    const children = transformed.map((item) => {
      const raw = rawById.get(item.id);
      if (raw && item.origin === "app") return raw;
      if (item.kind === "separator") {
        return native.jsx(native.Separator, {}, item.id);
      }
      const nested = Array.isArray(item.items) ? item.items : [];
      const action = native.jsx(native.Item, {
        className: "py-2.5 text-base",
        RightIcon: item.checked
          ? resolveIcon("check")
          : exactUiIconComponent(item.rightIcon, null),
        LeftIcon: exactUiIconComponent(item.icon, null),
        SubText: item.subText ?? item.message,
        disabled: item.disabled === true,
        keyboardShortcut: item.keybinding,
        ...(item.href === undefined ? {} : { href: item.href }),
        ...(nested.length > 0 || typeof item.onClick !== "function"
          ? {}
          : { onSelect: item.onClick }),
        children: native.jsx("span", {
          className: "font-openai-sans",
          "data-cgptx-product-menu-item": item.id,
          children: item.label,
        }),
      }, item.id);
      return nested.length === 0
        ? action
        : native.jsx(native.SubmenuItem, {
            trigger: action,
            children: nested.map((child) => exactUiMenuItem(child, context)),
          }, item.id);
    });
    const triggerButton = isElement(tree.props?.triggerButton)
      ? native.React.cloneElement(tree.props.triggerButton, {
          "data-cgptx-product-mode-trigger": "",
        })
      : tree.props?.triggerButton;
    return native.React.cloneElement(tree, { children, triggerButton });
  }

  function exactRenderSlots(point, context) {
    return exactUiRenderRegistrations
      .filter((entry) => entry.point === point)
      .map((entry) =>
        native.jsx(ExactUiMountComponent, { entry, context }, entry.extId + ":" + point),
      );
  }

  function exactActionVisible(entry, context) {
    try {
      return entry.definition.isVisible?.(context) !== false;
    } catch (error) {
      warn("composer action visibility failed", error);
      return false;
    }
  }

  function exactActionDisabled(entry, context) {
    try {
      return entry.definition.isDisabled?.(context) === true;
    } catch (error) {
      warn("composer action disabled state failed", error);
      return true;
    }
  }

  function exactComposerActions(placement, context, wrapFooter) {
    return exactComposerActionRegistrations
      .filter(
        (entry) =>
          entry.definition.placement === placement &&
          exactActionVisible(entry, context),
      )
      .sort((left, right) => (left.definition.order ?? 0) - (right.definition.order ?? 0))
      .map((entry) =>
        native.jsx(
          ExactComposerActionComponent,
          { entry, context, wrapFooter },
          entry.extId + ":" + entry.definition.id,
        ),
      );
  }

  function makeExactUiApi(extId) {
    function transform(collection, callback, name) {
      if (typeof callback !== "function") {
        throw new TypeError(name + " requires a transformer");
      }
      return exactUiRegistration(collection, { extId, transform: callback });
    }
    function registerRich(collection, definition, name, discriminator) {
      if (!definition || typeof definition !== "object") {
        throw new TypeError(name + " requires a definition");
      }
      if (typeof definition.id !== "string" || definition.id.length === 0) {
        throw new TypeError(name + " requires an id");
      }
      if (
        discriminator !== null &&
        (typeof definition[discriminator] !== "string" ||
          definition[discriminator].length === 0)
      ) {
        throw new TypeError(name + " requires " + discriminator);
      }
      if (typeof definition.provider !== "function") {
        throw new TypeError(name + " requires a provider");
      }
      if (
        definition.matches !== undefined &&
        typeof definition.matches !== "function"
      ) {
        throw new TypeError(name + " matches must be a function");
      }
      return exactRichRegistration(collection, { extId, ...definition });
    }
    return Object.freeze({
      transformSuggestions(callback) {
        return transform(exactUiTransformers.suggestions, callback, "transformSuggestions");
      },
      transformAnnouncements(callback) {
        return transform(exactUiTransformers.announcements, callback, "transformAnnouncements");
      },
      transformSidebarDestinations(callback) {
        return transform(
          exactUiTransformers.sidebarDestinations,
          callback,
          "transformSidebarDestinations",
        );
      },
      transformProductModeMenu(callback) {
        return transform(
          exactUiTransformers.productModeMenu,
          callback,
          "transformProductModeMenu",
        );
      },
      registerRender(point, provider) {
        if (typeof point !== "string" || typeof provider !== "function") {
          throw new TypeError("registerRender requires a point and provider");
        }
        return exactUiRegistration(exactUiRenderRegistrations, {
          extId,
          point,
          provider,
        });
      },
      registerComposerAction(definition) {
        if (!definition || typeof definition !== "object") {
          throw new TypeError("registerComposerAction requires a definition");
        }
        return exactUiRegistration(exactComposerActionRegistrations, {
          extId,
          definition,
        });
      },
      registerAssistantDirective(definition) {
        return registerRich(
          exactRichContentRegistrations.assistantDirective,
          definition,
          "registerAssistantDirective",
          "name",
        );
      },
      registerAssistantContentReference(definition) {
        return registerRich(
          exactRichContentRegistrations.assistantContentReference,
          definition,
          "registerAssistantContentReference",
          "type",
        );
      },
      registerAssistantCodeBlock(definition) {
        return registerRich(
          exactRichContentRegistrations.assistantCodeBlock,
          definition,
          "registerAssistantCodeBlock",
          null,
        );
      },
      registerConversationItem(definition) {
        return registerRich(
          exactRichContentRegistrations.conversationItem,
          definition,
          "registerConversationItem",
          "type",
        );
      },
    });
  }

`;

const exactUiHookSource = String.raw`    const exactAssistantMarkdownContext =
      React.createContext(null);
    const exactAssistantThreadContext = React.createContext(null);
    const exactAssistantDirectiveComponents = new Map();

    function exactAssistantDirectiveComponent(name) {
      let Component = exactAssistantDirectiveComponents.get(name);
      if (Component) return Component;
      Component = function ExactRegisteredAssistantDirective(directiveProps) {
        const markdownProps = React.useContext(exactAssistantMarkdownContext);
        const firstParty = markdownProps?.directives?.[name];
        return originalJsx(ExactAssistantDirective, {
          name,
          markdownProps: markdownProps ?? directiveProps,
          directiveProps,
          firstParty,
        });
      };
      exactAssistantDirectiveComponents.set(name, Component);
      return Component;
    }

    function ExactUiMount({ entry, context }) {
      const hostRef = React.useRef(null);
      React.useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        let provided;
        let view;
        try {
          provided = entry.provider(context);
          view = provided?.view?.();
          if (view instanceof HTMLElement) host.append(view);
        } catch (error) {
          warn("extension render mount failed", error);
        }
        return () => {
          try {
            provided?.dispose?.();
          } catch (error) {
            warn("extension render disposal failed", error);
          }
          view?.remove?.();
        };
      }, [entry, context.ownerId, exactUiVersion]);
      return originalJsx("span", {
        ref: hostRef,
        className: "inline-flex h-full items-center",
        "data-cgptx-render-point": entry.point,
        "data-cgptx-extension": entry.extId,
      });
    }

    function ExactRichContentMount({ entry, context, fallback, kind, revision }) {
      const hostRef = React.useRef(null);
      const contextKey = JSON.stringify(context);
      const mountKey =
        entry.extId + ":" + entry.id + ":" + contextKey + ":" + revision;
      const [failureKey, setFailureKey] = React.useState(null);
      React.useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host || failureKey === mountKey) return undefined;
        let provided;
        let mounted = false;
        try {
          provided = entry.provider(context, host);
          mounted = true;
          exactRichLifecycle.mounts[kind] += 1;
        } catch (error) {
          recordExactRichFallback(kind, "rendererError", context);
          warn(kind + " renderer from " + entry.extId + " failed", error);
          host.replaceChildren();
          setFailureKey(mountKey);
        }
        return () => {
          if (mounted) exactRichLifecycle.disposals[kind] += 1;
          try {
            provided?.dispose?.();
          } catch (error) {
            warn(kind + " renderer disposal from " + entry.extId + " failed", error);
          }
          host.replaceChildren();
        };
      }, [entry, contextKey, revision, failureKey, mountKey]);
      if (failureKey === mountKey) return fallback;
      return originalJsx("div", {
        ref: hostRef,
        "data-cgptx-rich-content": kind,
        "data-cgptx-extension": entry.extId,
      });
    }

    function ExactRichContentBoundary({ kind, context, fallback }) {
      React.useSyncExternalStore(
        subscribeExactUi,
        () => exactUiVersion,
        () => exactUiVersion,
      );
      const entry = exactRichEntry(kind, context);
      const revision = entry == null
        ? "0:0"
        : exactRichRevision(entry, context.ownerId);
      return entry == null
        ? fallback
        : originalJsx(ExactRichContentMount, {
            entry,
            context,
            fallback,
            kind,
            revision,
          }, entry.extId + ":" + entry.id + ":" + context.ownerId);
    }

    function exactAssistantContext(
      props,
      ownerId,
      turnContext,
      threadIdentity,
    ) {
      const conversationId =
        typeof turnContext?.conversationId === "string" &&
        turnContext.conversationId.length > 0
          ? turnContext.conversationId
          : typeof props?.conversationId === "string" &&
              props.conversationId.length > 0
            ? props.conversationId
            : null;
      if (conversationId === null || threadIdentity === null) return null;
      const scope = threadIdentity?.scope;
      if (
        scope !== "execution" &&
        scope !== "cloud"
      ) return null;
      if (
        scope === "execution" &&
        (typeof threadIdentity.hostId !== "string" ||
          threadIdentity.hostId.length === 0)
      ) return null;
      if (
        scope === "cloud" &&
        (typeof threadIdentity.accountId !== "string" ||
          threadIdentity.accountId.length === 0)
      ) return null;
      return exactOwnerContext(ownerId, {
        scope,
        conversationId,
        ...(scope === "cloud"
          ? {
              accountId: threadIdentity.accountId,
              ...(typeof threadIdentity.workspaceId === "string" &&
              threadIdentity.workspaceId.length > 0
                ? { workspaceId: threadIdentity.workspaceId }
                : {}),
            }
          : {}),
        ...(typeof turnContext?.messageId === "string"
          ? { messageId: turnContext.messageId }
          : {}),
        ...(typeof turnContext?.turnId === "string"
          ? { turnId: turnContext.turnId }
          : typeof props?.turnId === "string"
            ? { turnId: props.turnId }
            : {}),
        ...(scope === "execution"
          ? { hostId: threadIdentity.hostId }
          : typeof turnContext?.hostId === "string"
            ? { hostId: turnContext.hostId }
            : typeof props?.hostId === "string"
              ? { hostId: props.hostId }
              : {}),
        streaming:
          turnContext?.isStreaming === true || props?.isStreaming === true,
      });
    }

    function exactDirectiveAttributes(value) {
      const output = {};
      if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
          if (typeof item === "string") output[key] = item;
          else if (typeof item === "number" || typeof item === "boolean") {
            output[key] = String(item);
          }
        }
      }
      return Object.freeze(output);
    }

    function ExactAssistantDirective({
      name,
      markdownProps,
      directiveProps,
      firstParty,
    }) {
      exactRichOwnerHits.assistantDirective += 1;
      const turnContext = native.useCurrentTurnContext();
      const threadIdentity = React.useContext(exactAssistantThreadContext);
      const attributes = exactDirectiveAttributes(directiveProps?.attributes);
      const isContainer = directiveProps?.children !== undefined;
      const content = isContainer
        ? typeof directiveProps?.rawText === "string"
          ? directiveProps.rawText
          : typeof directiveProps?.children === "string"
            ? directiveProps.children
            : undefined
        : undefined;
      const directiveId =
        typeof directiveProps?.directiveId === "string"
          ? directiveProps.directiveId
          : undefined;
      const ownerId = [
        "assistant-directive",
        turnContext?.conversationId ?? markdownProps?.conversationId ?? "unknown",
        turnContext?.turnId ?? markdownProps?.turnId ?? "unknown",
        directiveId ?? [name, JSON.stringify(attributes)].join(":"),
      ].join(":");
      const fallback =
        typeof firstParty === "function"
          ? originalJsx(firstParty, directiveProps)
          : null;
      const assistantContext = exactAssistantContext(
        markdownProps,
        ownerId,
        turnContext,
        threadIdentity,
      );
      if (assistantContext === null) return fallback;
      const context = Object.freeze({
        ...assistantContext,
        directive: Object.freeze({
          name,
          kind: isContainer ? "container" : "leaf",
          attributes,
          ...(directiveId === undefined ? {} : { directiveId }),
          terminalInline: directiveProps?.isTerminalInline === true,
          ...(content === undefined ? {} : { content }),
        }),
      });
      return originalJsx(ExactRichContentBoundaryComponent, {
        kind: "assistantDirective",
        context,
        fallback,
      });
    }

    function ExactContentReferenceDirective({
      markdownProps,
      directiveProps,
      firstParty,
    }) {
      const inheritedMarkdownProps = React.useContext(
        exactAssistantMarkdownContext,
      );
      markdownProps = inheritedMarkdownProps ?? markdownProps;
      const turnContext = native.useCurrentTurnContext();
      const threadIdentity = React.useContext(exactAssistantThreadContext);
      const index = native.contentReferenceIndex(directiveProps?.attributes);
      const reference =
        Number.isInteger(index) && index >= 0
          ? turnContext?.contentReferences?.[index]
          : undefined;
      const fallback =
        typeof firstParty === "function"
          ? originalJsx(firstParty, directiveProps)
          : null;
      if (!reference || typeof reference !== "object") return fallback;
      exactRichOwnerHits.assistantContentReference += 1;
      const type =
        typeof reference.type === "string"
          ? reference.type
          : typeof reference.kind === "string"
            ? reference.kind
            : "unknown";
      const ownerId = [
        "assistant-content-reference",
        turnContext?.conversationId ?? markdownProps?.conversationId ?? "unknown",
        turnContext?.turnId ?? markdownProps?.turnId ?? "unknown",
        turnContext?.contentReferenceMessageIds?.[index] ??
          turnContext?.messageId ??
          "unknown",
        String(index),
        type,
      ].join(":");
      const referenceMessageId =
        typeof turnContext?.contentReferenceMessageIds?.[index] === "string"
          ? turnContext.contentReferenceMessageIds[index]
          : typeof turnContext?.messageId === "string"
            ? turnContext.messageId
            : undefined;
      const assistantContext = exactAssistantContext(
        markdownProps,
        ownerId,
        turnContext,
        threadIdentity,
      );
      if (assistantContext === null) return fallback;
      const context = Object.freeze({
        ...assistantContext,
        ...(referenceMessageId === undefined
          ? {}
          : { messageId: referenceMessageId }),
        reference: Object.freeze({
          type,
          data: exactJsonSnapshot(reference) ?? Object.freeze({}),
        }),
        index,
        terminalInline: directiveProps?.isTerminalInline === true,
      });
      return originalJsx(ExactRichContentBoundaryComponent, {
        kind: "assistantContentReference",
        context,
        fallback,
      });
    }

    function ExactAssistantMarkdownBoundary({ type, props, elementKey }) {
      React.useSyncExternalStore(
        subscribeExactUi,
        () => exactUiVersion,
        () => exactUiVersion,
      );
      exactRichOwnerHits.assistantMarkdown += 1;
      const firstPartyDirectives = props.directives ?? {};
      const directives = { ...firstPartyDirectives };
      const names = new Set(
        exactRichContentRegistrations.assistantDirective.map((entry) => entry.name),
      );
      for (const name of names) {
        directives[name] = exactAssistantDirectiveComponent(name);
      }
      return originalJsx(exactAssistantMarkdownContext.Provider, {
        value: props,
        children: originalJsx(type, { ...props, directives }, elementKey),
      }, elementKey);
    }

    function isExactContentReferenceDirective(type, props) {
      if (
        exactRichContentRegistrations.assistantContentReference.length === 0 ||
        typeof type !== "function" ||
        props?.name !== native.contentReferenceDirectiveName ||
        !props.attributes ||
        typeof props.attributes !== "object" ||
        typeof props.isTerminalInline !== "boolean"
      ) {
        return false;
      }
      const source = Function.prototype.toString.call(type);
      return (
        source.includes("contentReferences") &&
        source.includes("isTerminalInline") &&
        source.includes("turnContext")
      );
    }

    function ExactAssistantCodeBlockBoundary({ type, props, elementKey }) {
      exactRichOwnerHits.assistantCodeBlock += 1;
      const turnContext = native.useCurrentTurnContext();
      const threadIdentity = React.useContext(exactAssistantThreadContext);
      const language =
        typeof props.language === "string" ? props.language : undefined;
      const index = Number.isInteger(props.codeBlockIndex)
        ? props.codeBlockIndex
        : 0;
      const ownerId = [
        "assistant-code-block",
        turnContext?.conversationId ?? "unknown",
        turnContext?.turnId ?? "unknown",
        String(index),
        language ?? "",
      ].join(":");
      const fallback = originalJsx(type, props, elementKey);
      const assistantContext = exactAssistantContext(
        props,
        ownerId,
        turnContext,
        threadIdentity,
      );
      if (assistantContext === null) return fallback;
      const context = Object.freeze({
        ...assistantContext,
        codeBlock: Object.freeze({
          index,
          ...(language === undefined ? {} : { language }),
          content: typeof props.content === "string" ? props.content : "",
          fenceOpen: props.isCodeFenceOpen === true,
          ...(typeof props.codeBlockInfo === "string"
            ? { info: props.codeBlockInfo }
            : {}),
        }),
      });
      return originalJsx(ExactRichContentBoundaryComponent, {
        kind: "assistantCodeBlock",
        context,
        fallback,
      });
    }

    function exactCloudAccountIdentity(accountState) {
      const accountId =
        typeof accountState?.authenticatedAccountId === "string" &&
        accountState.authenticatedAccountId.length > 0
          ? accountState.authenticatedAccountId
          : typeof accountState?.accountId === "string" &&
              accountState.accountId.length > 0
            ? accountState.accountId
            : undefined;
      if (accountId === undefined) return null;
      const selectedAccountId = accountState?.accountId;
      const workspaceId =
        accountState?.accountStructure === "workspace" &&
        typeof selectedAccountId === "string" &&
        selectedAccountId.length > 0 &&
        selectedAccountId !== accountId
          ? selectedAccountId
          : undefined;
      return Object.freeze({
        accountId,
        ...(workspaceId === undefined ? {} : { workspaceId }),
      });
    }

    function exactConversationItemContext(props, ownerKind, cloudIdentity) {
      const rawItem = props?.item;
      const itemType =
        typeof rawItem?.type === "string" ? rawItem.type : "unknown";
      const conversationId =
        typeof props?.conversationId === "string"
          ? props.conversationId
          : "unknown";
      const turnId =
        typeof props?.turnId === "string"
          ? props.turnId
          : typeof rawItem?.turnId === "string"
            ? rawItem.turnId
            : undefined;
      const itemId =
        typeof rawItem?.id === "string"
          ? rawItem.id
          : itemType + ":" + (props?.index ?? 0);
      return exactOwnerContext(
        [ownerKind, conversationId, turnId ?? "unknown", itemId].join(":"),
        {
          conversationId,
          ...(turnId === undefined ? {} : { turnId }),
          ...(typeof props?.hostId === "string" ? { hostId: props.hostId } : {}),
          scope: ownerKind === "cloud" ? "cloud" : "execution",
          ...(cloudIdentity ?? {}),
          item: exactJsonSnapshot(rawItem) ?? Object.freeze({}),
          itemType,
          itemLayout:
            Array.isArray(props?.items) && props.items.length > 1
              ? "grouped"
              : "standalone",
        },
      );
    }

    function ExactConversationItemBoundary({
      type,
      props,
      elementKey,
      ownerKind,
      cloudIdentity = null,
    }) {
      if (ownerKind === "local") exactRichOwnerHits.localConversationItem += 1;
      else exactRichOwnerHits.cloudConversationItem += 1;
      const context = exactConversationItemContext(
        props,
        ownerKind,
        cloudIdentity,
      );
      const content = originalJsx(ExactRichContentBoundaryComponent, {
        kind: "conversationItem",
        context,
        fallback: originalJsx(type, props, elementKey),
      });
      const threadIdentity = ownerKind === "cloud"
        ? cloudIdentity
          ? Object.freeze({ scope: "cloud", ...cloudIdentity })
          : null
        : typeof props?.hostId === "string" && props.hostId.length > 0
          ? Object.freeze({ scope: "execution", hostId: props.hostId })
          : null;
      return threadIdentity === null
        ? content
        : originalJsx(exactAssistantThreadContext.Provider, {
            value: threadIdentity,
            children: content,
          });
    }

    function ExactCloudConversationItemBoundary({ type, props, elementKey }) {
      const accountState = native.useScopeValue(native.accountState);
      const cloudIdentity = exactCloudAccountIdentity(accountState);
      if (cloudIdentity === null) return originalJsx(type, props, elementKey);
      return originalJsx(ExactConversationItemBoundary, {
        type,
        props,
        elementKey,
        ownerKind: "cloud",
        cloudIdentity,
      }, elementKey);
    }

    function isExactCloudConversationItemOwner(type, props) {
      if (
        exactCloudConversationItemOwnerDrift ||
        typeof type !== "function" ||
        !props ||
        typeof props !== "object" ||
        !Object.hasOwn(props, "item") ||
        !Object.hasOwn(props, "items") ||
        !Object.hasOwn(props, "index") ||
        !Object.hasOwn(props, "conversationId") ||
        !Object.hasOwn(props, "hostId") ||
        !Object.hasOwn(props, "turnId")
      ) {
        return false;
      }
      const source = Function.prototype.toString.call(type);
      if (
        !source.includes("chatgpt-hosted-widget") ||
        !source.includes("chatgpt-tool-approval") ||
        !source.includes("chatgpt-subagent-activity") ||
        !source.includes("chatgpt-automation-list")
      ) {
        return false;
      }
      if (exactCloudConversationItemOwner == null) {
        exactCloudConversationItemOwner = type;
      } else if (exactCloudConversationItemOwner !== type) {
        exactCloudConversationItemOwnerDrift = true;
        warn("multiple cloud conversation-item owners matched the exact binding");
        return false;
      }
      return true;
    }

    function ExactRichContentProbe() {
      const probeConversationId = "chatgptx-rich-probe";
      const probeTurnId = "chatgptx-rich-probe-turn";
      const codeFence = String.fromCharCode(96).repeat(3);
      const probeDirectiveFallbacks = Object.freeze({
        "chatgptx-probe-directive-unregistered": () => originalJsx("span", {
          "data-cgptx-rich-first-party-directive": "unregistered",
          children: "Rich probe directive unregistered first-party fallback",
        }),
        "chatgptx-probe-directive-fallback": () => originalJsx("span", {
          "data-cgptx-rich-first-party-directive": "rendererError",
          children: "Rich probe directive rendererError first-party fallback",
        }),
      });
      const turnContext = Object.freeze({
        conversationId: probeConversationId,
        turnId: probeTurnId,
        hostId: "local",
        isStreaming: false,
        messageId: "chatgptx-rich-probe-turn-message",
        contentReferences: Object.freeze([
          Object.freeze({
            type: "chatgptx-probe",
            token: "reference",
            nested: Object.freeze({ value: 42 }),
            values: Object.freeze([Object.freeze({ label: "deep" })]),
          }),
          Object.freeze({
            type: "title_citation",
            description:
              "Rich probe content reference nonMatch first-party fallback chatgptx-fallback:nonMatch",
          }),
          Object.freeze({
            type: "title_citation",
            description:
              "Rich probe content reference matcherError first-party fallback chatgptx-fallback:matcherError",
          }),
          Object.freeze({
            type: "title_citation",
            description:
              "Rich probe content reference rendererError first-party fallback chatgptx-fallback:rendererError",
          }),
        ]),
        contentReferenceMessageIds: Object.freeze([
          "chatgptx-rich-probe-reference-message",
          "chatgptx-rich-probe-reference-non-match",
          "chatgptx-rich-probe-reference-matcher-error",
          "chatgptx-rich-probe-reference-renderer-error",
        ]),
      });
      const cloudItem = Object.freeze({
        id: "chatgptx-rich-probe-cloud-item",
        type: "chatgptx-probe",
        token: "cloud-item",
        nested: Object.freeze({ value: 84 }),
        values: Object.freeze([Object.freeze({ label: "cloud-deep" })]),
        status: "complete",
      });
      const cloudFallbackItems = Object.freeze([
        Object.freeze({
          id: "chatgptx-rich-probe-cloud-item-non-match",
          messageId: "chatgptx-rich-probe-cloud-item-non-match",
          type: "assistant-message",
          content:
            "Rich probe cloud conversation item nonMatch first-party fallback chatgptx-fallback:nonMatch",
          completed: true,
          sentAtMs: null,
          contentReferences: Object.freeze([]),
          contentReferenceMessageIds: Object.freeze([]),
          sourcesFooterReferences: Object.freeze([]),
        }),
        Object.freeze({
          id: "chatgptx-rich-probe-cloud-item-matcher-error",
          messageId: "chatgptx-rich-probe-cloud-item-matcher-error",
          type: "assistant-message",
          content:
            "Rich probe cloud conversation item matcherError first-party fallback chatgptx-fallback:matcherError",
          completed: true,
          sentAtMs: null,
          contentReferences: Object.freeze([]),
          contentReferenceMessageIds: Object.freeze([]),
          sourcesFooterReferences: Object.freeze([]),
        }),
        Object.freeze({
          id: "chatgptx-rich-probe-cloud-item-renderer-error",
          messageId: "chatgptx-rich-probe-cloud-item-renderer-error",
          type: "assistant-message",
          content:
            "Rich probe cloud conversation item rendererError first-party fallback chatgptx-fallback:rendererError",
          completed: true,
          sentAtMs: null,
          contentReferences: Object.freeze([]),
          contentReferenceMessageIds: Object.freeze([]),
          sourcesFooterReferences: Object.freeze([]),
        }),
      ]);
      const cloudTurn = Object.freeze({
        artifacts: Object.freeze({
          editedFilePaths: Object.freeze([]),
          outputFilePaths: Object.freeze([]),
          referencedFilePaths: Object.freeze([]),
        }),
        collaborationMode: null,
        cwd: null,
        hasModelWrittenDil: false,
        items: Object.freeze([cloudItem]),
        status: "complete",
      });
      const cloudFallbackTurn = Object.freeze({
        artifacts: Object.freeze({
          editedFilePaths: Object.freeze([]),
          outputFilePaths: Object.freeze([]),
          referencedFilePaths: Object.freeze([]),
        }),
        collaborationMode: null,
        cwd: null,
        hasModelWrittenDil: false,
        items: cloudFallbackItems,
        status: "complete",
      });
      return originalJsxs("div", {
        "aria-label": "ChatGPTX rich content probe",
        style: {
          position: "fixed",
          zIndex: 2147483647,
          inset: "80px 80px auto auto",
          width: "360px",
          padding: "16px",
          borderRadius: "12px",
          background: "var(--main-surface-primary, white)",
          boxShadow: "0 12px 40px rgba(0,0,0,.24)",
        },
        children: [
          originalJsx(native.TurnContext.Provider, {
            value: turnContext,
            children: originalJsx(exactAssistantThreadContext.Provider, {
              value: Object.freeze({
                scope: "execution",
                hostId: "local",
              }),
              children: originalJsxs(React.Fragment, {
                children: [
                originalJsx(ExactAssistantDirective, {
                  name: "chatgptx-probe",
                  markdownProps: {
                    conversationId: probeConversationId,
                    turnId: probeTurnId,
                    hostId: "local",
                    isStreaming: false,
                  },
                  directiveProps: {
                    attributes: { token: "directive" },
                    directiveId: "chatgptx-rich-probe-directive:0",
                    isTerminalInline: true,
                  },
                  firstParty: null,
                }),
                originalJsx(ExactAssistantDirective, {
                  name: "chatgptx-probe",
                  markdownProps: {
                    conversationId: probeConversationId,
                    turnId: probeTurnId,
                    hostId: "local",
                    isStreaming: false,
                  },
                  directiveProps: {
                    attributes: { token: "directive-container" },
                    rawText: "Container directive content",
                    children: "Container directive content",
                    directiveId:
                      "chatgptx-rich-probe-directive-container:0",
                    isTerminalInline: false,
                  },
                  firstParty: null,
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  directives: probeDirectiveFallbacks,
                  children:
                    ':chatgptx-probe-directive-unregistered{outcome="unregistered"}',
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  directives: probeDirectiveFallbacks,
                  children:
                    ':chatgptx-probe-directive-fallback{outcome="rendererError"}',
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  children:
                    ":" + native.contentReferenceDirectiveName + '{index="0"}',
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  children:
                    ":" + native.contentReferenceDirectiveName + '{index="1"}',
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  children:
                    ":" + native.contentReferenceDirectiveName + '{index="2"}',
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  children:
                    ":" + native.contentReferenceDirectiveName + '{index="3"}',
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  children:
                    codeFence +
                    'chatgptx-probe\n{"token":"code"}\n' +
                    codeFence,
                }),
                originalJsx(ExactAssistantCodeBlockBoundary, {
                  type: native.ChatGptCodeBlock,
                  props: {
                    conversationId: probeConversationId,
                    turnId: probeTurnId,
                    hostId: "local",
                    isStreaming: true,
                    codeBlockIndex: 1,
                    language: "chatgptx-probe",
                    content: '{"token":"streaming"}',
                    isCodeFenceOpen: true,
                    codeBlockInfo: "chatgptx-probe",
                  },
                  elementKey: "chatgptx-rich-probe-streaming-code",
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  children:
                    codeFence +
                    "text\nRich probe code block nonMatch first-party fallback\n" +
                    "chatgptx-fallback:nonMatch\n" +
                    codeFence,
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  children:
                    codeFence +
                    "text\nRich probe code block matcherError first-party fallback\n" +
                    "chatgptx-fallback:matcherError\n" +
                    codeFence,
                }),
                native.jsxRuntime.jsx(native.ChatGptMarkdownView, {
                  conversationId: probeConversationId,
                  turnId: probeTurnId,
                  hostId: "local",
                  isStreaming: false,
                  textStyle: { kind: "assistant-message" },
                  children:
                    codeFence +
                    "text\nRich probe code block rendererError first-party fallback\n" +
                    "chatgptx-fallback:rendererError\n" +
                    codeFence,
                }),
                ],
              }),
            }),
          }),
          native.jsxRuntime.jsx(native.LocalConversationItem, {
            conversationId: probeConversationId,
            turnId: probeTurnId,
            hostId: "local",
            index: 0,
            items: [],
            item: {
              id: "chatgptx-rich-probe-item",
              type: "chatgptx-probe",
              token: "item",
              nested: { value: 42 },
              values: [{ label: "deep" }],
              status: "complete",
            },
          }),
          native.jsxRuntime.jsx(native.LocalConversationItem, {
            conversationId: probeConversationId,
            turnId: probeTurnId,
            hostId: "local",
            index: 1,
            items: [
              {
                id: "chatgptx-rich-probe-grouped-item",
                type: "chatgptx-probe",
                token: "grouped-item",
                status: "complete",
              },
              {
                id: "chatgptx-rich-probe-grouped-sibling",
                type: "chatgptx-probe-sibling",
                status: "complete",
              },
            ],
            item: {
              id: "chatgptx-rich-probe-grouped-item",
              type: "chatgptx-probe",
              token: "grouped-item",
              status: "complete",
            },
          }),
          native.jsxRuntime.jsx(native.LocalConversationItem, {
            conversationId: probeConversationId,
            turnId: probeTurnId,
            hostId: "local",
            index: 1,
            items: [],
            item: {
              id: "chatgptx-rich-probe-item-non-match",
              type: "assistant-message",
              content:
                "Rich probe local conversation item nonMatch first-party fallback chatgptx-fallback:nonMatch",
              completed: true,
              sentAtMs: null,
              responseAnnotations: [],
              automationCitations: [],
            },
          }),
          native.jsxRuntime.jsx(native.LocalConversationItem, {
            conversationId: probeConversationId,
            turnId: probeTurnId,
            hostId: "local",
            index: 2,
            items: [],
            item: {
              id: "chatgptx-rich-probe-item-matcher-error",
              type: "assistant-message",
              content:
                "Rich probe local conversation item matcherError first-party fallback chatgptx-fallback:matcherError",
              completed: true,
              sentAtMs: null,
              responseAnnotations: [],
              automationCitations: [],
            },
          }),
          native.jsxRuntime.jsx(native.LocalConversationItem, {
            conversationId: probeConversationId,
            turnId: probeTurnId,
            hostId: "local",
            index: 3,
            items: [],
            item: {
              id: "chatgptx-rich-probe-item-renderer-error",
              type: "assistant-message",
              content:
                "Rich probe local conversation item rendererError first-party fallback chatgptx-fallback:rendererError",
              completed: true,
              sentAtMs: null,
              responseAnnotations: [],
              automationCitations: [],
            },
          }),
          native.jsxRuntime.jsx(native.CloudConversationTurn, {
            browserConversationId: "chatgptx-rich-probe-cloud",
            conversationId: "chatgptx-rich-probe-cloud",
            hostId: "cloud",
            isMostRecentTurn: false,
            isTemporaryChat: false,
            isParagen: false,
            isWorkConversation: false,
            feedbackEnabled: false,
            readAloudEnabled: false,
            renderMcpApps: false,
            promptSharingEnabled: false,
            trackShownImpressions: false,
            turn: cloudTurn,
            turnId: "chatgptx-rich-probe-cloud-turn",
          }),
          native.jsxRuntime.jsx(native.CloudConversationTurn, {
            browserConversationId: "chatgptx-rich-probe-cloud-fallback",
            conversationId: "chatgptx-rich-probe-cloud-fallback",
            hostId: "cloud",
            isMostRecentTurn: false,
            isTemporaryChat: false,
            isParagen: false,
            isWorkConversation: false,
            feedbackEnabled: false,
            readAloudEnabled: false,
            renderMcpApps: false,
            promptSharingEnabled: false,
            trackShownImpressions: false,
            turn: cloudFallbackTurn,
            turnId: "chatgptx-rich-probe-cloud-fallback-turn",
          }),
        ],
      });
    }

    function ExactRichContentProbePortal() {
      if (!exactRichProbeRequested || !exactRichProbeContainer) return null;
      return native.ReactDOMPortal.createPortal(
        originalJsx(ExactRichContentProbe, {}),
        exactRichProbeContainer,
      );
    }

    mountExactRichContentProbe = () => {
      if (exactRichProbeRequested) return true;
      const container = document.createElement("div");
      container.dataset.cgptxRichProbeRoot = "true";
      document.body.append(container);
      exactRichProbeContainer = container;
      exactRichProbeRequested = true;
      emitExactUiChange();
      return true;
    };
    unmountExactRichContentProbe = () => {
      if (!exactRichProbeRequested && !exactRichProbeContainer) return true;
      exactRichProbeRequested = false;
      emitExactUiChange();
      const container = exactRichProbeContainer;
      exactRichProbeContainer = null;
      let observer;
      const removeEmptyContainer = () => {
        if (!container?.isConnected) {
          observer?.disconnect();
          return;
        }
        if (!container.hasChildNodes()) {
          observer?.disconnect();
          container.remove();
        }
      };
      observer = new MutationObserver(removeEmptyContainer);
      observer.observe(container, { childList: true });
      removeEmptyContainer();
      return true;
    };

    let exactProductReactionResult = null;

    function ExactProductReactionProbe() {
      const selectedText = "ChatGPTX product reaction probe selection";
      const [creating, setCreating] = React.useState(false);
      const [persisted, setPersisted] = React.useState(null);
      const modelRef = React.useRef(null);
      if (modelRef.current === null) {
        const model = {
          activePageIds: { above: null, below: null },
          activatingLeaf: false,
          context: null,
          builtInCache: Object.freeze([]),
          builtInViews: new Map(),
          actionType: native.NativeButton,
        };
        model.context = Object.freeze({
          selectedText,
          createResponseAnnotation(annotation, options) {
            return createAssistantResponseAnnotation(model, annotation, options);
          },
        });
        model.builtInCache = Object.freeze([
          Object.freeze({
            kind: "action",
            id: "selectedTextOverlay.addToCodex",
            label: "Add to chat",
            placement: "above",
            origin: "app",
            onClick: () => setCreating(true),
          }),
        ]);
        modelRef.current = model;
      }
      const model = modelRef.current;
      React.useLayoutEffect(() => {
        activeAssistantSelectionModel = model;
        return () => {
          if (activeAssistantSelectionModel === model) {
            activeAssistantSelectionModel = null;
          }
        };
      }, [model]);
      const reactionItems = computeEffectiveAssistantSelectionItems(model).filter(
        (item) => item.origin === "reactions",
      );
      const tree = originalJsx("div", {
        "data-cgptx-product-reaction-owner": "",
        children: [],
      });
      const persist = (annotationId, annotation, submit) => {
        exactProductReactionResult = Object.freeze({
          annotationId,
          annotation,
          selectedText,
          submit,
        });
        setPersisted(annotation);
      };
      const layerProps = {
        annotations: Object.freeze([
          Object.freeze({
            id: "chatgptx-product-reaction-annotation",
            text: selectedText,
          }),
        ]),
        editingAnnotation: Object.freeze({
          mode: "create",
          id: "chatgptx-product-reaction-annotation",
        }),
        onDirectSubmit: (annotationId, annotation) =>
          persist(annotationId, annotation, true),
        onDiscardAnnotation() {},
        onEditingAnnotationChange() {},
        onRemoveAnnotation() {},
        onUpdateAnnotation: (annotationId, annotation) =>
          persist(annotationId, annotation, false),
      };
      return originalJsxs(React.Fragment, {
        children: [
          renderAssistantSelectionMenu(tree, model, reactionItems),
          creating
            ? originalJsx(ResponseAnnotationCreationBoundary, {
                child: null,
                layerProps,
              })
            : null,
          persisted === null
            ? null
            : originalJsx("span", {
                "data-cgptx-product-reaction-persisted": persisted,
                children: persisted,
              }),
        ],
      });
    }

    runExactProductExtensionProbe = async () => {
      if (
        window.__CGPTX_V5_TEST_MODE__?.productExtensionProbe !== true
      ) {
        throw new Error("The product extension probe is not enabled");
      }
      const previous = document.querySelector(
        "[data-cgptx-product-extension-probe-root]",
      );
      previous?.remove?.();
      exactProductReactionResult = null;

      const probeRoot = document.createElement("div");
      probeRoot.setAttribute("data-cgptx-product-extension-probe-root", "");
      probeRoot.style.display = "none";
      document.body.append(probeRoot);

      const thread = Object.freeze({
        scope: "execution",
        surface: "header",
        hostId: "local",
        threadId: "chatgptx-product-extension-probe",
        title: "ChatGPTX product extension probe",
        mode: "codex",
        location: "local",
        selected: true,
      });
      setCurrentThread(thread);
      const threadModel = {
        context: thread,
        builtInCache: Object.freeze([]),
        builtInViews: new Map(),
        opaqueCache: new Map(),
        opaqueCount: 0,
        opaqueIds: new Set(),
        unboundOpaque: [],
      };
      const menuItems = computeEffectiveThreadItems(threadModel);
      const colorItem = findItemDeep(menuItems, "thread-colors.color");
      const blueItem = findItemDeep(menuItems, "thread-colors.blue");
      const colorActionFound =
        colorItem?.kind === "action" &&
        blueItem?.kind === "action" &&
        typeof blueItem.onClick === "function";
      if (!colorActionFound) {
        probeRoot.remove();
        throw new Error("Thread Colors did not contribute its Color > Blue action");
      }
      blueItem.onClick({ metaKey: false });
      await Promise.resolve();

      const headerProperties = computeHeaderProperties();
      const threadColorRegistration = threadListRegistrations.find(
        (entry) => entry.extId === "thread-colors",
      );
      const sidebarThread = Object.freeze({
        ...thread,
        surface: "sidebar",
      });
      const sidebarItem = threadColorRegistration
        ? normalizeThreadListItem(threadColorRegistration.provider(sidebarThread))
        : undefined;
      const sidebarView = sidebarItem?.view?.();
      if (sidebarView instanceof HTMLElement) probeRoot.append(sidebarView);
      const indicator =
        sidebarView?.firstElementChild instanceof HTMLElement
          ? sidebarView.firstElementChild
          : sidebarView instanceof HTMLElement
            ? sidebarView
            : null;

      const reactionHost = document.createElement("div");
      probeRoot.append(reactionHost);
      const reactionRoot = native.ReactDOM.createRoot(reactionHost);
      reactionRoot.render(originalJsx(ExactProductReactionProbe, {}));
      const wait = () => new Promise((resolve) => setTimeout(resolve, 16));
      const actionDeadline = Date.now() + 10_000;
      let reactionAction;
      while (Date.now() < actionDeadline) {
        reactionAction = reactionHost.querySelector(
          '[data-cgptx-assistant-selection-action]' +
            '[data-cgptx-origin="reactions"]' +
            '[data-cgptx-id="reactions.reaction-1"]',
        );
        if (reactionAction instanceof HTMLElement) break;
        await wait();
      }
      const reactionActionFound = reactionAction instanceof HTMLElement;
      const reactionLabel = reactionAction?.textContent?.trim() ?? null;
      if (reactionActionFound) reactionAction.click();
      const persistenceDeadline = Date.now() + 10_000;
      while (
        exactProductReactionResult === null &&
        Date.now() < persistenceDeadline
      ) {
        await wait();
      }
      const reactionResult = exactProductReactionResult;
      reactionRoot.unmount();
      sidebarView?.remove?.();
      probeRoot.remove();

      return Object.freeze({
        threadColors: Object.freeze({
          thread,
          colorActionFound,
          colorActionClicked: true,
          header: Object.freeze({
            properties: headerProperties,
            backgroundAttribute:
              document.documentElement.hasAttribute(
                "data-cgptx-header-background-color",
              ),
            backgroundStyle: document.documentElement.style.getPropertyValue(
              "--header-background-color",
            ),
          }),
          sidebarRow: Object.freeze({
            registrationFound: threadColorRegistration !== undefined,
            viewFound: sidebarView instanceof HTMLElement,
            indicatorFound: indicator instanceof HTMLElement,
            width: indicator?.style?.width ?? null,
            height: indicator?.style?.height ?? null,
            background: indicator?.style?.backgroundColor ?? null,
          }),
        }),
        reactions: Object.freeze({
          actionFound: reactionActionFound,
          actionClicked: reactionActionFound,
          actionId: reactionAction?.getAttribute?.("data-cgptx-id") ?? null,
          actionOrigin:
            reactionAction?.getAttribute?.("data-cgptx-origin") ?? null,
          label: reactionLabel,
          persisted: reactionResult,
        }),
      });
    };

    runExactProductExtensionRealUiProbe = async () => {
      if (
        window.__CGPTX_V5_TEST_MODE__?.productExtensionRealUiProbe !== true
      ) {
        throw new Error("The real product extension UI probe is not enabled");
      }

      const wait = () => new Promise((resolve) => setTimeout(resolve, 50));
      const waitUntil = async (predicate, label, timeout = 20_000) => {
        const deadline = Date.now() + timeout;
        let value;
        while (Date.now() < deadline) {
          value = predicate();
          if (value) return value;
          await wait();
        }
        const visibleButtonCount = Array.from(
          document.querySelectorAll(
            'button[aria-label], [role="button"][aria-label]',
          ),
        )
          .filter((element) => isVisible(element)).length;
        throw new Error(
          "Timed out waiting for " +
            label +
            "; visible button count: " +
            visibleButtonCount,
        );
      };
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement) || !element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };
      const serializeRect = (element) => {
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        return Object.freeze({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        });
      };
      const visibleButtonWhereLabel = (predicate) => {
        const matches = Array.from(
          document.querySelectorAll(
            'button, [role="button"]',
          ),
        )
          .filter(
            (button) => {
              const ariaLabel = button.getAttribute("aria-label")?.trim();
              const textLabel = button.textContent?.trim();
              return (
                ([ariaLabel, textLabel].some(
                  (candidate) =>
                    typeof candidate === "string" && predicate(candidate),
                )) &&
                isVisible(button)
              );
            },
          )
          .map((button) => button.closest("button") ?? button);
        return (
          matches.find((button) => button.tagName === "BUTTON") ??
          matches[0] ??
          null
        );
      };
      const visibleButtonByLabel = (label) =>
        visibleButtonWhereLabel((candidate) => candidate === label);
      const visibleButtonByLabels = (labels) =>
        labels.map(visibleButtonByLabel).find(Boolean) ?? null;
      const activityEnabledButton = () =>
        visibleButtonByLabels(["Turn off activity view", "Hide activity"]);
      const activityDisabledButton = () =>
        visibleButtonWhereLabel(
          (label) =>
            label === "View activity" ||
            label === "Show activity" ||
            label.startsWith("Show activity,"),
        );
      const activateNativeButton = (button) => {
        button.focus();
        pressTrigger(button);
        for (const type of ["mousedown", "mouseup"]) {
          button.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              button: 0,
            }),
          );
        }
        button.click();
      };
      const visibleThreadRows = () =>
        Array.from(
          document.querySelectorAll(
            "[data-app-action-sidebar-thread-row], " +
              "[data-cgptx-thread-row-owner]",
          ),
        ).filter(isVisible);
      const visibleCloudRows = () =>
        visibleThreadRows().filter(
          (row) => row.getAttribute("data-cgptx-thread-row-scope") === "cloud",
        );
      const visibleExecutionRows = () =>
        visibleThreadRows().filter(
          (row) =>
            typeof row.getAttribute("data-app-action-sidebar-thread-host-id") ===
              "string" &&
            row.getAttribute("data-app-action-sidebar-thread-host-id").length > 0,
        );
      const rawThreadId = (row) => {
        const scoped = row?.getAttribute?.("data-app-action-sidebar-thread-id");
        const separator = scoped?.lastIndexOf(":") ?? -1;
        return separator >= 0 ? scoped.slice(separator + 1) : null;
      };
      const rowForIdentity = (identity) =>
        visibleExecutionRows().find(
          (row) =>
            rawThreadId(row) === identity.threadId &&
            row.getAttribute("data-app-action-sidebar-thread-host-id") ===
              identity.hostId,
        ) ?? null;
      const titleElement = (row) => {
        const trigger = row?.querySelector?.("[data-thread-title-trigger]");
        if (!(trigger instanceof HTMLElement)) return null;
        return (
          trigger.querySelector("[data-thread-title]") ??
          Array.from(trigger.querySelectorAll("span")).find(
            (element) =>
              isVisible(element) &&
              (element.textContent?.trim().length ?? 0) > 0 &&
              !Array.from(element.children).some(
                (child) => child.textContent?.trim() === element.textContent?.trim(),
              ),
          ) ??
          trigger
        );
      };
      const rowLayout = (row, otherRows) => {
        const trigger = row?.querySelector?.("[data-thread-title-trigger]");
        const indicatorElements = Array.from(
          row?.querySelectorAll?.(
            '[data-cgptx-thread-row-slot-positioned="priority-indicator"]',
          ) ?? [],
        );
        const indicatorMount =
          indicatorElements.find(
            (candidate) =>
              candidate.getAttribute?.(
                "data-cgptx-thread-row-slot-positioned",
              ) === "priority-indicator",
          ) ?? indicatorElements[0];
        const indicator =
          indicatorMount?.firstElementChild instanceof HTMLElement
            ? indicatorMount.firstElementChild
            : indicatorMount;
        const title = titleElement(row);
        const uncoloredRow = otherRows.find(
          (candidate) =>
            candidate !== row &&
            candidate.querySelector(
              '[data-cgptx-thread-row-slot-positioned="priority-indicator"]',
            ) === null &&
            titleElement(candidate) instanceof HTMLElement,
        );
        const uncoloredTitle = titleElement(uncoloredRow);
        const rowRect = serializeRect(row);
        const triggerRect = serializeRect(trigger);
        const indicatorRect = serializeRect(indicator);
        const indicatorStyle =
          indicator instanceof HTMLElement ? getComputedStyle(indicator) : null;
        const indicatorMountStyle =
          indicatorMount instanceof HTMLElement
            ? getComputedStyle(indicatorMount)
            : null;
        const indicatorParent = indicator?.parentElement;
        const indicatorParentRect = serializeRect(indicatorParent);
        const titleRect = serializeRect(title);
        const uncoloredTitleRect = serializeRect(uncoloredTitle);
        return Object.freeze({
          rowFound: row instanceof HTMLElement,
          titleTriggerFound: trigger instanceof HTMLElement,
          indicatorFound: indicator instanceof HTMLElement,
          uncoloredRowFound: uncoloredRow instanceof HTMLElement,
          row: rowRect,
          titleTrigger: triggerRect,
          indicator: indicatorRect,
          indicatorParent: indicatorParentRect,
          title: titleRect,
          uncoloredTitle: uncoloredTitleRect,
          indicatorBackground: indicatorStyle?.backgroundColor ?? null,
          indicatorPosition: indicatorMountStyle?.position ?? null,
          indicatorInlinePosition: indicatorMount?.style?.position ?? null,
          indicatorPositioned:
            indicatorMount?.getAttribute?.(
              "data-cgptx-thread-row-slot-positioned",
            ) ?? null,
          indicatorParentTag: indicatorParent?.tagName ?? null,
          indicatorParentClass: indicatorParent?.className ?? null,
          indicatorCount: indicatorElements.length,
          indicators: indicatorElements.map((candidate) => {
            const style = getComputedStyle(candidate);
            return Object.freeze({
              rect: serializeRect(candidate),
              position: style.position,
              inlinePosition: candidate.style?.position ?? null,
              positioned:
                candidate.getAttribute?.(
                  "data-cgptx-thread-row-slot-positioned",
                ) ?? null,
              parentTag: candidate.parentElement?.tagName ?? null,
              parentClass: candidate.parentElement?.className ?? null,
            });
          }),
          indicatorTop: indicatorMountStyle?.top ?? null,
          indicatorBottom: indicatorMountStyle?.bottom ?? null,
          indicatorHeight: indicatorStyle?.height ?? null,
          rowPosition:
            row instanceof HTMLElement ? getComputedStyle(row).position : null,
          indicatorFillsRow:
            indicatorRect !== null &&
            rowRect !== null &&
            Math.abs(indicatorRect.top - rowRect.top) <= 0.5 &&
            Math.abs(indicatorRect.bottom - rowRect.bottom) <= 0.5 &&
            Math.abs(indicatorRect.height - rowRect.height) <= 0.5,
          titleGap:
            indicatorRect !== null && titleRect !== null
              ? titleRect.left - indicatorRect.right
              : null,
          coloredAndUncoloredTitlesAligned:
            titleRect !== null &&
            uncoloredTitleRect !== null &&
            Math.abs(titleRect.left - uncoloredTitleRect.left) <= 0.5,
        });
      };
      const responseTargets = () =>
        Array.from(
          document.querySelectorAll(
            "[data-response-annotation-target]" +
              "[data-response-annotation-conversation]",
          ),
        )
          .filter(
            (element) =>
              isVisible(element) &&
              (element.textContent?.trim().length ?? 0) > 0,
          );
      const responseTarget = (conversationId) =>
        responseTargets()
          .filter(
            (element) =>
              element.getAttribute("data-response-annotation-conversation") ===
              conversationId,
          )
          .at(-1) ?? null;
      const interactiveThreadTarget = (row) =>
        row?.closest?.('button, [role="menuitem"], a, [role="button"]') ??
        row;
      const activateThreadRow = (row) => {
        const target = interactiveThreadTarget(row);
        if (!(target instanceof HTMLElement)) return null;
        target.focus?.();
        target.click();
        return target;
      };

      const initialActivityControl = await waitUntil(
        () => {
          const enabled = activityEnabledButton();
          if (enabled) return { enabled: true, element: enabled };
          const disabled = activityDisabledButton();
          if (disabled) return { enabled: false, element: disabled };
          return null;
        },
        "the native activity control",
      );
      if (initialActivityControl.enabled) {
        activateNativeButton(initialActivityControl.element);
        await waitUntil(
          activityDisabledButton,
          "the native standard thread list",
        );
      }
      const showActivity = await waitUntil(
        activityDisabledButton,
        "the native View activity control",
      );
      activateNativeButton(showActivity);
      await waitUntil(
        activityEnabledButton,
        "the native activity view",
      );
      const fixtureTitlePrefix = "ChatGPT Extensions gate fixture ";
      const activityRows = await waitUntil(
        () => {
          const rows = visibleExecutionRows().filter((row) =>
            row
              .getAttribute("data-app-action-sidebar-thread-title")
              ?.startsWith(fixtureTitlePrefix),
          );
          return rows.length >= 2 && rows;
        },
        "two deterministic native activity thread rows",
      );

      const activityCandidates = activityRows
        .map((row) => ({
          identity: threadListContextFromRow(row),
          initiallySelected:
            row.getAttribute("data-app-action-sidebar-thread-selected") ===
            "true",
        }))
        .filter((candidate) => candidate.identity !== null)
        .sort(
          (left, right) =>
            Number(left.initiallySelected) - Number(right.initiallySelected),
        );
      const selectionDeadline = Date.now() + 45_000;
      let selectedRow = null;
      let selectedIdentity = null;
      const selectionAttempts = [];
      for (let index = 0; index < activityCandidates.length; index += 1) {
        const candidateIdentity = activityCandidates[index].identity;
        const candidate = rowForIdentity(candidateIdentity);
        const attemptsLeft = activityCandidates.length - index;
        const attemptTimeout = Math.max(
          1,
          Math.floor((selectionDeadline - Date.now()) / attemptsLeft),
        );
        const routeBefore = location.href;
        let target = null;
        try {
          if (!(candidate instanceof HTMLElement) || !candidate.isConnected) {
            throw new Error("Activity row was replaced before activation");
          }
          target = activateThreadRow(candidate);
          await waitUntil(
            () => {
              const model = threadModelForId(candidateIdentity.threadId);
              return (
                model &&
                sameThreadIdentity(model.context, candidateIdentity) &&
                currentThread &&
                sameThreadIdentity(currentThread, candidateIdentity) &&
                responseTarget(candidateIdentity.threadId)
              );
            },
            "a native thread with assistant response content",
            attemptTimeout,
          );
          selectionAttempts.push(
            Object.freeze({
              attempt: selectionAttempts.length + 1,
              status: "passed",
              rowTag: candidate?.tagName ?? null,
              targetTag: target?.tagName ?? null,
              targetRole: target?.getAttribute?.("role") ?? null,
              routeChanged: location.href !== routeBefore,
            }),
          );
          selectedRow = rowForIdentity(candidateIdentity);
          selectedIdentity = Object.freeze({
            scope: "execution",
            hostId: candidateIdentity.hostId,
            threadId: candidateIdentity.threadId,
          });
          break;
        } catch (error) {
          selectionAttempts.push(
            Object.freeze({
              attempt: selectionAttempts.length + 1,
              status: "failed",
              errorName:
                typeof error?.name === "string" ? error.name : "Error",
              rowTag: candidate?.tagName ?? null,
              targetTag: target?.tagName ?? null,
              targetRole: target?.getAttribute?.("role") ?? null,
              routeChanged: location.href !== routeBefore,
              selected:
                rowForIdentity(candidateIdentity)?.getAttribute?.(
                  "data-app-action-sidebar-thread-selected",
                ) ?? null,
              currentThreadMatched:
                currentThread !== undefined &&
                sameThreadIdentity(currentThread, candidateIdentity),
              visibleResponseCount: responseTargets().length,
              matchingResponseFound:
                responseTarget(candidateIdentity.threadId) !== null,
            }),
          );
        }
      }
      if (!(selectedRow instanceof HTMLElement) || selectedIdentity === null) {
        throw new Error(
          "No native activity thread row had assistant response content: " +
            JSON.stringify(selectionAttempts),
        );
      }

      const model = await waitUntil(
        () => threadModelForId(selectedIdentity.threadId),
        "the selected native thread menu model",
      );
      const ownerKey = threadMenuModelKey(model.context);
      const trigger = await waitUntil(
        () => {
          const candidate = threadMenuTrigger(ownerKey);
          return isVisible(candidate) && candidate;
        },
        "the selected native thread menu trigger",
      );
      pressTrigger(trigger);
      const menu = await waitUntil(
        () => visibleThreadMenuColumn(ownerKey),
        "the selected native thread menu",
      );
      const colorRow = await waitUntil(
        () => threadRowById(menu, "thread-colors.color"),
        "the Thread Colors action in the native thread menu",
      );
      requestThreadFlyout(colorRow);
      const blueRow = await waitUntil(
        () =>
          Array.from(document.querySelectorAll('[role="menuitem"]')).find(
            (row) =>
              isVisible(row) &&
              (row.getAttribute("data-cgptx-id") === "thread-colors.blue" ||
                fiberPropAbove(row, "data-cgptx-id") === "thread-colors.blue"),
          ) ?? null,
        "the Blue action in the native Color flyout",
      );
      blueRow.click();
      selectedRow = await waitUntil(
        () => {
          const row = rowForIdentity(selectedIdentity);
          return (
            row?.querySelector?.(
              '[data-cgptx-thread-row-slot-positioned="priority-indicator"]',
            ) && row
          );
        },
        "the Thread Colors indicator in the native activity row",
      );

      const appHeader = await waitUntil(
        () => {
          const header = document.querySelector(
            'header[data-pip-obstacle="app-shell-header"]',
          );
          return isVisible(header) && header;
        },
        "the native thread header",
      );
      const headerTitle = Array.from(appHeader.querySelectorAll("*")).find(
        (element) =>
          isVisible(element) &&
          element.textContent?.trim() === model.context.title &&
          !Array.from(element.children).some(
            (child) => child.textContent?.trim() === model.context.title,
          ),
      );
      const blueHeaderRegion = await waitUntil(
        () =>
          [appHeader, ...appHeader.querySelectorAll("div")].find(
            (element) =>
              isVisible(element) &&
              getComputedStyle(element).backgroundColor === "rgb(58, 131, 247)",
          ) ?? null,
        "the blue native thread header region",
      );
      const headerDiagnostics = Object.freeze({
        found: appHeader instanceof HTMLElement,
        titleFound: headerTitle instanceof HTMLElement,
        blueRegionFound: blueHeaderRegion instanceof HTMLElement,
        blueRegion: serializeRect(blueHeaderRegion),
        background: getComputedStyle(blueHeaderRegion).backgroundColor,
      });
      const activityLayout = rowLayout(selectedRow, visibleExecutionRows());

      const hideActivity = await waitUntil(
        activityEnabledButton,
        "the native activity view toggle",
      );
      activateNativeButton(hideActivity);
      await waitUntil(
        activityDisabledButton,
        "the native standard thread list",
      );
      const standardRows = await waitUntil(
        () => visibleExecutionRows().length >= 2 && visibleExecutionRows(),
        "two native standard thread rows",
      );
      selectedRow = await waitUntil(
        () => rowForIdentity(selectedIdentity),
        "the colored thread in the native standard list",
      );
      const standardLayout = rowLayout(selectedRow, standardRows);

      const findCloudOwner = () => {
        for (const candidateModel of threadModels.values()) {
          const context = candidateModel?.context;
          if (
            context?.scope !== "cloud" ||
            context?.surface !== "sidebar" ||
            typeof context.title !== "string" ||
            context.title.length === 0
          ) {
            continue;
          }
          const ownerKey = threadOwnerKey(context);
          const row = visibleCloudRows().find(
            (candidateRow) =>
              candidateRow.getAttribute("data-cgptx-thread-row-owner") ===
              ownerKey,
          );
          if (row) return { model: candidateModel, row };
        }
        return null;
      };
      let cloudOwner;
      try {
        cloudOwner = await waitUntil(
          findCloudOwner,
          "a visible signed-in ChatGPT cloud thread row",
        );
      } catch (error) {
        const modelContexts = Array.from(threadModels.values()).map((model) => ({
          scope: model?.context?.scope ?? null,
          surface: model?.context?.surface ?? null,
          hasAccount: typeof model?.context?.accountId === "string",
          hasWorkspace: typeof model?.context?.workspaceId === "string",
          hasHost: typeof model?.context?.hostId === "string",
          hasTitle:
            typeof model?.context?.title === "string" &&
            model.context.title.length > 0,
        }));
        const ownerScopes = Array.from(
          document.querySelectorAll("[data-cgptx-thread-list-scope]"),
        ).map((owner) => owner.getAttribute("data-cgptx-thread-list-scope"));
        const rowKinds = visibleThreadRows().map((row) => ({
          hasHost:
            (row.getAttribute("data-app-action-sidebar-thread-host-id") ?? "")
              .length > 0,
          kind: row.getAttribute("data-app-action-sidebar-thread-kind") ?? null,
        }));
        throw new Error(
          String(error?.message ?? error) +
            "; cloud owner diagnostics: " +
            JSON.stringify({ modelContexts, ownerScopes, rowKinds }),
        );
      }
      const cloudItems = computeEffectiveThreadItems(cloudOwner.model);
      const cloudColorItem = findItemDeep(cloudItems, "thread-colors.color");
      const cloudBlueItem = findItemDeep(cloudItems, "thread-colors.blue");
      if (
        cloudColorItem?.kind !== "action" ||
        cloudBlueItem?.kind !== "action" ||
        typeof cloudBlueItem.onClick !== "function"
      ) {
        throw new Error(
          "Thread Colors did not contribute Color > Blue for the cloud row",
        );
      }
      cloudBlueItem.onClick({ metaKey: false });
      await Promise.resolve();
      const cloudOwnerKey = threadOwnerKey(cloudOwner.model.context);
      const cloudHost = await waitUntil(
        () =>
          Array.from(
            document.querySelectorAll(
              '[data-cgptx-thread-list-views="priority-indicator"]',
            ),
          ).find(
            (candidate) =>
              candidate.getAttribute("data-cgptx-thread-list-owner") ===
                cloudOwnerKey &&
              candidate.getAttribute("data-cgptx-thread-list-scope") ===
                "cloud",
          ) ?? null,
        "the Thread Colors owner in the cloud row",
      );
      const cloudRow = cloudHost.closest(
        "[data-app-action-sidebar-thread-row], [data-cgptx-thread-row-owner]",
      );
      if (!(cloudRow instanceof HTMLElement) || !isVisible(cloudRow)) {
        throw new Error("The cloud Thread Colors owner has no visible native row");
      }
      const cloudLayout = rowLayout(cloudRow, visibleCloudRows());

      const target = await waitUntil(
        () => responseTarget(selectedIdentity.threadId),
        "a visible native assistant response target",
      );
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (node.parentElement?.closest('button, [contenteditable="true"]')) {
            return NodeFilter.FILTER_REJECT;
          }
          return /\S/.test(node.data)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
      let textNode = null;
      let candidate;
      while ((candidate = walker.nextNode())) {
        const parent = candidate.parentElement;
        if (
          !parent ||
          parent.closest('[aria-hidden="true"]') ||
          getComputedStyle(parent).userSelect === "none"
        ) {
          continue;
        }
        const probe = document.createRange();
        probe.selectNodeContents(candidate);
        if (
          Array.from(probe.getClientRects()).some(
            (rect) => rect.width > 0 && rect.height > 0,
          )
        ) {
          textNode = candidate;
          break;
        }
      }
      if (!textNode) throw new Error("Native assistant response text is missing");
      const selectionStart = textNode.data.search(/\S/);
      const selectionText = textNode.data
        .slice(selectionStart, selectionStart + 32)
        .trimEnd();
      const selectionEnd = selectionStart + selectionText.length;
      const range = document.createRange();
      range.setStart(textNode, selectionStart);
      range.setEnd(textNode, selectionEnd);
      const browserSelection = window.getSelection();
      browserSelection.removeAllRanges();
      browserSelection.addRange(range);
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
      const selectedText = browserSelection.toString();
      if (selectedText.length === 0) {
        throw new Error("The native assistant response selection is empty");
      }

      const reactionAction = await waitUntil(
        () =>
          Array.from(
            document.querySelectorAll(
              '[data-cgptx-assistant-selection-action]' +
                '[data-cgptx-origin="reactions"]' +
                '[data-cgptx-id="reactions.reaction-1"]',
            ),
          ).find(
            (action) =>
              isVisible(action) &&
              action.closest("[data-cgptx-product-extension-probe-root]") ===
                null &&
              action.closest('[role="presentation"]') instanceof HTMLElement,
          ) ?? null,
        "the Reactions action in the native assistant selection toolbar",
      );
      const reactionPresentation = reactionAction.closest('[role="presentation"]');
      const reactionActionVisible = isVisible(reactionAction);
      const nativeActions = Array.from(
        document.querySelectorAll(
          '[data-cgptx-assistant-selection-action][data-cgptx-origin="app"]',
        ),
      ).filter(isVisible);
      const nativeAction =
        nativeActions.find(
          (action) => action.closest('[role="presentation"]') === reactionPresentation,
        ) ?? nativeActions[0] ?? null;
      const sharesNativeActionComponent =
        nativeAction instanceof HTMLElement &&
        nativeAction.tagName === reactionAction.tagName &&
        nativeAction.className === reactionAction.className;
      const beforeCreationCount = responseAnnotationCreationCount;
      reactionAction.click();
      await waitUntil(
        () =>
          responseAnnotationCreationCount === beforeCreationCount + 1 &&
          window.getSelection()?.isCollapsed === true &&
          document.querySelector("[data-response-text-annotation-id]") !== null,
        "the persisted native response annotation",
      );
      const persistedReaction = lastResponseAnnotationCreation;
      const composerAnnotationFound =
        document.querySelector("[data-response-text-annotation-id]") !== null;

      const settingsOpened = await openSettingsPane(
        "codex.settings.appearance",
      );
      if (!settingsOpened) {
        throw new Error("The native Settings window did not open");
      }
      const searchInput = await waitUntil(
        () =>
          Array.from(document.querySelectorAll("input")).find((input) => {
            const label = [
              input.getAttribute("aria-label"),
              input.getAttribute("placeholder"),
              input.getAttribute("role"),
              input.type,
            ]
              .filter((value) => typeof value === "string")
              .join(" ")
              .toLocaleLowerCase();
            return isVisible(input) && label.includes("search");
          }) ?? null,
        "the native Settings search field",
      );
      const searchQuery = "Thread Colors";
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (typeof valueSetter !== "function") {
        throw new Error("The native Settings search field has no value setter");
      }
      valueSetter.call(searchInput, searchQuery);
      searchInput.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: searchQuery,
          inputType: "insertText",
        }),
      );
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      await waitUntil(
        () => settingsSearchQuery === searchQuery,
        "the native Settings search query callback",
      );
      const searchQueryAccepted = settingsSearchQuery === searchQuery;
      const searchMatch = settingsSearchMatches(searchQuery).find(
        (result) => result.sectionSlug === "extensions.installed",
      );
      if (!searchMatch) {
        throw new Error("Settings search did not map Thread Colors to Extensions");
      }
      const searchResult = await waitUntil(
        () => {
          const leaf = Array.from(document.querySelectorAll("*")).find(
            (element) =>
              isVisible(element) &&
              element.textContent?.trim() === searchQuery &&
              !Array.from(element.children).some(
                (child) => child.textContent?.trim() === searchQuery,
              ),
          );
          const control = leaf?.closest(
            'button, a, [role="button"], [role="option"], [role="menuitem"]',
          );
          return isVisible(control) && control;
        },
        "the Thread Colors native Settings search result",
      );
      activateNativeButton(searchResult);
      await waitUntil(
        () =>
          currentSettingsPaneId() === "extensions.installed" &&
          document.body?.innerText?.includes("Thread Colors") === true,
        "the Extensions settings pane selected from search",
      );
      await wait();
      const visibleRefreshControl = Array.from(
        document.querySelectorAll('button, [role="button"]'),
      ).find(
        (element) =>
          isVisible(element) && element.textContent?.trim() === "Refresh",
      );
      const globalErrorVisible =
        document.body?.innerText?.includes("Oops, an error has occurred") ===
        true;

      return Object.freeze({
        realDom: true,
        thread: Object.freeze({
          ...selectedIdentity,
          title: model.context.title,
          signedInHeaderTitleFound: headerTitle instanceof HTMLElement,
        }),
        threadColors: Object.freeze({
          nativeMenuTrigger: true,
          nativeMenuAction: true,
          nativeFlyoutAction: true,
          header: headerDiagnostics,
          activity: activityLayout,
          standard: standardLayout,
          activityRowIsTaller:
            (activityLayout.row?.height ?? 0) >
            (standardLayout.row?.height ?? 0) + 1,
          cloud: Object.freeze({
            scope: cloudOwner.model.context.scope,
            menuActionFound: true,
            menuActionClicked: true,
            ownerMatched:
              cloudHost.getAttribute("data-cgptx-thread-list-owner") ===
              cloudOwnerKey,
            layout: cloudLayout,
          }),
        }),
        reactions: Object.freeze({
          targetFound: target instanceof HTMLElement,
          selectedText,
          actionFound: reactionAction instanceof HTMLElement,
          actionVisible: reactionActionVisible,
          nativeToolbarFound: reactionPresentation instanceof HTMLElement,
          sharesNativeActionComponent,
          creationCountBefore: beforeCreationCount,
          creationCountAfter: responseAnnotationCreationCount,
          composerAnnotationFound,
          persisted: persistedReaction,
        }),
        settings: Object.freeze({
          opened: settingsOpened,
          searchFieldFound: searchInput instanceof HTMLInputElement,
          queryAccepted: searchQueryAccepted,
          queryClearedAfterSelection: settingsSearchQuery === "",
          searchResultFound: searchResult instanceof HTMLElement,
          searchResultClicked: true,
          selectedPane: currentSettingsPaneId(),
          threadColorsVisible:
            document.body?.innerText?.includes("Thread Colors") === true,
          refreshControlAbsent: visibleRefreshControl === undefined,
          globalErrorAbsent: !globalErrorVisible,
        }),
      });
    };

    function ExactComposerAction({ entry, context, wrapFooter }) {
      const definition = entry.definition;
      const disabled = exactActionDisabled(entry, context);
      const menuItems = Array.isArray(definition.menuItems)
        ? definition.menuItems
        : [];
      const onClick = (event) => {
        if (disabled || typeof definition.onClick !== "function") return;
        definition.onClick(context, exactUiActivation(event));
      };
      const icon = exactUiIconElement(definition.icon, resolveIcon("plus"), "icon-xs");
      let control = originalJsx(native.NativeButton, {
        "aria-label": definition.label,
        "data-cgptx-composer-action": definition.id,
        color: "ghost",
        size: "composerSm",
        uniform: icon != null,
        disabled,
        ...(menuItems.length === 0 ? { onClick } : {}),
        children: icon ?? definition.label,
      });
      if (definition.tooltip) {
        control = originalJsx(native.Tooltip, {
          tooltipContent: definition.tooltip,
          children: control,
        });
      }
      if (menuItems.length > 0) {
        control = originalJsx(native.MenuRoot, {
          align: "start",
          contentWidth: "menuWide",
          disabled,
          triggerButton: control,
          children: menuItems.map((item) => exactUiMenuItem(item, context)),
        });
      }
      return wrapFooter
        ? originalJsx(native.Composer.FooterAction, { children: control })
        : control;
    }

    function ExactUiOwnerBoundary({ owner, type, props, elementKey }) {
      React.useSyncExternalStore(
        subscribeExactUi,
        () => exactUiVersion,
        () => exactUiVersion,
      );
      if (owner === "suggestions") {
        return originalJsx(type, {
          ...props,
          items: exactSuggestionItems(props.items, props),
        }, elementKey);
      }
      if (owner === "announcements") {
        return originalJsx(type, {
          ...props,
          entries: exactAnnouncementItems(props.entries),
        }, elementKey);
      }
      if (owner === "sidebar") {
        const sidebar = originalJsx(type, {
          ...props,
          availableDestinations: exactSidebarDestinationItems(
            props.availableDestinations,
            props,
          ),
        }, elementKey);
        return exactRichProbeRequested
          ? originalJsxs(React.Fragment, {
              children: [sidebar, originalJsx(ExactRichContentProbePortal, {})],
            })
          : sidebar;
      }
      const context = exactComposerContext(props);
      if (owner === "composer-footer") {
        return originalJsx(type, {
          ...props,
          leadingControls: originalJsx(React.Fragment, {
            children: [
              ...exactRenderSlots("composer.footer.leading", context),
              ...exactComposerActions("composer.footer.leading", context, true),
              props.leadingControls,
            ],
          }),
          trailingControls: originalJsx(React.Fragment, {
            children: [
              props.trailingControls,
              ...exactComposerActions("composer.footer.trailing", context, true),
              ...exactRenderSlots("composer.footer.trailing", context),
            ],
          }),
        }, elementKey);
      }
      if (owner === "action-bar") {
        return originalJsx(type, {
          ...props,
          children: originalJsx(React.Fragment, {
            children: [
              ...exactRenderSlots("composer.action-bar.leading", context),
              ...exactComposerActions("composer.action-bar.leading", context, false),
              props.children,
            ],
          }),
          trailingControls: originalJsx(React.Fragment, {
            children: [
              props.trailingControls,
              ...exactComposerActions("composer.action-bar.trailing", context, false),
              ...exactRenderSlots("composer.action-bar.trailing", context),
            ],
          }),
        }, elementKey);
      }
      if (owner === "utility") {
        return originalJsx(type, {
          ...props,
          homeAuxiliaryControl: originalJsx(React.Fragment, {
            children: [
              ...exactRenderSlots("composer.utility.leading", context),
              ...exactComposerActions("composer.utility.leading", context, false),
              props.homeAuxiliaryControl,
              ...exactComposerActions("composer.utility.trailing", context, false),
              ...exactRenderSlots("composer.utility.trailing", context),
            ],
          }),
        }, elementKey);
      }
      if (owner === "attachments") {
        return originalJsx(type, {
          ...props,
          children: originalJsx(React.Fragment, {
            children: [props.children, ...exactRenderSlots("composer.attachments", context)],
          }),
        }, elementKey);
      }
      return originalJsx(type, props, elementKey);
    }

    function ExactProductModeBoundary({ component, props }) {
      React.useSyncExternalStore(
        subscribeExactUi,
        () => exactUiVersion,
        () => exactUiVersion,
      );
      return exactProductModeItems(component(props), props);
    }

    function ExactHomeAmbientSuggestionBoundary({ component, props, elementKey }) {
      React.useSyncExternalStore(
        subscribeExactUi,
        () => exactUiVersion,
        () => exactUiVersion,
      );
      const rendered = component(props);
      if (rendered !== null || exactUiTransformers.suggestions.length === 0) {
        return rendered;
      }
      const surfaceProps = {
        items: [],
        layout: props.topLevelLayout === "list" ? "list" : "cards",
        composerMode: exactComposerMode === "chatgpt" ? "chat" : "work",
      };
      return originalJsx(ExactUiOwnerBoundary, {
        owner: "suggestions",
        type: native.HomeSuggestionSurface,
        props: surfaceProps,
        elementKey,
      }, elementKey);
    }

    function exactHomeSuggestionOwnerPropsInTree(tree, depth = 0) {
      if (depth > 24) return null;
      if (Array.isArray(tree)) {
        for (const child of tree) {
          const match = exactHomeSuggestionOwnerPropsInTree(child, depth + 1);
          if (match) return match;
        }
        return null;
      }
      if (!isElement(tree)) return null;
      const props = tree.props;
      if (
        typeof props?.hostId === "string" &&
        typeof props?.onLocalConversationCreated === "function" &&
        Object.hasOwn(props, "plan") &&
        Object.hasOwn(props, "projectRoot") &&
        Object.hasOwn(props, "routeEntryKey") &&
        Object.hasOwn(props, "topLevelLayout")
      ) {
        return props;
      }
      return exactHomeSuggestionOwnerPropsInTree(props?.children, depth + 1);
    }

    function ExactHomeSuggestionSlot() {
      React.useSyncExternalStore(
        subscribeExactUi,
        () => exactUiVersion,
        () => exactUiVersion,
      );
      if (exactUiTransformers.suggestions.length === 0) return null;
      const surfaceProps = {
        items: [],
        layout: exactHomeSuggestionLayout,
        composerMode: exactHomePageComposerMode,
      };
      return originalJsx("div", {
        "data-home-ambient-suggestions": true,
        className:
          "ms-[calc(var(--composer-suggestion-inline-inset)-var(--composer-inline-overhang))] " +
          "me-[calc(var(--composer-suggestion-inline-inset)+var(--composer-inline-overhang))] " +
          "h-fit min-h-0 min-w-0",
        children: originalJsx(ExactUiOwnerBoundary, {
          owner: "suggestions",
          type: native.HomeSuggestionSurface,
          props: surfaceProps,
          elementKey: "cgptx-empty-home-suggestions",
        }, "cgptx-empty-home-suggestions"),
      }, "cgptx-empty-home-suggestions-container");
    }

    function injectExactHomeSuggestionSlot(tree, depth = 0) {
      if (depth > 24) return tree;
      if (Array.isArray(tree)) {
        let changed = false;
        const children = tree.map((child) => {
          const next = injectExactHomeSuggestionSlot(child, depth + 1);
          changed ||= next !== child;
          return next;
        });
        return changed ? children : tree;
      }
      if (!isElement(tree)) return tree;
      const props = tree.props;
      if (
        tree.type === "div" &&
        props?.children == null &&
        typeof props?.className === "string" &&
        props.className.includes("max-w-(--thread-content-max-width)") &&
        props.className.includes("flex min-w-0 flex-col gap-2")
      ) {
        return originalJsx(
          tree.type,
          { ...props, children: originalJsx(ExactHomeSuggestionSlot, {}) },
          tree.key ?? undefined,
        );
      }
      const children = props?.children;
      const nextChildren = injectExactHomeSuggestionSlot(children, depth + 1);
      if (nextChildren === children) return tree;
      return originalJsx(
        tree.type,
        { ...props, children: nextChildren },
        tree.key ?? undefined,
      );
    }

    function ExactHomePageBoundary({ component, props }) {
      const rendered = component(props);
      exactHomePageComposerMode =
        props?.homeComposerMode === "chat" ? "chat" : "work";
      exactHomeSuggestionLayout =
        props?.homeComposerMode == null ? "cards" : "list";
      const suggestionOwner = exactHomeSuggestionOwnerPropsInTree(rendered);
      if (suggestionOwner) {
        exactHomeHostId = suggestionOwner.hostId;
        exactHomeProjectRoot =
          typeof suggestionOwner.projectRoot === "string"
            ? suggestionOwner.projectRoot
            : undefined;
        exactHomePlan = suggestionOwner.plan === true;
        exactHomeSuggestionLayout =
          suggestionOwner.topLevelLayout === "list" ? "list" : "cards";
      }
      return injectExactHomeSuggestionSlot(rendered);
    }

    function isExactHomePageOwner(type, props) {
      if (
        typeof type !== "function" ||
        !Object.hasOwn(props ?? {}, "chatHomeState") ||
        !Object.hasOwn(props ?? {}, "homeComposerController") ||
        !Object.hasOwn(props ?? {}, "homeComposerMode") ||
        !Object.hasOwn(props ?? {}, "onChatGptTaskSuggestionSelected") ||
        typeof props?.showHomeUtilityBar !== "boolean"
      ) {
        return false;
      }
      const source = Function.prototype.toString.call(type);
      return (
        source.includes("data-home-ambient-suggestions") &&
        source.includes("home-banners") &&
        source.includes("--thread-content-max-width:42rem")
      );
    }

    function ExactHomeTaskSuggestionBoundary({ component, props, elementKey }) {
      React.useSyncExternalStore(
        subscribeExactUi,
        () => exactUiVersion,
        () => exactUiVersion,
      );
      const rendered = component(props);
      if (rendered !== null || exactUiTransformers.suggestions.length === 0) {
        return rendered;
      }
      const surfaceProps = {
        items: [],
        layout: "list",
        composerMode: props.mode,
      };
      return originalJsx(ExactUiOwnerBoundary, {
        owner: "suggestions",
        type: native.HomeSuggestionSurface,
        props: surfaceProps,
        elementKey,
      }, elementKey);
    }

    function isExactHomeTaskSuggestionOwner(type, props) {
      if (
        typeof type !== "function" ||
        typeof props?.hostId !== "string" ||
        (props?.mode !== "chat" && props?.mode !== "work") ||
        typeof props?.generatedSuggestionsEnabled !== "boolean" ||
        typeof props?.onSelect !== "function"
      ) {
        return false;
      }
      if (type === native.HomeTaskSuggestions) return true;
      const source = Function.prototype.toString.call(type);
      return (
        source.includes("Suspense") &&
        source.includes("fallback") &&
        source.includes("children")
      );
    }

    function isExactHomeAmbientSuggestionOwner(type, props) {
      if (
        typeof type !== "function" ||
        typeof props?.ambientSuggestionSurface !== "string" ||
        typeof props?.domain !== "string" ||
        typeof props?.hostId !== "string" ||
        typeof props?.onLocalConversationCreated !== "function" ||
        !Object.hasOwn(props, "plan") ||
        !Object.hasOwn(props, "projectRoot") ||
        !Object.hasOwn(props, "selectedModel") ||
        !Object.hasOwn(props, "topLevelLayout")
      ) {
        return false;
      }
      const source = Function.prototype.toString.call(type);
      return (
        source.includes("ambient-suggestion-set-status") &&
        source.includes("ambient-suggestions-refresh") &&
        source.includes("home.ambientSuggestions.startError")
      );
    }

    function isExactSidebarDestinationOwner(type, props) {
      return (
        typeof type === "function" &&
        Array.isArray(props?.availableDestinations) &&
        typeof props?.sidebarMode === "string" &&
        Object.hasOwn(props, "sidebarCustomizationEnabled") &&
        Object.hasOwn(props, "navigationRailEnabled")
      );
    }

    function isExactProductModeOwner(type, props) {
      if (
        typeof type !== "function" ||
        typeof props?.disabled !== "boolean" ||
        (props.mode !== "work" && props.mode !== "codex") ||
        typeof props.onModeSelect !== "function" ||
        !["chatgpt", "chatgpt_work", "work"].includes(props.workModeAccess)
      ) {
        return false;
      }
      const source = Function.prototype.toString.call(type);
      return (
        source.includes("sidebarElectron.productMode.trigger") &&
        source.includes("sidebarElectron.productMode.work.description.recommended")
      );
    }

    function isExactComposerFooterOwner(type, props) {
      return (
        type === native.Composer.AdaptiveFooter ||
        (
          typeof type === "function" &&
          Object.hasOwn(props ?? {}, "composerInput") &&
          Object.hasOwn(props ?? {}, "leadingControls") &&
          Object.hasOwn(props ?? {}, "trailingControls") &&
          Object.hasOwn(props ?? {}, "voiceFooter") &&
          typeof props?.layout === "string"
        )
      );
    }

    function isExactComposerUtilityOwner(type, props) {
      return (
        type === native.ComposerUtilityBar ||
        (
          typeof type === "function" &&
          Object.hasOwn(props ?? {}, "homeAuxiliaryControl") &&
          Object.hasOwn(props ?? {}, "composerMode") &&
          Object.hasOwn(props ?? {}, "setComposerMode") &&
          Object.hasOwn(props ?? {}, "localRemoteExecutionTarget") &&
          (props?.variant === "home" || props?.variant === "follow-up")
        )
      );
    }

    ExactUiMountComponent = ExactUiMount;
    ExactComposerActionComponent = ExactComposerAction;
    ExactRichContentBoundaryComponent = ExactRichContentBoundary;

`;

const patches = Object.freeze([
  Object.freeze({
    name: "settings icon module initializer",
    before: lines(
      "    settingsVisibilityModule.t();",
      "    settingsLoadingModule.n();",
    ),
    after: lines(
      "    settingsVisibilityModule.i();",
      "    settingsLoadingModule.n();",
    ),
  }),
  Object.freeze({
    name: "settings search icon map guard",
    before: lines(
      "      if (native.settingsSectionIcons?.[result.sectionSlug] === undefined) {",
      '        native.settingsSectionIcons[result.sectionSlug] = resolveIcon("settings");',
      "      }",
    ),
    after: lines(
      "      if (",
      "        native.settingsSectionIcons &&",
      "        native.settingsSectionIcons[result.sectionSlug] === undefined",
      "      ) {",
      '        native.settingsSectionIcons[result.sectionSlug] = resolveIcon("settings");',
      "      }",
    ),
  }),
  Object.freeze({
    name: "null-safe React fiber lookup",
    before: lines(
      "  function fiberOf(node) {",
      "    const key = Object.keys(node).find((candidate) =>",
      '      candidate.startsWith("__reactFiber$"),',
      "    );",
      "    return key ? node[key] : null;",
      "  }",
    ),
    after: lines(
      "  function fiberOf(node) {",
      '    if ((typeof node !== "object" && typeof node !== "function") || node === null) {',
      "      return null;",
      "    }",
      "    const key = Object.keys(node).find((candidate) =>",
      '      candidate.startsWith("__reactFiber$"),',
      "    );",
      "    return key ? node[key] : null;",
      "  }",
    ),
  }),
  Object.freeze({
    name: "thread context equality",
    before: lines(
      "  function sameThreadContext(left, right) {",
      "    return (",
      "      left?.threadId === right?.threadId &&",
      "      left?.title === right?.title &&",
      "      left?.workingDirectory === right?.workingDirectory",
      "    );",
      "  }",
    ),
    after: lines(
      "  function threadOwnerKey(context) {",
      "    if (context?.scope === \"cloud\") {",
      "      return JSON.stringify([",
      "        \"cloud\",",
      "        context.accountId ?? null,",
      "        context.workspaceId ?? null,",
      "        context.threadId ?? null,",
      "      ]);",
      "    }",
      "    return JSON.stringify([",
      "      context?.scope ?? \"execution\",",
      "      context?.hostId ?? null,",
      "      context?.threadId ?? null,",
      "    ]);",
      "  }",
      "",
      "  function threadMenuModelKey(context) {",
      "    return JSON.stringify([",
      "      threadOwnerKey(context),",
      "      context?.surface ?? \"header\",",
      "    ]);",
      "  }",
      "",
      "  function sameThreadIdentity(left, right) {",
      "    return threadOwnerKey(left) === threadOwnerKey(right);",
      "  }",
      "",
      "  function sameThreadContext(left, right) {",
      "    return (",
      "      sameThreadIdentity(left, right) &&",
      "      left?.surface === right?.surface &&",
      "      left?.title === right?.title &&",
      "      left?.workingDirectory === right?.workingDirectory &&",
      "      left?.selected === right?.selected &&",
      "      left?.pinned === right?.pinned &&",
      "      left?.unread === right?.unread",
      "    );",
      "  }",
    ),
  }),
  Object.freeze({
    name: "current thread unmount cleanup",
    before: lines(
      "  function clearCurrentThreadAfterUnmount(threadId) {",
      "    const generation = ++currentThreadClearGeneration;",
      "    queueMicrotask(() => {",
      "      if (",
      "        generation !== currentThreadClearGeneration ||",
      "        currentThread?.threadId !== threadId",
      "      ) {",
      "        return;",
      "      }",
      "      currentThread = undefined;",
      "      emitCurrentThreadChange();",
      "    });",
      "  }",
    ),
    after: lines(
      "  function clearCurrentThreadAfterUnmount(context) {",
      "    const generation = ++currentThreadClearGeneration;",
      "    queueMicrotask(() => {",
      "      if (",
      "        generation !== currentThreadClearGeneration ||",
      "        !sameThreadIdentity(currentThread, context)",
      "      ) {",
      "        return;",
      "      }",
      "      currentThread = undefined;",
      "      emitCurrentThreadChange();",
      "    });",
      "  }",
    ),
  }),
  Object.freeze({
    name: "thread list row context",
    before: lines(
      "  function threadListContextFromRow(row) {",
      '    const scopedId = row.getAttribute("data-app-action-sidebar-thread-id");',
      '    const separator = scopedId?.lastIndexOf(":") ?? -1;',
      "    if (separator < 1 || separator === scopedId.length - 1) return null;",
      "    return Object.freeze({",
      "      threadId: scopedId.slice(separator + 1),",
      '      title: row.getAttribute("data-app-action-sidebar-thread-title") ?? "",',
      "    });",
      "  }",
    ),
    after: lines(
      "  function threadListContextFromRow(row) {",
      '    const hostId = row.getAttribute("data-app-action-sidebar-thread-host-id");',
      '    const scopedId = row.getAttribute("data-app-action-sidebar-thread-id");',
      '    const separator = scopedId?.lastIndexOf(":") ?? -1;',
      "    if (",
      '      typeof hostId !== "string" ||',
      "      hostId.length === 0 ||",
      "      separator < 1 ||",
      "      separator === scopedId.length - 1",
      "    ) {",
      "      return null;",
      "    }",
      "    return Object.freeze({",
      '      scope: "execution",',
      '      surface: "sidebar",',
      "      hostId,",
      "      threadId: scopedId.slice(separator + 1),",
      '      title: row.getAttribute("data-app-action-sidebar-thread-title") ?? "",',
      '      mode: "codex",',
      '      location: "local",',
      "    });",
      "  }",
    ),
  }),
  Object.freeze({
    name: "thread menu context",
    before: lines(
      "    function threadContextForMenuProps(props) {",
      "      const threadId = props.conversationId;",
      "      const row = Array.from(",
      '        document.querySelectorAll("[data-app-action-sidebar-thread-row]"),',
      "      ).find((candidate) =>",
      "        candidate",
      '          .getAttribute("data-app-action-sidebar-thread-id")',
      "          ?.endsWith(`:${threadId}`),",
      "      );",
      "      const title =",
      '        typeof props.title === "string"',
      "          ? props.title",
      '          : row?.getAttribute("data-app-action-sidebar-thread-title") ?? "";',
      "      return Object.freeze({",
      "        threadId,",
      "        title,",
      '        ...(typeof props.cwd === "string" && props.cwd.length > 0',
      "          ? { workingDirectory: props.cwd }",
      "          : {}),",
      "      });",
      "    }",
    ),
    after: lines(
      "    function threadContextForMenuProps(props) {",
      "      const threadId = props.conversationId;",
      "      const requestedHostId =",
      '        typeof props.hostId === "string" && props.hostId.length > 0',
      "          ? props.hostId",
      "          : undefined;",
      "      const candidateRows = Array.from(",
      '        document.querySelectorAll("[data-app-action-sidebar-thread-row]"),',
      "      ).filter((candidate) => {",
      "        const scopedId = candidate.getAttribute(",
      '          "data-app-action-sidebar-thread-id",',
      "        );",
      "        return scopedId?.endsWith(`:${threadId}`) === true;",
      "      });",
      "      const row =",
      "        requestedHostId === undefined",
      "          ? candidateRows.length === 1",
      "            ? candidateRows[0]",
      "            : undefined",
      "          : candidateRows.find(",
      "              (candidate) =>",
      "                candidate.getAttribute(",
      '                  "data-app-action-sidebar-thread-host-id",',
      "                ) === requestedHostId,",
      "            );",
      "      const title =",
      '        typeof props.title === "string"',
      "          ? props.title",
      '          : row?.getAttribute("data-app-action-sidebar-thread-title") ?? "";',
      "      return Object.freeze({",
      '        scope: "execution",',
      '        surface: "header",',
      "        hostId:",
      "          requestedHostId ??",
      '          row?.getAttribute("data-app-action-sidebar-thread-host-id"),',
      "        threadId,",
      "        title,",
      '        mode: "codex",',
      '        location: "local",',
      "        selected: true,",
      '        ...(typeof props.cwd === "string" && props.cwd.length > 0',
      "          ? { workingDirectory: props.cwd }",
      "          : {}),",
      "      });",
      "    }",
    ),
  }),
  Object.freeze({
    name: "thread menu boundary",
    before: lines(
      "    function ThreadMenuBoundary({ child }) {",
      "      threadMenuBoundaryRenderCount += 1;",
      "      const intl = native.useIntl();",
      "      React.useSyncExternalStore(",
      "        subscribeThreadMenu,",
      "        () => threadMenuRenderVersion,",
      "        () => threadMenuRenderVersion,",
      "      );",
      "      const context = threadContextForMenuProps(child.props);",
      "      React.useLayoutEffect(() => {",
      "        setCurrentThread(context);",
      "        return () => clearCurrentThreadAfterUnmount(context.threadId);",
      "      }, [context.threadId, context.title, context.workingDirectory]);",
      "      return renderThreadTree(child.type(child.props), context, intl);",
      "    }",
    ),
    after: lines(
      "    function ThreadMenuBoundary({ child }) {",
      "      threadMenuBoundaryRenderCount += 1;",
      "      const intl = native.useIntl();",
      "      const resolvedHostId = native.useScopeValue(",
      "        native.threadHostIdByConversation,",
      "        child.props.conversationId,",
      "      );",
      "      React.useSyncExternalStore(",
      "        subscribeThreadMenu,",
      "        () => threadMenuRenderVersion,",
      "        () => threadMenuRenderVersion,",
      "      );",
      "      const context = threadContextForMenuProps({",
      "        ...child.props,",
      "        hostId: child.props.hostId ?? resolvedHostId,",
      "      });",
      "      React.useLayoutEffect(() => {",
      "        if (",
      '          typeof context.hostId !== "string" ||',
      "          context.hostId.length === 0",
      "        ) {",
      "          return;",
      "        }",
      "        setCurrentThread(context);",
      "        return () => clearCurrentThreadAfterUnmount(context);",
      "      }, [",
      "        context.hostId,",
      "        context.threadId,",
      "        context.title,",
      "        context.workingDirectory,",
      "      ]);",
      "      return renderThreadTree(child.type(child.props), context, intl);",
      "    }",
    ),
  }),
  Object.freeze({
    name: "React thread leaf owner attribute",
    before: lines(
      '    props["data-cgptx-id"] = item.id;',
      '    props["data-cgptx-origin"] = item.origin ?? "";',
      '    props["data-cgptx-thread-id"] = model.context.threadId;',
      "",
      "    if (item.icon !== undefined) props.LeftIcon = resolveThreadIcon(item.icon);",
    ),
    after: lines(
      '    props["data-cgptx-id"] = item.id;',
      '    props["data-cgptx-origin"] = item.origin ?? "";',
      '    props["data-cgptx-thread-id"] = model.context.threadId;',
      '    props["data-cgptx-thread-owner"] = threadMenuModelKey(model.context);',
      "",
      "    if (item.icon !== undefined) props.LeftIcon = resolveThreadIcon(item.icon);",
    ),
  }),
  Object.freeze({
    name: "React thread submenu owner attribute",
    before: lines(
      '      props["data-cgptx-id"] = item.id;',
      '      props["data-cgptx-origin"] = item.origin ?? "";',
      '      props["data-cgptx-thread-id"] = model.context.threadId;',
      "      if (item.icon !== undefined) props.LeftIcon = resolveThreadIcon(item.icon);",
    ),
    after: lines(
      '      props["data-cgptx-id"] = item.id;',
      '      props["data-cgptx-origin"] = item.origin ?? "";',
      '      props["data-cgptx-thread-id"] = model.context.threadId;',
      '      props["data-cgptx-thread-owner"] = threadMenuModelKey(model.context);',
      "      if (item.icon !== undefined) props.LeftIcon = resolveThreadIcon(item.icon);",
    ),
  }),
  Object.freeze({
    name: "React thread trigger owner attribute",
    before: lines(
      "          {",
      "            ...trigger.props,",
      '            "data-cgptx-thread-id": context.threadId,',
      "          },",
      "          trigger.key ?? undefined,",
      "        )",
      "      : trigger;",
      "    const rootProps = {",
    ),
    after: lines(
      "          {",
      "            ...trigger.props,",
      '            "data-cgptx-thread-id": context.threadId,',
      '            "data-cgptx-thread-owner": threadMenuModelKey(context),',
      "          },",
      "          trigger.key ?? undefined,",
      "        )",
      "      : trigger;",
      "    const rootProps = {",
    ),
  }),
  Object.freeze({
    name: "thread menu DOM owner identity",
    before: lines(
      "  function threadIdForTrigger(trigger) {",
      "    return (",
      '      trigger?.getAttribute?.("data-cgptx-thread-id") ??',
      '      fiberPropAbove(trigger, "data-cgptx-thread-id") ??',
      "      null",
      "    );",
      "  }",
      "",
      "  function threadMenuTrigger(threadId) {",
      "    return (",
      '      Array.from(document.querySelectorAll("button")).find(',
      "        (button) => threadIdForTrigger(button) === threadId,",
      "      ) ?? null",
      "    );",
      "  }",
      "",
      "  function visibleThreadMenuColumn(threadId) {",
      '    const columns = Array.from(document.querySelectorAll(\'[role="menu"]\'));',
      "    return (",
      "      columns.find((column) => {",
      "        if (column.offsetHeight === 0) return false;",
      '        const labelledBy = column.getAttribute("aria-labelledby");',
      "        const trigger = labelledBy ? document.getElementById(labelledBy) : null;",
      "        if (threadIdForTrigger(trigger) === threadId) return true;",
      '        return Array.from(column.querySelectorAll(\'[role="menuitem"]\')).some(',
      "          (row) =>",
      '            row.getAttribute("data-cgptx-thread-id") === threadId ||',
      '            fiberPropAbove(row, "data-cgptx-thread-id") === threadId,',
      "        );",
      "      }) ?? null",
      "    );",
      "  }",
    ),
    after: lines(
      "  function threadOwnerForTrigger(trigger) {",
      "    return (",
      '      trigger?.getAttribute?.("data-cgptx-thread-owner") ??',
      '      fiberPropAbove(trigger, "data-cgptx-thread-owner") ??',
      "      null",
      "    );",
      "  }",
      "",
      "  function threadMenuTrigger(ownerKey) {",
      "    return (",
      '      Array.from(document.querySelectorAll("button")).find(',
      "        (button) => threadOwnerForTrigger(button) === ownerKey,",
      "      ) ?? null",
      "    );",
      "  }",
      "",
      "  function visibleThreadMenuColumn(ownerKey) {",
      '    const columns = Array.from(document.querySelectorAll(\'[role="menu"]\'));',
      "    return (",
      "      columns.find((column) => {",
      "        if (column.offsetHeight === 0) return false;",
      '        const labelledBy = column.getAttribute("aria-labelledby");',
      "        const trigger = labelledBy ? document.getElementById(labelledBy) : null;",
      "        if (threadOwnerForTrigger(trigger) === ownerKey) return true;",
      '        return Array.from(column.querySelectorAll(\'[role="menuitem"]\')).some(',
      "          (row) =>",
      '            row.getAttribute("data-cgptx-thread-owner") === ownerKey ||',
      '            fiberPropAbove(row, "data-cgptx-thread-owner") === ownerKey,',
      "        );",
      "      }) ?? null",
      "    );",
      "  }",
      "",
      "  function threadModelForId(threadId) {",
      "    const matches = Array.from(threadModels.values()).filter(",
      "      (model) => model.context.threadId === threadId,",
      "    );",
      "    if (matches.length === 1) return matches[0];",
      "    if (matches.length > 1 && currentThread) {",
      "      const currentMatches = matches.filter((model) =>",
      "        sameThreadIdentity(model.context, currentThread),",
      "      );",
      "      if (currentMatches.length === 1) return currentMatches[0];",
      "    }",
      "    return null;",
      "  }",
    ),
  }),
  Object.freeze({
    name: "dynamic thread menu owner lookup",
    before: "      const column = visibleThreadMenuColumn(model.context.threadId);",
    after: "      const column = visibleThreadMenuColumn(threadMenuModelKey(model.context));",
  }),
  Object.freeze({
    name: "generic thread extension action contract",
    before: lines(
      "      if (view && builtIn?.onClick === item.onClick) {",
      "        raw.onClick = view.raw.onClick;",
      "        raw.onSelect = view.raw.onSelect;",
      "      } else {",
      "        delete raw.onSelect;",
      "        if (typeof item.onClick === \"function\") raw.onClick = item.onClick;",
      "        else delete raw.onClick;",
      "      }",
    ),
    after: lines(
      "      if (view && builtIn?.onClick === item.onClick) {",
      "        raw.onClick = view.raw.onClick;",
      "        raw.onSelect = view.raw.onSelect;",
      "      } else {",
      "        delete raw.onClick;",
      "        if (typeof item.onClick === \"function\") raw.onSelect = item.onClick;",
      "        else delete raw.onSelect;",
      "      }",
    ),
  }),
  Object.freeze({
    name: "generic thread menu async rendering",
    before: lines(
      "  function rawThreadItems(model) {",
      "    const effective = computeEffectiveThreadItems(model);",
      "    const builtIns = deepItemsById(model.builtInCache);",
      "    model.renderEntriesByRawId = new Map();",
      "    for (const key of Object.keys(model.renderShortcuts)) {",
      "      delete model.renderShortcuts[key];",
      "    }",
      "    Object.assign(model.renderShortcuts, model.stockShortcuts);",
      "    return effective.map((item) => rawThreadItem(model, item, builtIns));",
      "  }",
    ),
    after: lines(
      "  function rawThreadItemsFromEffective(model, effective) {",
      "    const builtIns = deepItemsById(model.builtInCache);",
      "    model.renderEntriesByRawId = new Map();",
      "    for (const key of Object.keys(model.renderShortcuts)) {",
      "      delete model.renderShortcuts[key];",
      "    }",
      "    Object.assign(model.renderShortcuts, model.stockShortcuts);",
      "    return effective.map((item) => rawThreadItem(model, item, builtIns));",
      "  }",
      "",
      "  function rawThreadItems(model) {",
      "    return rawThreadItemsFromEffective(",
      "      model,",
      "      computeEffectiveThreadItems(model),",
      "    );",
      "  }",
      "",
      "  async function rawThreadItemsAsync(model) {",
      "    return rawThreadItemsFromEffective(",
      "      model,",
      "      await computeEffectiveThreadItemsAsync(model),",
      "    );",
      "  }",
    ),
  }),
  Object.freeze({
    name: "generic thread menu asynchronous getItems",
    before: lines(
      "  function renderGenericThreadMenu(tree, context, intl) {",
      "    threadMenuAdapterRenderCount += 1;",
      "    const sourceItems = () => synchronousThreadItems(tree.props.getItems);",
      "    let model = updateGenericThreadModel(",
      "      context,",
      "      sourceItems(),",
      "      tree.props.shortcuts,",
      "      intl,",
      "    );",
      "    const items = rawThreadItems(model);",
      "    const shortcuts = model.renderShortcuts;",
      "    const getItems = () => {",
      "      model = updateGenericThreadModel(",
      "        context,",
      "        sourceItems(),",
      "        tree.props.shortcuts,",
      "        intl,",
      "      );",
      "      return rawThreadItems(model);",
      "    };",
    ),
    after: lines(
      "  function renderGenericThreadMenu(tree, context, intl) {",
      "    threadMenuAdapterRenderCount += 1;",
      "    const sourceItems = () => synchronousThreadItems(tree.props.getItems);",
      "    let model = updateGenericThreadModel(",
      "      context,",
      "      sourceItems(),",
      "      tree.props.shortcuts,",
      "      intl,",
      "    );",
      "    const items = rawThreadItems(model);",
      "    const shortcuts = model.renderShortcuts;",
      "    const getItems = async () => {",
      "      const source = await tree.props.getItems();",
      "      if (!Array.isArray(source)) {",
      '        throw new Error("ChatGPT thread menu items must be an array");',
      "      }",
      "      model = updateGenericThreadModel(",
      "        context,",
      "        source,",
      "        tree.props.shortcuts,",
      "        intl,",
      "      );",
      "      return rawThreadItemsAsync(model);",
      "    };",
    ),
  }),
  Object.freeze({
    name: "generic thread trigger owner attribute",
    before: lines(
      "          {",
      "            ...trigger.props,",
      '            "data-cgptx-thread-id": context.threadId,',
      "          },",
      "          trigger.key ?? undefined,",
      "        )",
      "      : trigger;",
      "    return native.jsx(",
      "      tree.type,",
    ),
    after: lines(
      "          {",
      "            ...trigger.props,",
      '            "data-cgptx-thread-id": context.threadId,',
      '            "data-cgptx-thread-owner": threadMenuModelKey(context),',
      "          },",
      "          trigger.key ?? undefined,",
      "        )",
      "      : trigger;",
      "    return native.jsx(",
      "      tree.type,",
    ),
  }),
  Object.freeze({
    name: "generic thread menu React key",
    before: lines(
      "      },",
      "      context.threadId,",
      "    );",
      "  }",
      "",
      "  function decorateGenericThreadItem(type, props, key) {",
    ),
    after: lines(
      "      },",
      "      threadMenuModelKey(context),",
      "    );",
      "  }",
      "",
      "  function decorateGenericThreadItem(type, props, key) {",
    ),
  }),
  Object.freeze({
    name: "generic thread item owner attribute",
    before: lines(
      '      "data-cgptx-origin": item.origin ?? "",',
      '      "data-cgptx-thread-id": model.context.threadId,',
      "    };",
      '    if (item.kind === "separator") return next;',
    ),
    after: lines(
      '      "data-cgptx-origin": item.origin ?? "",',
      '      "data-cgptx-thread-id": model.context.threadId,',
      '      "data-cgptx-thread-owner": threadMenuModelKey(model.context),',
      "    };",
      '    if (item.kind === "separator") return next;',
    ),
  }),
  Object.freeze({
    name: "sidebar thread context storage",
    before: lines(
      "  let activeAssistantSelectionModel = null;",
      "  let assistantSelectionPositionContext = null;",
      "  let pendingResponseAnnotationCreation = null;",
    ),
    after: lines(
      "  let activeAssistantSelectionModel = null;",
      "  let assistantSelectionPositionContext = null;",
      "  let sidebarThreadContext = null;",
      "  let pendingResponseAnnotationCreation = null;",
    ),
  }),
  Object.freeze({
    name: "pending thread flyout owner lookup",
    before: lines(
      "        if (pendingThreadExpanded) {",
      "          const threadColumn = visibleThreadMenuColumn(",
      "            pendingThreadExpanded.threadId,",
      "          );",
    ),
    after: lines(
      "        if (pendingThreadExpanded) {",
      "          const threadColumn = visibleThreadMenuColumn(",
      "            pendingThreadExpanded.ownerKey,",
      "          );",
    ),
  }),
  Object.freeze({
    name: "legacy thread menu model resolution",
    before: lines(
      "      getItems(threadId) {",
      "        const model = threadModels.get(threadId);",
      "        return model ? computeEffectiveThreadItems(model) : Object.freeze([]);",
      "      },",
      "",
      "      activateItem(threadId, id) {",
      "        const model = threadModels.get(threadId);",
      "        if (!model) return false;",
    ),
    after: lines(
      "      getItems(threadId) {",
      "        const model = threadModelForId(threadId);",
      "        return model ? computeEffectiveThreadItems(model) : Object.freeze([]);",
      "      },",
      "",
      "      activateItem(threadId, id) {",
      "        const model = threadModelForId(threadId);",
      "        if (!model) return false;",
    ),
  }),
  Object.freeze({
    name: "legacy thread submenu owner activation",
    before: lines(
      "        if (Array.isArray(item.items) && item.items.length > 0) {",
      "          const column = visibleThreadMenuColumn(threadId);",
      "          const row = threadRowById(column, id);",
      "          if (row) {",
      "            requestThreadFlyout(row);",
      "            return true;",
      "          }",
      "          const trigger = threadMenuTrigger(threadId);",
      "          if (!trigger) return false;",
      "          pendingThreadExpanded = { threadId, id };",
      "          pressTrigger(trigger);",
      "          return true;",
      "        }",
    ),
    after: lines(
      "        if (Array.isArray(item.items) && item.items.length > 0) {",
      "          const ownerKey = threadMenuModelKey(model.context);",
      "          const column = visibleThreadMenuColumn(ownerKey);",
      "          const row = threadRowById(column, id);",
      "          if (row) {",
      "            requestThreadFlyout(row);",
      "            return true;",
      "          }",
      "          const trigger = threadMenuTrigger(ownerKey);",
      "          if (!trigger) return false;",
      "          pendingThreadExpanded = { ownerKey, id };",
      "          pressTrigger(trigger);",
      "          return true;",
      "        }",
    ),
  }),
  Object.freeze({
    name: "debug thread model resolution",
    before: lines(
      "      computeEffectiveThreadItems: (threadId) => {",
      "        const model = threadModels.get(threadId);",
      "        return model ? computeEffectiveThreadItems(model) : Object.freeze([]);",
      "      },",
      "      visibleThreadMenuColumn,",
    ),
    after: lines(
      "      computeEffectiveThreadItems: (threadId) => {",
      "        const model = threadModelForId(threadId);",
      "        return model ? computeEffectiveThreadItems(model) : Object.freeze([]);",
      "      },",
      "      visibleThreadMenuColumn: (threadId) => {",
      "        const model = threadModelForId(threadId);",
      "        return model",
      "          ? visibleThreadMenuColumn(threadMenuModelKey(model.context))",
      "          : null;",
      "      },",
    ),
  }),
  Object.freeze({
    name: "signed-in sidebar thread owner boundary",
    before: lines(
      "    function isAssistantSelectionMenu(type, props) {",
      "      return (",
    ),
    after: lines(
      "    function isExecutionSidebarThreadRow(type, props) {",
      "      if (",
      '        typeof type !== "function" ||',
      "        !props ||",
      '        typeof props !== "object" ||',
      '        typeof props.conversationId !== "string" ||',
      "        props.conversationId.length === 0 ||",
      '        typeof props.hostId !== "string" ||',
      "        props.hostId.length === 0 ||",
      "        (",
      '          props.variant !== "sidebar" &&',
      '          props.variant !== "sidebarPinned"',
      "        ) ||",
      '        !Object.hasOwn(props, "threadSummary") ||',
      '        !Object.hasOwn(props, "titlePrefix") ||',
      '        !Object.hasOwn(props, "renderActions") ||',
      '        !Object.hasOwn(props, "isAeonThread")',
      "      ) {",
      "        return false;",
      "      }",
      "      const source = Function.prototype.toString.call(type);",
      "      return (",
      '        source.includes("priorityIndicatorNode") &&',
      '        source.includes("sidebar_context_menu") &&',
      '        source.includes("markThreadAsUnread")',
      "      );",
      "    }",
      "",
      "    function threadContextForExecutionSidebarProps(props) {",
      "      if (",
      '        typeof props?.conversationId !== "string" ||',
      "        props.conversationId.length === 0 ||",
      '        typeof props.hostId !== "string" ||',
      "        props.hostId.length === 0",
      "      ) {",
      "        return null;",
      "      }",
      "      const dataAttributes = props.dataAttributes;",
      "      const attributeTitle =",
      '        dataAttributes && typeof dataAttributes === "object"',
      '          ? dataAttributes["data-app-action-sidebar-thread-title"]',
      "          : undefined;",
      "      const summaryTitle = props.threadSummary?.title;",
      "      return Object.freeze({",
      '        scope: "execution",',
      '        surface: "sidebar",',
      "        hostId: props.hostId,",
      "        threadId: props.conversationId,",
      "        title:",
      '          typeof attributeTitle === "string"',
      "            ? attributeTitle",
      '            : typeof summaryTitle === "string"',
      "              ? summaryTitle",
      '              : typeof props.titleOverride === "string"',
      "                ? props.titleOverride",
      '                : "",',
      '        mode: "codex",',
      '        location: "local",',
      "        selected: props.isActive === true,",
      "        pinned: props.isPinned === true,",
      "        unread: props.isUnread === true,",
      "        archived: false,",
      "        temporary: false,",
      "      });",
      "    }",
      "",
      "    function isChatGptSidebarThreadRow(type, props) {",
      "      if (",
      '        typeof type !== "function" ||',
      "        !props ||",
      '        typeof props !== "object" ||',
      "        !props.conversation ||",
      '        typeof props.conversation !== "object" ||',
      '        typeof props.conversation.id !== "string" ||',
      "        props.conversation.id.length === 0 ||",
      "        props.conversationId !== props.conversation.id ||",
      '        typeof props.title !== "string" ||',
      '        !Object.hasOwn(props, "titlePrefix") ||',
      '        !Object.hasOwn(props, "conversationOrigin")',
      "      ) {",
      "        return false;",
      "      }",
      "      const source = Function.prototype.toString.call(type);",
      "      return (",
      '        source.includes("chatgptConversations.sidebar.archiveAriaLabel") &&',
      '        source.includes("chatgptConversations.sidebar.cloudScheduledTask") &&',
      '        source.includes("surface:`sidebar`") &&',
      '        source.includes("renderActions")',
      "      );",
      "    }",
      "",
      "    function threadContextForSidebarProps(props, accountState) {",
      "      const conversation = props.conversation;",
      "      const accountId =",
      '        typeof accountState?.authenticatedAccountId === "string" &&',
      "        accountState.authenticatedAccountId.length > 0",
      "          ? accountState.authenticatedAccountId",
      '          : typeof accountState?.accountId === "string" &&',
      "              accountState.accountId.length > 0",
      "            ? accountState.accountId",
      "            : undefined;",
      "      if (",
      "        !conversation ||",
      '        typeof conversation.id !== "string" ||',
      "        conversation.id.length === 0 ||",
      "        accountId === undefined",
      "      ) {",
      "        return null;",
      "      }",
      "      const selectedAccountId = accountState?.accountId;",
      "      const workspaceId =",
      '        accountState?.accountStructure === "workspace" &&',
      '        typeof selectedAccountId === "string" &&',
      "        selectedAccountId.length > 0 &&",
      "        selectedAccountId !== accountId",
      "          ? selectedAccountId",
      "          : undefined;",
      "      return Object.freeze({",
      '        scope: "cloud",',
      '        surface: "sidebar",',
      "        accountId,",
      "        ...(workspaceId === undefined ? {} : { workspaceId }),",
      "        threadId: conversation.id,",
      "        title:",
      '          typeof props.title === "string"',
      "            ? props.title",
      '            : typeof conversation.title === "string"',
      "              ? conversation.title",
      '              : "",',
      '        mode: "chatgpt",',
      '        location: "cloud",',
      "        selected: props.isActive === true,",
      "        pinned: props.isPinned === true,",
      '        unread: props.statusState?.unread === true,',
      "        archived: false,",
      "        temporary: false,",
      "      });",
      "    }",
      "",
      "    function injectSidebarPriorityIndicator(",
      "      tree,",
      "      extensionPriorityIndicator,",
      "      context,",
      "      depth = 0,",
      "    ) {",
      "      if (depth > 20 || !isElement(tree)) return tree;",
      "      const props = tree.props ?? {};",
      "      if (",
      "        props.floatStatusIconsEnd === true &&",
      '        typeof props.renderActions === "function" &&',
      '        Object.hasOwn(props, "reserveLeadingSlot") &&',
      '        Object.hasOwn(props, "additionalHoverActionCount") &&',
      '        Object.hasOwn(props, "overlayMetaContent")',
      "      ) {",
      "        const dataAttributes = {",
      "          ...(props.dataAttributes &&",
      '          typeof props.dataAttributes === "object"',
      "            ? props.dataAttributes",
      "            : {}),",
      '          "data-cgptx-thread-row-owner": threadOwnerKey(context),',
      '          "data-cgptx-thread-row-scope": context.scope,',
      "        };",
      "        let priorityIndicatorNode = props.priorityIndicatorNode;",
      "        let overlayMetaContent = props.overlayMetaContent;",
      "        if (extensionPriorityIndicator != null) {",
      "          if (priorityIndicatorNode == null) {",
      "            overlayMetaContent =",
      "              overlayMetaContent == null",
      "                ? extensionPriorityIndicator",
      "                : originalJsxs(React.Fragment, {",
      "                    children: [",
      "                      overlayMetaContent,",
      "                      extensionPriorityIndicator,",
      "                    ],",
      "                  });",
      "          } else {",
      '            priorityIndicatorNode = originalJsxs("span", {',
      '              style: { display: "flex", alignItems: "center", gap: "2px" },',
      "              children: [priorityIndicatorNode, extensionPriorityIndicator],",
      "            });",
      "          }",
      "        }",
      "        return originalJsx(",
      "          tree.type,",
      "          {",
      "            ...props,",
      "            dataAttributes,",
      "            priorityIndicatorNode,",
      "            overlayMetaContent,",
      "          },",
      "          tree.key ?? undefined,",
      "        );",
      "      }",
      "      const children = props.children;",
      "      const nextChildren = Array.isArray(children)",
      "        ? children.map((child) =>",
      "            injectSidebarPriorityIndicator(",
      "              child,",
      "              extensionPriorityIndicator,",
      "              context,",
      "              depth + 1,",
      "            ),",
      "          )",
      "        : injectSidebarPriorityIndicator(",
      "            children,",
      "            extensionPriorityIndicator,",
      "            context,",
      "            depth + 1,",
      "          );",
      "      const child = props.child;",
      '      const nextChild = Object.hasOwn(props, "child")',
      "        ? injectSidebarPriorityIndicator(",
      "            child,",
      "            extensionPriorityIndicator,",
      "            context,",
      "            depth + 1,",
      "          )",
      "        : child;",
      "      if (nextChildren === children && nextChild === child) return tree;",
      "      return originalJsx(",
      "        tree.type,",
      "        {",
      "          ...props,",
      "          ...(nextChildren === children ? {} : { children: nextChildren }),",
      "          ...(nextChild === child ? {} : { child: nextChild }),",
      "        },",
      "        tree.key ?? undefined,",
      "      );",
      "    }",
      "",
      "    const threadRowSlotPositions = new WeakMap();",
      "",
      "    function retainThreadRowSlotPosition(target) {",
      "      let record = threadRowSlotPositions.get(target);",
      "      if (!record) {",
      "        record = { count: 0, previous: target.style.position };",
      "        threadRowSlotPositions.set(target, record);",
      '        target.style.position = "relative";',
      "      }",
      "      record.count += 1;",
      "      return () => {",
      "        if (threadRowSlotPositions.get(target) !== record) return;",
      "        record.count -= 1;",
      "        if (record.count > 0) return;",
      "        threadRowSlotPositions.delete(target);",
      '        if (target.style.position === "relative") {',
      "          target.style.position = record.previous;",
      "        }",
      "      };",
      "    }",
      "",
      "    function positionThreadRowSlotElement(host, element, slot) {",
      '      if (slot !== "priority-indicator") {',
      "        return () => {};",
      "      }",
      "      const previousHostDisplay = host.style.display;",
      "      const previousPositioned = element.getAttribute(",
      '        "data-cgptx-thread-row-slot-positioned",',
      "      );",
      "      const previousElementStyle = Object.freeze({",
      "        position: element.style.position,",
      "        insetInlineStart: element.style.insetInlineStart,",
      "        top: element.style.top,",
      "        bottom: element.style.bottom,",
      "        height: element.style.height,",
      "        pointerEvents: element.style.pointerEvents,",
      "        zIndex: element.style.zIndex,",
      "      });",
      '      element.setAttribute("data-cgptx-thread-row-slot-positioned", slot);',
      '      element.style.position = "absolute";',
      '      element.style.insetInlineStart = "2px";',
      '      element.style.top = "0";',
      '      element.style.bottom = "0";',
      '      element.style.height = "auto";',
      '      element.style.pointerEvents = "none";',
      '      element.style.zIndex = "1";',
      '      host.style.display = "none";',
      "      let rowOwner;",
      "      let releaseRowPosition = () => {};",
      "      const place = () => {",
      "        if (!host.isConnected) return;",
      "        if (element.parentElement !== host && element.parentElement !== rowOwner) return;",
      "        const next = host.closest(",
      '          "[data-app-action-sidebar-thread-row], " +',
      '            "[data-cgptx-thread-row-owner]",',
      "        );",
      "        if (!(next instanceof HTMLElement)) return;",
      "        if (next !== rowOwner) {",
      "          releaseRowPosition();",
      "          rowOwner = next;",
      "          releaseRowPosition = retainThreadRowSlotPosition(next);",
      "        }",
      "        if (element.parentElement !== next) next.append(element);",
      "      };",
      "      place();",
      "      const observedRoot = rowOwner;",
      "      const mutationObserver =",
      '        typeof MutationObserver === "function" &&',
      "        observedRoot instanceof HTMLElement",
      "          ? new MutationObserver(place)",
      "          : undefined;",
      "      mutationObserver?.observe(observedRoot, { childList: true, subtree: true });",
      "      return () => {",
      "        mutationObserver?.disconnect();",
      "        if (element.parentElement === rowOwner) host.append(element);",
      "        releaseRowPosition();",
      "        Object.assign(element.style, previousElementStyle);",
      "        if (previousPositioned === null) {",
      '          element.removeAttribute("data-cgptx-thread-row-slot-positioned");',
      "        } else {",
      "          element.setAttribute(",
      '            "data-cgptx-thread-row-slot-positioned",',
      "            previousPositioned,",
      "          );",
      "        }",
      "        host.style.display = previousHostDisplay;",
      "      };",
      "    }",
      "",
      "    function ThreadListView({ context, item, slot }) {",
      "      const hostRef = React.useRef(null);",
      "      React.useLayoutEffect(() => {",
      "        const host = hostRef.current;",
      "        if (!host) return;",
      "        host.replaceChildren();",
      '        host.style.display = "flex";',
      "        let element;",
      "        try {",
      "          element = item.view();",
      "        } catch (error) {",
      '          warn("thread-list item view threw; skipped", error);',
      '          host.style.display = "none";',
      "          return () => {",
      "            host.replaceChildren();",
      '            host.style.display = "flex";',
      "          };",
      "        }",
      "        if (!(element instanceof HTMLElement)) {",
      '          warn("thread-list item view did not return an HTMLElement; skipped");',
      '          host.style.display = "none";',
      "          return () => {",
      "            host.replaceChildren();",
      '            host.style.display = "flex";',
      "          };",
      "        }",
      "        host.append(element);",
      "        const restoreLayout = positionThreadRowSlotElement(",
      "          host,",
      "          element,",
      "          slot,",
      "        );",
      "        return () => {",
      "          restoreLayout();",
      "          host.replaceChildren();",
      "        };",
      "      }, [context, item, slot]);",
      '      return originalJsx("span", {',
      "        ref: hostRef,",
      '        "data-cgptx-thread-list-views": slot,',
      '        "data-cgptx-thread-list-owner": threadOwnerKey(context),',
      '        "data-cgptx-thread-list-scope": context.scope,',
      "        style: {",
      '          alignSelf: "stretch",',
      '          display: "flex",',
      '          flex: "none",',
      '          height: "1rem",',
      '          pointerEvents: "none",',
      "        },",
      "      });",
      "    }",
      "",
      "    function ThreadListViews({ context, items, slot }) {",
      "      return originalJsxs(React.Fragment, {",
      "        children: items.map((item, index) =>",
      "          originalJsx(",
      "            ThreadListView,",
      "            { context, item, slot },",
      '            `${threadOwnerKey(context)}:${slot}:${index}`,',
      "          ),",
      "        ),",
      "      });",
      "    }",
      "",
      "    function ExecutionSidebarThreadBoundary({ child }) {",
      "      React.useSyncExternalStore(",
      "        subscribe,",
      "        () => renderVersion,",
      "        () => renderVersion,",
      "      );",
      "      const context = threadContextForExecutionSidebarProps(child.props);",
      '      const prefixItems = context',
      '        ? computeThreadListItems(context, "title-prefix")',
      "        : [];",
      "      const extensionPrefix =",
      "        prefixItems.length === 0",
      "          ? null",
      "          : originalJsx(",
      "              ThreadListViews,",
      '              { context, items: prefixItems, slot: "title-prefix" },',
      '              `${threadOwnerKey(context)}:title-prefix`,',
      "            );",
      "      const titlePrefix =",
      "        extensionPrefix == null",
      "          ? child.props.titlePrefix",
      "          : child.props.titlePrefix == null",
      "            ? extensionPrefix",
      "            : originalJsxs(React.Fragment, {",
      "                children: [child.props.titlePrefix, extensionPrefix],",
      "              });",
      '      const priorityItems = context',
      '        ? computeThreadListItems(context, "priority-indicator")',
      "        : [];",
      "      const extensionPriorityIndicator =",
      "        priorityItems.length === 0",
      "          ? null",
      "          : originalJsx(",
      "              ThreadListViews,",
      '              { context, items: priorityItems, slot: "priority-indicator" },',
      '              `${threadOwnerKey(context)}:priority-indicator`,',
      "            );",
      "      if (extensionPrefix == null && extensionPriorityIndicator == null) {",
      "        return child;",
      "      }",
      "      let priorityIndicatorNode = child.props.priorityIndicatorNode;",
      "      let overlayMetaContent = child.props.overlayMetaContent;",
      "      if (extensionPriorityIndicator != null) {",
      "        if (priorityIndicatorNode == null) {",
      "          overlayMetaContent =",
      "            overlayMetaContent == null",
      "              ? extensionPriorityIndicator",
      "              : originalJsxs(React.Fragment, {",
      "                  children: [overlayMetaContent, extensionPriorityIndicator],",
      "                });",
      "        } else {",
      '          priorityIndicatorNode = originalJsxs("span", {',
      '            style: { display: "flex", alignItems: "center", gap: "2px" },',
      "            children: [priorityIndicatorNode, extensionPriorityIndicator],",
      "          });",
      "        }",
      "      }",
      "      return originalJsx(",
      "        child.type,",
      "        {",
      "          ...child.props,",
      "          titlePrefix,",
      "          priorityIndicatorNode,",
      "          overlayMetaContent,",
      "        },",
      "        child.key ?? undefined,",
      "      );",
      "    }",
      "",
      "    function SidebarThreadBoundary({ child }) {",
      "      const accountState = native.useScopeValue(native.accountState);",
      "      React.useSyncExternalStore(",
      "        subscribe,",
      "        () => renderVersion,",
      "        () => renderVersion,",
      "      );",
      "      React.useSyncExternalStore(",
      "        subscribeThreadMenu,",
      "        () => threadMenuRenderVersion,",
      "        () => threadMenuRenderVersion,",
      "      );",
      "      const context = threadContextForSidebarProps(",
      "        child.props,",
      "        accountState,",
      "      );",
      "      React.useLayoutEffect(() => {",
      "        if (!context?.selected) return;",
      "        setCurrentThread(context);",
      "        return () => clearCurrentThreadAfterUnmount(context);",
      "      }, [",
      "        context?.accountId,",
      "        context?.workspaceId,",
      "        context?.threadId,",
      "        context?.title,",
      "        context?.selected,",
      "        context?.pinned,",
      "        context?.unread,",
      "      ]);",
      '      const prefixItems = context',
      '        ? computeThreadListItems(context, "title-prefix")',
      "        : [];",
      "      const extensionPrefix =",
      "        prefixItems.length === 0",
      "          ? null",
      "          : originalJsx(",
      "              ThreadListViews,",
      '              { context, items: prefixItems, slot: "title-prefix" },',
      '              `${threadOwnerKey(context)}:title-prefix`,',
      "            );",
      "      const titlePrefix =",
      "        extensionPrefix == null",
      "          ? child.props.titlePrefix",
      "          : child.props.titlePrefix == null",
      "          ? extensionPrefix",
      "          : originalJsxs(React.Fragment, {",
      "              children: [child.props.titlePrefix, extensionPrefix],",
      "            });",
      '      const priorityItems = context',
      '        ? computeThreadListItems(context, "priority-indicator")',
      "        : [];",
      "      const extensionPriorityIndicator =",
      "        priorityItems.length === 0",
      "          ? null",
      "          : originalJsx(",
      "              ThreadListViews,",
      '              { context, items: priorityItems, slot: "priority-indicator" },',
      '              `${threadOwnerKey(context)}:priority-indicator`,',
      "            );",
      "      const rendered = child.type({",
      "        ...child.props,",
      "        titlePrefix,",
      "      });",
      "      if (!context) return rendered;",
      "      const rowTree = injectSidebarPriorityIndicator(",
      "        rendered,",
      "        extensionPriorityIndicator,",
      "        context,",
      "      );",
      "      return originalJsx(sidebarThreadContext.Provider, {",
      "        value: context,",
      "        children: rowTree,",
      "      });",
      "    }",
      "",
      "    function isSidebarThreadMenuAdapter(type, props) {",
      "      if (",
      "        type !== native.ThreadMenuAdapter ||",
      '        typeof props?.getItems !== "function"',
      "      ) {",
      "        return false;",
      "      }",
      "      const child = props.children;",
      "      const directRowMenu =",
      "        isElement(child) &&",
      '        typeof child.props?.renderActions === "function" &&',
      '        Object.hasOwn(child.props, "title");',
      "      const childClassName = child?.props?.className;",
      "      const hoverActionsMenu =",
      '        props.trigger === "click" &&',
      '        props.align === "start" &&',
      '        props.contentWidth === "xs" &&',
      "        isElement(child) &&",
      '        child.props?.["aria-haspopup"] === "menu" &&',
      '        typeof childClassName === "string" &&',
      '        childClassName.split(/\\s+/).includes("sidebar-hover-icon-tint");',
      "      return directRowMenu || hoverActionsMenu;",
      "    }",
      "",
      "    function SidebarThreadMenuAdapterBoundary({ child }) {",
      "      const context = React.useContext(sidebarThreadContext);",
      "      const intl = native.useIntl();",
      "      React.useSyncExternalStore(",
      "        subscribeThreadMenu,",
      "        () => threadMenuRenderVersion,",
      "        () => threadMenuRenderVersion,",
      "      );",
      "      if (!context) return child;",
      "      return renderGenericThreadMenu(child, context, intl);",
      "    }",
      "",
      "    function isAssistantSelectionMenu(type, props) {",
      "      return (",
    ),
  }),
  Object.freeze({
    name: "signed-in sidebar JSX interception",
    before: lines(
      "        if (",
      "          (type === native.ThreadMenu || isRemoteThreadMenu(type, props)) &&",
      '          typeof props?.conversationId === "string" &&',
      "          props.conversationId.length > 0",
      "        ) {",
    ),
    after: lines(
      "        if (isExecutionSidebarThreadRow(type, props)) {",
      "          return originalJsx(",
      "            ExecutionSidebarThreadBoundary,",
      "            { child: original(type, props, key) },",
      "            key,",
      "          );",
      "        }",
      "        if (isChatGptSidebarThreadRow(type, props)) {",
      "          return originalJsx(",
      "            SidebarThreadBoundary,",
      "            { child: original(type, props, key) },",
      "            key,",
      "          );",
      "        }",
      "        if (isSidebarThreadMenuAdapter(type, props)) {",
      "          return originalJsx(",
      "            SidebarThreadMenuAdapterBoundary,",
      "            { child: original(type, props, key) },",
      "            key,",
      "          );",
      "        }",
      "        if (",
      "          (type === native.ThreadMenu || isRemoteThreadMenu(type, props)) &&",
      '          typeof props?.conversationId === "string" &&',
      "          props.conversationId.length > 0",
      "        ) {",
    ),
  }),
  Object.freeze({
    name: "sidebar thread React context initialization",
    before: lines(
      "    settingsPageCaptureContext = native.React.createContext(null);",
      "    assistantSelectionPositionContext = native.React.createContext(null);",
      "    installJsxHook();",
    ),
    after: lines(
      "    settingsPageCaptureContext = native.React.createContext(null);",
      "    assistantSelectionPositionContext = native.React.createContext(null);",
      "    sidebarThreadContext = native.React.createContext(null);",
      "    installJsxHook();",
    ),
  }),
  Object.freeze({
    name: "thread menu async transformer engine",
    before: lines(
      "  function computeEffectiveThreadItems(model) {",
      "    synchronizeOpaqueThreadCache(model);",
      "    let items = model.builtInCache;",
      "    for (const { extId, transform } of threadTransformers) {",
      "      try {",
      "        const output = transform(items, model.context);",
      "        if (!Array.isArray(output)) {",
      "          warn(",
      '            "thread-menu transformer from " +',
      "              extId +",
      '              " returned a non-array; skipped",',
      "          );",
      "          continue;",
      "        }",
      "        items = freezeItems(",
      "          normalizeThreadTransformOutput(model, items, output, extId),",
      "        );",
      "      } catch (error) {",
      '        warn("thread-menu transformer from " + extId + " threw; skipped", error);',
      "      }",
      "    }",
      "    return items;",
      "  }",
    ),
    after: lines(
      "  function isThenable(value) {",
      "    return (",
      "      value !== null &&",
      '      (typeof value === "object" || typeof value === "function") &&',
      '      typeof value.then === "function"',
      "    );",
      "  }",
      "",
      "  function computeEffectiveThreadItems(model) {",
      "    synchronizeOpaqueThreadCache(model);",
      "    let items = model.builtInCache;",
      "    for (const { extId, transform } of threadTransformers) {",
      "      try {",
      "        const output = transform(items, model.context);",
      "        if (isThenable(output)) continue;",
      "        if (!Array.isArray(output)) {",
      "          warn(",
      '            "thread-menu transformer from " +',
      "              extId +",
      '              " returned a non-array; skipped",',
      "          );",
      "          continue;",
      "        }",
      "        items = freezeItems(",
      "          normalizeThreadTransformOutput(model, items, output, extId),",
      "        );",
      "      } catch (error) {",
      '        warn("thread-menu transformer from " + extId + " threw; skipped", error);',
      "      }",
      "    }",
      "    return items;",
      "  }",
      "",
      "  async function computeEffectiveThreadItemsAsync(model) {",
      "    synchronizeOpaqueThreadCache(model);",
      "    let items = model.builtInCache;",
      "    for (const { extId, transform } of threadTransformers) {",
      "      try {",
      "        const output = await transform(items, model.context);",
      "        if (!Array.isArray(output)) {",
      "          warn(",
      '            "thread-menu transformer from " +',
      "              extId +",
      '              " returned a non-array; skipped",',
      "          );",
      "          continue;",
      "        }",
      "        items = freezeItems(",
      "          normalizeThreadTransformOutput(model, items, output, extId),",
      "        );",
      "      } catch (error) {",
      '        warn("thread-menu transformer from " + extId + " threw; skipped", error);',
      "      }",
      "    }",
      "    return items;",
      "  }",
    ),
  }),
  Object.freeze({
    name: "thread list owner cache key",
    before: lines(
      "  function computeThreadListItems(context) {",
      "    const items = [];",
      "    for (const registration of threadListRegistrations) {",
      "      let cached = registration.cache.get(context.threadId);",
      "      if (!cached || !sameThreadContext(cached.context, context)) {",
      "        let item;",
      "        try {",
      "          item = normalizeThreadListItem(registration.provider(context));",
      "        } catch (error) {",
      "          warn(",
      "            `thread-list provider of ${registration.extId} threw; skipped`,",
      "            error,",
      "          );",
      "          item = undefined;",
      "        }",
      "        cached = { context, item };",
      "        registration.cache.set(context.threadId, cached);",
      "      }",
      "      if (cached.item) items.push(cached.item);",
      "    }",
      "    return Object.freeze(items);",
      "  }",
    ),
    after: lines(
      '  function computeThreadListItems(context, slot = "title-prefix") {',
      "    const items = [];",
      "    const ownerKey = threadOwnerKey(context);",
      "    for (const registration of threadListRegistrations) {",
      "      if (registration.slot !== slot) continue;",
      "      let cached = registration.cache.get(ownerKey);",
      "      if (!cached || !sameThreadContext(cached.context, context)) {",
      "        let item;",
      "        try {",
      "          item = normalizeThreadListItem(registration.provider(context));",
      "        } catch (error) {",
      "          warn(",
      "            `thread-list provider of ${registration.extId} threw; skipped`,",
      "            error,",
      "          );",
      "          item = undefined;",
      "        }",
      "        cached = { context, item };",
      "        registration.cache.set(ownerKey, cached);",
      "      }",
      "      if (cached.item) items.push(cached.item);",
      "    }",
      "    return Object.freeze(items);",
      "  }",
    ),
  }),
  Object.freeze({
    name: "remove obsolete DOM thread list renderer",
    before: lines(
      "  function refreshThreadListRows() {",
      "    for (const row of document.querySelectorAll(",
      '      "[data-app-action-sidebar-thread-row]",',
      "    )) {",
      "      renderThreadListRow(row);",
      "    }",
      "  }",
    ),
    after: lines(
      "  function refreshThreadListRows() {",
      "    for (const host of document.querySelectorAll(",
      '      "[data-cgptx-thread-list-leading-views]",',
      "    )) {",
      "      const row = host.closest(",
      '        "[data-app-action-sidebar-thread-row]",',
      "      );",
      "      host.remove();",
      "      if (row) mountedThreadListRows.delete(row);",
      "    }",
      "  }",
    ),
  }),
  Object.freeze({
    name: "generic thread model owner key",
    before: lines(
      "  function updateGenericThreadModel(context, rawItems, shortcuts, intl) {",
      "    let model = threadModels.get(context.threadId);",
    ),
    after: lines(
      "  function updateGenericThreadModel(context, rawItems, shortcuts, intl) {",
      "    const modelKey = threadMenuModelKey(context);",
      "    let model = threadModels.get(modelKey);",
    ),
  }),
  Object.freeze({
    name: "generic thread model owner storage",
    before: lines(
      "      threadModels.set(context.threadId, model);",
      "    }",
      "    const views = new Map();",
    ),
    after: lines(
      "      threadModels.set(modelKey, model);",
      "    }",
      "    const views = new Map();",
    ),
  }),
  Object.freeze({
    name: "React thread model owner key",
    before: lines(
      "  function updateThreadModel(context, children) {",
      "    let model = threadModels.get(context.threadId);",
    ),
    after: lines(
      "  function updateThreadModel(context, children) {",
      "    const modelKey = threadMenuModelKey(context);",
      "    let model = threadModels.get(modelKey);",
    ),
  }),
  Object.freeze({
    name: "React thread model owner storage",
    before: lines(
      "      threadModels.set(context.threadId, model);",
      "    }",
      "    model.context = context;",
    ),
    after: lines(
      "      threadModels.set(modelKey, model);",
      "    }",
      "    model.context = context;",
    ),
  }),
  Object.freeze({
    name: "thread list first-party slot",
    before: lines(
      "      registerItem(provider) {",
      '        if (typeof provider !== "function") {',
      '          throw new TypeError("thread-list registerItem requires a function");',
      "        }",
      "        const registration = {",
      "          extId,",
      "          provider,",
      "          cache: new Map(),",
      "        };",
    ),
    after: lines(
      "      registerItem(provider, options = {}) {",
      '        if (typeof provider !== "function") {',
      '          throw new TypeError("thread-list registerItem requires a function");',
      "        }",
      '        const slot = options.slot ?? "title-prefix";',
      "        if (",
      '          slot !== "title-prefix" &&',
      '          slot !== "priority-indicator"',
      "        ) {",
      '          throw new TypeError("thread-list registerItem slot is invalid");',
      "        }",
      "        const registration = {",
      "          extId,",
      "          provider,",
      "          slot,",
      "          cache: new Map(),",
      "        };",
    ),
  }),
  Object.freeze({
    name: "thread list cache invalidation by raw id",
    before: "              registration.cache.delete(threadId);",
    after: lines(
      "              for (const [ownerKey, cached] of registration.cache) {",
      "                if (cached.context.threadId === threadId) {",
      "                  registration.cache.delete(ownerKey);",
      "                }",
      "              }",
    ),
  }),
  Object.freeze({
    name: "ChatGPT thread and account selector exports",
    before: lines(
      "      useIntl: appInitialModule.c2t,",
      "      useScope: appInitialModule.GUt,",
      "      ApplicationScope: appInitialModule.Ezt,",
    ),
    after: lines(
      "      useIntl: appInitialModule.c2t,",
      "      useScope: appInitialModule.GUt,",
      "      useScopeValue: appInitialModule.KUt,",
      "      threadHostIdByConversation: appInitialModule.j2,",
      "      accountState: appInitialModule.uwt,",
      "      ApplicationScope: appInitialModule.Ezt,",
    ),
  }),
  Object.freeze({
    name: "exact UI asset module constants",
    before: lines(
      "  const TOOLBAR_BREADCRUMB_MODULE =",
      '    "./assets/toolbar-breadcrumb-Ccjk7MhE.js";',
      '  const EXTENSIONS_SETTINGS_PANE_ID = "extensions.installed";',
    ),
    after: lines(
      "  const TOOLBAR_BREADCRUMB_MODULE =",
      '    "./assets/toolbar-breadcrumb-Ccjk7MhE.js";',
      "  const HOME_SUGGESTION_SURFACE_MODULE =",
      '    "./assets/home-suggestion-surface-B3IuURqZ.js";',
      "  const HOME_AMBIENT_SUGGESTIONS_MODULE =",
      '    "./assets/home-ambient-suggestions-content-nKYWb4_V.js";',
      "  const HOME_TASK_SUGGESTIONS_MODULE =",
      '    "./assets/home-task-suggestions-CPTOpaBq.js";',
      "  const HOME_ANNOUNCEMENTS_MODULE =",
      '    "./assets/codex-home-announcements-94zV-NAr.js";',
      '  const HOME_BANNER_MODULE = "./assets/banner-DhO5otTB.js";',
      "  const COMPOSER_UTILITY_BAR_MODULE =",
      '    "./assets/composer-utility-bar-DfeW9V5I.js";',
      "  const CHATGPT_MARKDOWN_VIEW_MODULE =",
      '    "./assets/chatgpt-markdown-view-lDB_GnW-.js";',
      "  const CONVERSATION_BLOCKS_MODULE =",
      '    "./assets/conversation-blocks-Bqf2uxPH.js";',
      "  const CLOUD_CONVERSATION_VIEWER_MODULE =",
      '    "./assets/viewer-C8qpsv81.js";',
      '  const EXTENSIONS_SETTINGS_PANE_ID = "extensions.installed";',
    ),
  }),
  Object.freeze({
    name: "exact UI bridge state and engine",
    before: lines(
      "  const transformers = [];",
      "  const assistantSelectionTransformers = [];",
    ),
    after: lines(
      "  const transformers = [];",
      exactUiBridgeSource.trimEnd(),
      "  const assistantSelectionTransformers = [];",
    ),
  }),
  Object.freeze({
    name: "wait for application root before UI chunk imports",
    before: "  async function installNativeBinding() {",
    after: lines(
      "  async function installNativeBinding() {",
      "    const applicationRootDeadline = Date.now() + 30_000;",
      "    while (Date.now() < applicationRootDeadline) {",
      "      if (applicationReactRoot()) break;",
      "      await new Promise((resolve) => setTimeout(resolve, 25));",
      "    }",
      "    if (!applicationReactRoot()) {",
      '      throw new Error("ChatGPT React root did not mount");',
      "    }",
    ),
  }),
  Object.freeze({
    name: "exact UI React boundaries",
    before: lines(
      "    function useNativePostAuthenticationRefresh() {",
      "      nativeApplicationScope = native.useScope(native.ApplicationScope);",
    ),
    after: lines(
      exactUiHookSource.trimEnd(),
      "    function useNativePostAuthenticationRefresh() {",
      "      nativeApplicationScope = native.useScope(native.ApplicationScope);",
    ),
  }),
  Object.freeze({
    name: "exact UI JSX interception",
    before: lines(
      "        if (isAssistantSelectionPositioner(type, props)) {",
      "          props = wrapAssistantSelectionPositionerProps(props);",
      "        }",
    ),
    after: lines(
      "        if (",
      "          isExactContentReferenceDirective(type, props)",
      "        ) {",
      "          return originalJsx(ExactContentReferenceDirective, {",
      "            markdownProps: props,",
      "            directiveProps: props,",
      "            firstParty: type,",
      "          }, key);",
      "        }",
      "        if (",
      "          type === native.StreamingMarkdown &&",
      '          props?.textStyle?.kind === "assistant-message" &&',
      '          typeof props?.children === "string"',
      "        ) {",
      "          return originalJsx(ExactAssistantMarkdownBoundary, {",
      "            type, props, elementKey: key,",
      "          }, key);",
      "        }",
      "        if (type === native.ChatGptCodeBlock) {",
      "          return originalJsx(ExactAssistantCodeBlockBoundary, {",
      "            type, props, elementKey: key,",
      "          }, key);",
      "        }",
      "        if (type === native.LocalConversationItem) {",
      "          return originalJsx(ExactConversationItemBoundary, {",
      '            type, props, elementKey: key, ownerKind: "local",',
      "          }, key);",
      "        }",
      "        if (isExactCloudConversationItemOwner(type, props)) {",
      "          return originalJsx(ExactCloudConversationItemBoundary, {",
      "            type, props, elementKey: key,",
      "          }, key);",
      "        }",
      "        if (isExactHomePageOwner(type, props)) {",
      "          return originalJsx(ExactHomePageBoundary, {",
      "            component: type, props,",
      "          }, key);",
      "        }",
      "        if (type === native.HomeAmbientSuggestionsContent) {",
      "          if (typeof props?.hostId === \"string\") exactHomeHostId = props.hostId;",
      "          if (typeof props?.projectRoot === \"string\") exactHomeProjectRoot = props.projectRoot;",
      "          exactHomePlan = props?.plan === true;",
      "        }",
      "        if (isExactHomeAmbientSuggestionOwner(type, props)) {",
      "          return originalJsx(ExactHomeAmbientSuggestionBoundary, {",
      "            component: type, props, elementKey: key,",
      "          }, key);",
      "        }",
      "        if (type === native.HomeComposerAnnouncements) {",
      "          exactHomeAnnouncementState = {",
      "            entryPoint: props?.entryPoint ?? \"home\",",
      "            homeComposerMode: props?.homeComposerMode ?? \"work\",",
      "            isLocalModeRemote: props?.isLocalModeRemote === true,",
      "          };",
      "        }",
      "        if (type === native.HomeSuggestionSurface && Array.isArray(props?.items)) {",
      "          return originalJsx(ExactUiOwnerBoundary, {",
      '            owner: "suggestions", type, props, elementKey: key,',
      "          }, key);",
      "        }",
      "        if (isExactHomeTaskSuggestionOwner(type, props)) {",
      "          if (typeof props.hostId === \"string\") exactHomeHostId = props.hostId;",
      "          return originalJsx(ExactHomeTaskSuggestionBoundary, {",
      "            component: native.HomeTaskSuggestions, props, elementKey: key,",
      "          }, key);",
      "        }",
      "        if (type === native.HomeBannerController && Array.isArray(props?.entries)) {",
      "          return originalJsx(ExactUiOwnerBoundary, {",
      '            owner: "announcements", type, props, elementKey: key,',
      "          }, key);",
      "        }",
      "        if (isExactSidebarDestinationOwner(type, props)) {",
      "          return originalJsx(ExactUiOwnerBoundary, {",
      '            owner: "sidebar", type, props, elementKey: key,',
      "          }, key);",
      "        }",
      "        if (isExactProductModeOwner(type, props)) {",
      "          return originalJsx(ExactProductModeBoundary, {",
      "            component: type, props,",
      "          }, key);",
      "        }",
      "        if (isExactComposerFooterOwner(type, props)) {",
      "          return originalJsx(ExactUiOwnerBoundary, {",
      '            owner: "composer-footer", type, props, elementKey: key,',
      "          }, key);",
      "        }",
      "        if (type === native.ComposerHomeUtilityBar) {",
      "          return originalJsx(ExactUiOwnerBoundary, {",
      '            owner: "action-bar", type, props, elementKey: key,',
      "          }, key);",
      "        }",
      "        if (isExactComposerUtilityOwner(type, props)) {",
      "          return originalJsx(ExactUiOwnerBoundary, {",
      '            owner: "utility", type, props, elementKey: key,',
      "          }, key);",
      "        }",
      "        if (type === native.Composer.Attachments) {",
      "          return originalJsx(ExactUiOwnerBoundary, {",
      '            owner: "attachments", type, props, elementKey: key,',
      "          }, key);",
      "        }",
      "        if (isAssistantSelectionPositioner(type, props)) {",
      "          props = wrapAssistantSelectionPositionerProps(props);",
      "        }",
    ),
  }),
  Object.freeze({
    name: "exact UI dynamic modules",
    before: lines(
      "      settingsVisibilityModule,",
      "      settingsLoadingModule,",
      "      toolbarBreadcrumbModule,",
      "    ] = await Promise.all([",
    ),
    after: lines(
      "      settingsVisibilityModule,",
      "      settingsLoadingModule,",
      "      toolbarBreadcrumbModule,",
      "      homeSuggestionSurfaceModule,",
      "      homeAmbientSuggestionsModule,",
      "      homeTaskSuggestionsModule,",
      "      homeAnnouncementsModule,",
      "      homeBannerModule,",
      "      composerUtilityBarModule,",
      "      chatgptMarkdownModule,",
      "      conversationBlocksModule,",
      "      cloudConversationViewerModule,",
      "    ] = await Promise.all([",
    ),
  }),
  Object.freeze({
    name: "exact UI dynamic module imports",
    before: lines(
      "      import(SETTINGS_VISIBILITY_MODULE),",
      "      import(SETTINGS_LOADING_MODULE),",
      "      import(TOOLBAR_BREADCRUMB_MODULE),",
      "    ]);",
    ),
    after: lines(
      "      import(SETTINGS_VISIBILITY_MODULE),",
      "      import(SETTINGS_LOADING_MODULE),",
      "      import(TOOLBAR_BREADCRUMB_MODULE),",
      "      import(HOME_SUGGESTION_SURFACE_MODULE),",
      "      import(HOME_AMBIENT_SUGGESTIONS_MODULE),",
      "      import(HOME_TASK_SUGGESTIONS_MODULE),",
      "      import(HOME_ANNOUNCEMENTS_MODULE),",
      "      import(HOME_BANNER_MODULE),",
      "      import(COMPOSER_UTILITY_BAR_MODULE),",
      "      import(CHATGPT_MARKDOWN_VIEW_MODULE),",
      "      import(CONVERSATION_BLOCKS_MODULE),",
      "      import(CLOUD_CONVERSATION_VIEWER_MODULE),",
      "    ]);",
    ),
  }),
  Object.freeze({
    name: "exact UI module initialization",
    before: lines(
      "    toolbarBreadcrumbModule.n();",
      "    plusIconModule.t();",
    ),
    after: lines(
      "    toolbarBreadcrumbModule.n();",
      "    homeSuggestionSurfaceModule.n();",
      "    homeAnnouncementsModule.r();",
      "    homeBannerModule.n();",
      "    chatgptMarkdownModule.n();",
      "    conversationBlocksModule.p();",
      "    cloudConversationViewerModule.i();",
      "    plusIconModule.t();",
    ),
  }),
  Object.freeze({
    name: "exact UI native exports",
    before: lines(
      "      ThreadMenu: threadMenuModule.t,",
      "      ColorPicker: appInitialModule.us,",
      "      startChatGptSignIn: authModule.o,",
    ),
    after: lines(
      "      ThreadMenu: threadMenuModule.t,",
      "      ColorPicker: appInitialModule.us,",
      "      HomeSuggestionSurface: homeSuggestionSurfaceModule.t,",
      "      HomeAmbientSuggestionsContent:",
      "        homeAmbientSuggestionsModule.HomeAmbientSuggestionsContent,",
      "      HomeTaskSuggestions: homeTaskSuggestionsModule.HomeTaskSuggestions,",
      "      HomeComposerAnnouncements: homeAnnouncementsModule.t,",
      "      HomeBannerController: homeBannerModule.t,",
      "      Banner: appInitialModule.EL,",
      "      Composer: appInitialModule.iB,",
      "      ComposerHomeUtilityBar: appInitialModule.oB,",
      "      ComposerUtilityBar: composerUtilityBarModule.ComposerUtilityBar,",
      "      NativeButton: appInitialModule.ott,",
      "      SidebarRow: appInitialModule.yp,",
      "      Tooltip: appInitialModule.oet,",
      "      StreamingMarkdown: appInitialModule.rC,",
      "      ChatGptMarkdownView: chatgptMarkdownModule.t,",
      "      contentReferenceDirectiveName: appInitialModule.TSt,",
      "      TurnContext: appInitialModule.QE,",
      "      useCurrentTurnContext: appInitialModule.eD,",
      "      ReactDOMPortal: appInitialModule.B2t(),",
      "      contentReferenceIndex: chatgptMarkdownModule.w,",
      "      ChatGptCodeBlock: appInitialModule.Iw,",
      "      LocalConversationItem: conversationBlocksModule.f,",
      "      CloudConversationTurn: cloudConversationViewerModule.r,",
      "      startChatGptSignIn: authModule.o,",
    ),
  }),
  Object.freeze({
    name: "native close icon",
    before: '        ["settings", appInitialModule.bot],',
    after: lines(
      '        ["settings", appInitialModule.bot],',
      '        ["x", appInitialModule.J9],',
    ),
  }),
  Object.freeze({
    name: "exact UI legacy API",
    before: lines(
      "      appearance: makeAppearanceApi(extId),",
      "      settings: makeSettingsApi(extId),",
      "    });",
    ),
    after: lines(
      "      appearance: makeAppearanceApi(extId),",
      "      settings: makeSettingsApi(extId),",
      "      ui: makeExactUiApi(extId),",
      "    });",
    ),
  }),
  Object.freeze({
    name: "rich content binding diagnostics",
    before: lines(
      "      captureDynamicThreadItemsFromOpenMenus,",
      "      nativeReady: () => nativeBindingInstalled,",
      "      nativeBindingError: () => nativeBindingError,",
    ),
    after: lines(
      "      captureDynamicThreadItemsFromOpenMenus,",
      "      primaryAppShellReady,",
      "      richContentOwnerHits: () => Object.freeze({ ...exactRichOwnerHits }),",
      "      richContentLifecycle: () => Object.freeze({",
      "        mounts: Object.freeze({ ...exactRichLifecycle.mounts }),",
      "        disposals: Object.freeze({ ...exactRichLifecycle.disposals }),",
      "      }),",
      "      richContentFallbacks: () => Object.freeze({",
      "        assistantDirective: Object.freeze({",
      "          unregistered: exactRichFallbackStatus('assistantDirective', 'unregistered'),",
      "          rendererError: exactRichFallbackStatus('assistantDirective', 'rendererError'),",
      "        }),",
      "        assistantContentReference: Object.freeze({",
      "          nonMatch: exactRichFallbackStatus('assistantContentReference', 'nonMatch'),",
      "          matcherError: exactRichFallbackStatus('assistantContentReference', 'matcherError'),",
      "          rendererError: exactRichFallbackStatus('assistantContentReference', 'rendererError'),",
      "        }),",
      "        assistantCodeBlock: Object.freeze({",
      "          nonMatch: exactRichFallbackStatus('assistantCodeBlock', 'nonMatch'),",
      "          matcherError: exactRichFallbackStatus('assistantCodeBlock', 'matcherError'),",
      "          rendererError: exactRichFallbackStatus('assistantCodeBlock', 'rendererError'),",
      "        }),",
      "        conversationItemLocal: Object.freeze({",
      "          nonMatch: exactRichFallbackStatus('conversationItemLocal', 'nonMatch'),",
      "          matcherError: exactRichFallbackStatus('conversationItemLocal', 'matcherError'),",
      "          rendererError: exactRichFallbackStatus('conversationItemLocal', 'rendererError'),",
      "        }),",
      "        conversationItemCloud: Object.freeze({",
      "          nonMatch: exactRichFallbackStatus('conversationItemCloud', 'nonMatch'),",
      "          matcherError: exactRichFallbackStatus('conversationItemCloud', 'matcherError'),",
      "          rendererError: exactRichFallbackStatus('conversationItemCloud', 'rendererError'),",
      "        }),",
      "      }),",
      "      richContentRegistrationCounts: () => Object.freeze({",
      "        assistantDirective:",
      "          exactRichContentRegistrations.assistantDirective.length,",
      "        assistantContentReference:",
      "          exactRichContentRegistrations.assistantContentReference.length,",
      "        assistantCodeBlock:",
      "          exactRichContentRegistrations.assistantCodeBlock.length,",
      "        conversationItem:",
      "          exactRichContentRegistrations.conversationItem.length,",
      "      }),",
      "      richContentOwnerDrift: () => exactCloudConversationItemOwnerDrift,",
      "      cloudConversationItemOwnerReady: () =>",
      "        typeof exactCloudConversationItemOwner === \"function\",",
      "      mountRichContentProbe: () => mountExactRichContentProbe?.() ?? false,",
      "      unmountRichContentProbe: () => unmountExactRichContentProbe?.() ?? false,",
      "      runProductExtensionProbe: () => {",
      "        if (typeof runExactProductExtensionProbe !== \"function\") {",
      "          return Promise.reject(new Error(\"The product extension probe is unavailable\"));",
      "        }",
      "        return runExactProductExtensionProbe();",
      "      },",
      "      runProductExtensionRealUiProbe: () => {",
      "        if (typeof runExactProductExtensionRealUiProbe !== \"function\") {",
      "          return Promise.reject(new Error(\"The real product extension UI probe is unavailable\"));",
      "        }",
      "        return runExactProductExtensionRealUiProbe();",
      "      },",
      "      nativeReady: () => nativeBindingInstalled,",
      "      nativeBindingError: () => nativeBindingError,",
    ),
  }),
]);

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function occurrenceCount(source, value) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(value, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + value.length;
  }
}

function patchBindingHostSource(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("Binding host patch options are required");
  }
  const { appVersion, appBuild, originalDigest, source } = options;
  if (appVersion !== targetAppVersion || appBuild !== targetAppBuild) {
    throw new Error(
      `The binding host patch supports only ChatGPT ${targetAppVersion} (${targetAppBuild})`,
    );
  }
  if (typeof source !== "string") {
    throw new TypeError("Binding host source must be a string");
  }
  if (!/^[a-f0-9]{64}$/.test(originalDigest ?? "")) {
    throw new TypeError("The original binding host digest is invalid");
  }
  const actualOriginalDigest = sha256(source);
  if (actualOriginalDigest !== originalDigest) {
    throw new Error("The binding host source no longer matches its validated digest");
  }
  if (occurrenceCount(source, `version: "${targetAppVersion}"`) !== 1) {
    throw new Error("The exact binding host version marker must occur once");
  }
  for (const patch of patches) {
    const count = occurrenceCount(source, patch.before);
    if (count !== 1) {
      throw new Error(`Binding host patch anchor ${patch.name} occurred ${count} times`);
    }
  }

  let patchedSource = source;
  for (const patch of patches) {
    patchedSource = patchedSource.replace(patch.before, patch.after);
  }
  return Object.freeze({
    source: patchedSource,
    digest: sha256(patchedSource),
  });
}

module.exports = Object.freeze({
  patchBindingHostSource,
});
