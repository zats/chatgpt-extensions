import type {
  AssistantSelectionActionContext,
  AssistantSelectionActionItem,
  AssistantCodeBlockDefinition,
  AssistantCodeBlockUiContext,
  AssistantContentReferenceDefinition,
  AssistantContentReferenceUiContext,
  AssistantDirectiveDefinition,
  AssistantDirectiveUiContext,
  CapabilityId,
  CapabilityOptions,
  CapabilityScope,
  CapabilitySnapshot,
  CapabilityStatus,
  ChatGPTXApi,
  CommandContext,
  CommandDefinition,
  ComposerActionDefinition,
  ComposerState,
  ComposerUtilityContext,
  ConversationItemRendererDefinition,
  ConversationItemUiContext,
  Disposable,
  EventSubscriptionOptions,
  ExtensionIdentity,
  ExtensionMessage,
  HeaderCssProperties,
  HomeAnnouncementActionItem,
  HomeAnnouncementContext,
  HomeAnnouncementItem,
  HomeSuggestionContext,
  HomeSuggestionItem,
  InstalledExtension,
  JsonObject,
  JsonValue,
  NativeSettingsControlsSectionDefinition,
  ProductModeMenuContext,
  ProductModeMenuItem,
  RequestOptions,
  RendererExtensionContext,
  RuntimeInfo,
  SettingReadOptions,
  SettingsOpenOptions,
  SettingsSectionDefinition,
  SettingChange,
  SettingControl,
  SettingsScope,
  SettingWriteOptions,
  SidebarDestinationContext,
  SidebarDestinationItem,
  SidebarThreadRowContext,
  ThreadHeaderContext,
  ThreadHeaderMenuItem,
  ThreadSummary,
  UiActivation,
  UiActionItem,
  UiIcon,
  UiListItem,
  UiMenuItem,
  UiOpaqueItem,
  UiOwnerContext,
  UiRegistration,
  UiRenderProvider,
  WindowId,
} from "@chatgptx/api";

import { createExtensionStorage } from "../../extension-storage.ts";

interface LegacyDisposable {
  dispose(): void;
}

interface LegacyInvalidatableRegistration extends LegacyDisposable {
  invalidate?(ownerId?: string): void;
}

interface LegacyUiOwnerContext {
  readonly ownerId: string;
  readonly mode?: "chatgpt" | "work" | "codex";
  readonly composerMode?: "chat" | "work";
  readonly homeComposerMode?: "chat" | "work";
  readonly kind?: "main" | "quick-chat" | "side-chat";
  readonly focused?: boolean;
  readonly disabled?: boolean;
  readonly workModeAccess?: "chatgpt" | "chatgpt_work" | "work";
  readonly hostId?: string;
  readonly projectRoot?: string;
  readonly plan?: boolean;
  readonly layout?: "cards" | "list";
  readonly entryPoint?: string;
  readonly isLocalModeRemote?: boolean;
  readonly onboardingPromosHidden?: boolean;
  readonly selectedDestination?: SidebarDestinationContext["selectedDestination"];
  readonly selectedDestinationId?: string;
  readonly composer?: ComposerState;
}

interface LegacyAssistantContentContext extends LegacyUiOwnerContext {
  readonly scope: "execution" | "cloud";
  readonly conversationId: string;
  readonly messageId?: string;
  readonly turnId?: string;
  readonly accountId?: string;
  readonly workspaceId?: string;
  readonly streaming: boolean;
}

interface LegacyAssistantDirectiveContext extends LegacyAssistantContentContext {
  readonly directive: {
    readonly name: string;
    readonly kind: "leaf" | "container";
    readonly attributes: Readonly<Record<string, string>>;
    readonly directiveId?: string;
    readonly terminalInline: boolean;
    readonly content?: string;
  };
}

interface LegacyAssistantContentReferenceContext
  extends LegacyAssistantContentContext {
  readonly reference: {
    readonly type: string;
    readonly data: JsonObject;
  };
  readonly index: number;
  readonly terminalInline: boolean;
}

interface LegacyAssistantCodeBlockContext extends LegacyAssistantContentContext {
  readonly codeBlock: {
    readonly index: number;
    readonly language?: string;
    readonly content: string;
    readonly fenceOpen: boolean;
    readonly info?: string;
  };
}

interface LegacyConversationItemContext extends LegacyUiOwnerContext {
  readonly scope: "execution" | "cloud";
  readonly conversationId: string;
  readonly turnId?: string;
  readonly accountId?: string;
  readonly workspaceId?: string;
  readonly item: JsonObject;
  readonly itemType: string;
  readonly itemLayout: "standalone" | "grouped";
}

interface LegacyUiActionItem {
  readonly kind: "action" | "destination" | "separator";
  readonly id: string;
  readonly label?: string;
  readonly description?: string;
  readonly tooltip?: string;
  readonly icon?: unknown;
  readonly listIcon?: unknown;
  readonly rightIcon?: unknown;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly keybinding?: string;
  readonly keyboardShortcut?: string;
  readonly message?: string;
  readonly subText?: string;
  readonly href?: string;
  readonly items?: readonly LegacyUiActionItem[];
  readonly onClick?: (activation?: LegacyActivation) => void | Promise<void>;
  readonly onDismiss?: (activation?: LegacyActivation) => void | Promise<void>;
  readonly origin?: "app" | string;
  readonly destination?: SidebarDestinationItem["destination"];
  readonly railIcon?: unknown;
  readonly animatedIcon?: unknown;
  readonly customizable?: boolean;
  readonly defaultLocation?: "sidebar" | "explore";
  readonly visibleByDefault?: boolean;
  readonly hasUnreadActivity?: boolean;
  readonly isActive?: boolean;
  readonly isCurrentDestination?: boolean;
  readonly onPrefetch?: () => void | Promise<void>;
}

interface LegacyAnnouncementDescriptor {
  readonly kind: "announcement";
  readonly id: string;
  readonly isEligible: boolean;
  readonly isLoading?: boolean;
  readonly title: string;
  readonly label?: string;
  readonly description?: string;
  readonly leadingVisual?: unknown;
  readonly primaryAction?: LegacyUiActionItem;
  readonly dismissAction?: LegacyUiActionItem;
  readonly origin?: "app" | string;
}

interface LegacyOpaqueAnnouncementItem {
  readonly kind: "opaque";
  readonly id: string;
  readonly label?: string;
  readonly origin?: "app" | string;
}

type LegacyAnnouncementItem =
  | LegacyAnnouncementDescriptor
  | LegacyOpaqueAnnouncementItem;

interface LegacyUiApi {
  transformSuggestions(
    transform: (
      items: readonly LegacyUiActionItem[],
      context: LegacyUiOwnerContext,
    ) => readonly LegacyUiActionItem[],
  ): LegacyInvalidatableRegistration;
  transformAnnouncements(
    transform: (
      items: readonly LegacyAnnouncementItem[],
      context: LegacyUiOwnerContext,
    ) => readonly LegacyAnnouncementItem[],
  ): LegacyInvalidatableRegistration;
  transformSidebarDestinations(
    transform: (
      items: readonly LegacyUiActionItem[],
      context: LegacyUiOwnerContext,
    ) => readonly LegacyUiActionItem[],
  ): LegacyInvalidatableRegistration;
  transformProductModeMenu(
    transform: (
      items: readonly LegacyUiActionItem[],
      context: LegacyUiOwnerContext,
    ) => readonly LegacyUiActionItem[],
  ): LegacyInvalidatableRegistration;
  registerRender(
    point: string,
    provider: (
      context: LegacyUiOwnerContext,
    ) => { readonly view: () => HTMLElement } | undefined,
  ): LegacyInvalidatableRegistration;
  registerComposerAction(definition: {
    readonly id: string;
    readonly placement: ComposerActionDefinition["placement"];
    readonly label: string;
    readonly icon?: unknown;
    readonly tooltip?: string;
    readonly order?: number;
    readonly isVisible?: (context: LegacyUiOwnerContext) => boolean;
    readonly isDisabled?: (context: LegacyUiOwnerContext) => boolean;
    readonly menuItems?: readonly LegacyUiActionItem[];
    readonly onClick: (
      context: LegacyUiOwnerContext,
      activation?: LegacyActivation,
    ) => void | Promise<void>;
    readonly origin: string;
  }): LegacyInvalidatableRegistration;
  registerAssistantDirective(definition: {
    readonly id: string;
    readonly name: string;
    readonly matches?: (context: LegacyAssistantDirectiveContext) => boolean;
    readonly provider: RichContentProvider<LegacyAssistantDirectiveContext>;
  }): LegacyInvalidatableRegistration;
  registerAssistantContentReference(definition: {
    readonly id: string;
    readonly type: string;
    readonly matches?: (
      context: LegacyAssistantContentReferenceContext,
    ) => boolean;
    readonly provider: RichContentProvider<LegacyAssistantContentReferenceContext>;
  }): LegacyInvalidatableRegistration;
  registerAssistantCodeBlock(definition: {
    readonly id: string;
    readonly language?: string;
    readonly matches?: (context: LegacyAssistantCodeBlockContext) => boolean;
    readonly provider: RichContentProvider<LegacyAssistantCodeBlockContext>;
  }): LegacyInvalidatableRegistration;
  registerConversationItem(definition: {
    readonly id: string;
    readonly type: string;
    readonly matches?: (context: LegacyConversationItemContext) => boolean;
    readonly provider: RichContentProvider<LegacyConversationItemContext>;
  }): LegacyInvalidatableRegistration;
}

type RichContentProvider<TContext> = (
  context: TContext,
  container: HTMLElement,
) => LegacyDisposable | undefined;

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

interface LegacyActivation {
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly controlKey?: boolean;
}

interface LegacyMenuItem {
  readonly kind: "action" | "separator";
  readonly id: string;
  readonly label?: string;
  readonly icon?: unknown;
  readonly rightIcon?: unknown;
  readonly subText?: string;
  readonly keyboardShortcut?: string;
  readonly disabled?: boolean;
  readonly onClick?: (activation?: LegacyActivation) => void;
  readonly items?: readonly LegacyMenuItem[];
  readonly origin?: "app" | string;
}

interface LegacyAssistantSelectionContext {
  readonly selectedText: string;
  createResponseAnnotation(
    annotation: string,
    options?: { readonly submit?: boolean },
  ): Promise<void>;
}

interface LegacyAssistantSelectionItem {
  readonly kind: "action";
  readonly id: string;
  readonly label: string;
  readonly placement?: "above" | "below";
  readonly labelScale?: 1 | 2;
  readonly verticalPadding?: 0 | 4;
  readonly disabled?: boolean;
  readonly onClick?: (activation: LegacyActivation) => void;
  readonly items?: readonly LegacyAssistantSelectionItem[];
  readonly origin?: "app" | string;
}

interface LegacyThreadListRegistration extends LegacyDisposable {
  invalidate(threadId?: string): void;
}

interface LegacySettingsRegistration extends LegacyDisposable {
  invalidate(): void;
}

interface LegacySettingsCategory {
  readonly id: string;
  readonly panes: readonly LegacySettingsPane[];
  readonly [key: string]: unknown;
}

interface LegacySettingsPane {
  readonly id: string;
  readonly label: string;
  readonly title?: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
}

interface LegacySettingsGroup {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly footer?: string;
  readonly keywords?: readonly string[];
  readonly items: readonly LegacySettingsItem[];
}

interface LegacySettingsItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly destination?: {
    readonly paneId: string;
    readonly itemId?: string;
  };
  readonly control?: unknown;
}

interface LegacyPlatformApi {
  readonly ui: LegacyUiApi;
  readonly appearance: {
    readonly header: {
      registerProperties(properties: HeaderCssProperties): {
        update(properties: HeaderCssProperties): void;
        dispose(): void;
      };
      getProperties(): Readonly<Record<string, string>>;
    };
    getColorScheme(): "light" | "dark";
    openColorPicker(options: {
      readonly initialColor: `#${string}`;
      readonly title: string;
      readonly onChange: (color: `#${string}`) => void;
    }): {
      readonly result: Promise<`#${string}` | undefined>;
      dispose(): void;
    };
  };
  readonly menus: {
    readonly assistantSelection: {
      transformItems(
        transform: (
          items: readonly LegacyAssistantSelectionItem[],
          context: LegacyAssistantSelectionContext,
        ) => readonly LegacyAssistantSelectionItem[],
      ): LegacyDisposable;
    };
    readonly thread: {
      transformItems(
        transform: (
          items: readonly LegacyMenuItem[],
          thread: LegacyThread,
        ) =>
          | readonly LegacyMenuItem[]
          | Promise<readonly LegacyMenuItem[]>,
      ): LegacyDisposable;
    };
  };
  readonly threads: {
    readonly list: {
      registerItem(
        provider: (
          thread: LegacyThread,
        ) => { readonly view: () => HTMLElement } | undefined,
        options?: {
          readonly slot?: "title-prefix" | "priority-indicator";
        },
      ): LegacyThreadListRegistration;
    };
    getCurrent(): LegacyThread | undefined;
    subscribe(
      listener: (thread: LegacyThread | undefined) => void,
    ): LegacyDisposable;
  };
  readonly settings: {
    readonly ui: {
      toggle(options: {
        readonly checked: boolean;
        readonly disabled?: boolean;
        readonly onChange: (checked: boolean) => void | Promise<void>;
      }): unknown;
      select(options: {
        readonly value?: string;
        readonly placeholder?: string;
        readonly options: readonly {
          readonly value: string;
          readonly label: string;
          readonly disabled?: boolean;
        }[];
        readonly disabled?: boolean;
        readonly onChange: (value: string) => void | Promise<void>;
      }): unknown;
      button(options: {
        readonly label: string;
        readonly appearance?: "primary" | "secondary" | "danger";
        readonly disabled?: boolean;
        readonly onClick: () => void | Promise<void>;
      }): unknown;
      textField(options: {
        readonly value: string;
        readonly placeholder?: string;
        readonly disabled?: boolean;
        readonly onChange: (value: string) => void | Promise<void>;
      }): unknown;
    };
    transformCategories(
      transform: (
        categories: readonly LegacySettingsCategory[],
      ) => readonly LegacySettingsCategory[],
    ): LegacySettingsRegistration;
    transformGroups(
      transform: (
        groups: readonly LegacySettingsGroup[],
        pane: LegacySettingsPane,
      ) => readonly LegacySettingsGroup[],
    ): LegacySettingsRegistration;
    transformItems(
      transform: (
        items: readonly LegacySettingsItem[],
        context: { readonly group: LegacySettingsGroup },
      ) => readonly LegacySettingsItem[],
    ): LegacySettingsRegistration;
    open(paneId: string, options?: { readonly itemId?: string }): Promise<boolean>;
  };
}

interface RendererModule {
  activate(context: RendererExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

interface AdapterIdentity {
  readonly id: string;
  readonly version: string;
  readonly manifestDigest: string;
}

interface SettingsHub {
  readonly extensionId: string;
  readonly storage: ReturnType<typeof createExtensionStorage>;
  readonly listeners: Set<(change: SettingChange) => void>;
  readonly invalidators: Set<() => void>;
  readonly values: Record<string, JsonValue>;
  readonly textDrafts: Map<
    string,
    {
      readonly settingKey?: string;
      readonly defaultValue: string;
      value: string;
    }
  >;
  readonly sourceId: string;
  channel?: BroadcastChannel;
  load?: Promise<void>;
  operations: Promise<void>;
  revision: number;
}

interface ActiveEntry {
  readonly controller: AbortController;
  readonly disposables: Set<Disposable>;
}

interface RegisteredCommand {
  readonly id: string;
  readonly definition: CommandDefinition;
}

interface AdapterGlobalState {
  readonly documentId: string;
  readonly windowId: string;
  readonly active: Map<string, ActiveEntry>;
  readonly commands: Map<string, RegisteredCommand>;
  readonly settings: Map<string, SettingsHub>;
  sequence: number;
}

const globalStateKey = Symbol.for("chatgptx.v5.exact-build-adapter.26.825.32147");
const settingsFile = "chatgptx-settings.json";
const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/;

const threadBuiltInIds = new Map<string, `app.${string}`>([
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
  ["handoff", "app.handoff"],
]);

const selectionBuiltInIds = new Map<string, `app.${string}`>([
  ["selectedTextOverlay.addToCodex", "app.add-to-chat"],
  ["selectedTextOverlay.moreDetails", "app.more-details"],
  ["selectedTextOverlay.askInSideChat", "app.ask-in-side-chat"],
]);

const homeSuggestionBuiltInIds = new Set([
  "codex-explore",
  "codex-create",
  "codex-review",
  "codex-fix",
]);

const productModeBuiltInIds = new Set(["app.work", "app.codex"]);

const sidebarBuiltInIds = new Set([
  "app.archive",
  "app.automations",
  "app.debug",
  "app.finance",
  "app.library",
  "app.projects",
  "app.pull-requests",
  "app.security",
  "app.sites",
  "app.skills",
]);

function isSidebarBuiltInId(id: string): boolean {
  return sidebarBuiltInIds.has(id) || id.startsWith("app.mcp:");
}

const listPointIds = [
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

const renderPointIds = [
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

const definitionKinds = [
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

const asynchronousListPoints = new Set<string>([
  "sidebar.thread-row.menu",
  "profile.menu",
]);

const availableListPoints = new Set<string>([
  "home.new-chat-suggestions",
  "home.announcements",
  "assistant-selection.actions",
  "thread.header.menu",
  "sidebar.destinations",
  "sidebar.product-mode.menu",
  "sidebar.thread-row.menu",
]);
const availableRenderPoints = new Set<string>([
  "sidebar.thread-row.title-prefix",
  "sidebar.thread-row.priority-indicator",
  "composer.footer.leading",
  "composer.footer.trailing",
  "composer.action-bar.leading",
  "composer.action-bar.trailing",
  "composer.utility.leading",
  "composer.utility.trailing",
  "composer.attachments",
]);
const availableDefinitionKinds = new Set<string>([
  "assistant-code-block",
  "assistant-content-reference",
  "assistant-directive",
  "command",
  "conversation-item",
  "composer-action",
  "settings-section",
]);

const nativeSettingsControlTypes = [
  "toggle",
  "text",
  "select",
  "button",
] as const satisfies readonly SettingControl["type"][];
const nativeSettingsControlTypeSet = new Set<string>(nativeSettingsControlTypes);
const nativeSettingsGroups = new Set([
  "personal",
  "integrations",
  "coding",
  "archived",
]);
const builtInSettingsSectionIds = new Set([
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
  "worktrees",
]);

const builtInCapabilityIds = [
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
  "workspaces.read",
] as const satisfies readonly CapabilityId[];

const availableCapabilityOperations = new Map<CapabilityId, readonly string[]>([
  ["appearance.color-picker", ["openColorPicker"]],
  ["appearance.read", ["getColorScheme", "header.getProperties"]],
  ["appearance.write", ["header.registerProperties"]],
  ["runtime.info", ["getInfo"]],
  ["settings.read", ["get", "events", "open"]],
  ["settings.write", ["set", "delete", "batch"]],
  ["threads.read", ["getCurrent", "events"]],
  ["ui.contribute", ["transform", "render", "register"]],
]);

interface SettingsBroadcast {
  readonly sourceId: string;
  readonly key: string;
  readonly deleted: boolean;
  readonly value?: JsonValue;
}

function randomId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function adapterState(): AdapterGlobalState {
  const root = globalThis as typeof globalThis & {
    [globalStateKey]?: AdapterGlobalState;
  };
  const runtimeDocument = globalThis.__CGPTX_RUNTIME__?.document;
  root[globalStateKey] ??= {
    documentId: runtimeDocument?.id ?? randomId("document"),
    windowId: runtimeDocument?.windowId ?? randomId("window"),
    active: new Map(),
    commands: new Map(),
    settings: new Map(),
    sequence: 0,
  };
  return root[globalStateKey];
}

function threadRef(thread: LegacyThread) {
  if (thread.scope === "cloud") {
    if (typeof thread.accountId !== "string" || thread.accountId.length === 0) {
      return unsupported("ChatGPT account identity for a cloud thread");
    }
    return {
      scope: "cloud" as const,
      accountId: thread.accountId,
      ...(typeof thread.workspaceId === "string" && thread.workspaceId.length > 0
        ? { workspaceId: thread.workspaceId }
        : {}),
      threadId: thread.threadId,
    };
  }
  if (typeof thread.hostId !== "string" || thread.hostId.length === 0) {
    return unsupported("ChatGPT thread host identity");
  }
  return {
    scope: "execution" as const,
    hostId: thread.hostId,
    threadId: thread.threadId,
  };
}

function threadOwnerId(thread: LegacyThread): string {
  const ref = threadRef(thread);
  return ref.scope === "cloud"
    ? JSON.stringify([
        ref.scope,
        ref.accountId,
        ref.workspaceId ?? null,
        ref.threadId,
      ])
    : JSON.stringify([ref.scope, ref.hostId, ref.threadId]);
}

function threadSummary(thread: LegacyThread): ThreadSummary {
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
    operations: Object.freeze([]),
  });
}

function sameThreadIdentity(
  left: LegacyThread | undefined,
  right: LegacyThread,
): boolean {
  return left !== undefined && threadOwnerId(left) === threadOwnerId(right);
}

function activation(value?: LegacyActivation): UiActivation {
  return Object.freeze({
    source: "unknown",
    ...(value?.metaKey === undefined ? {} : { metaKey: value.metaKey }),
    ...(value?.shiftKey === undefined ? {} : { shiftKey: value.shiftKey }),
    ...(value?.altKey === undefined ? {} : { altKey: value.altKey }),
    ...(value?.controlKey === undefined
      ? {}
      : { controlKey: value.controlKey }),
  });
}

function legacyActivation(value: UiActivation): LegacyActivation {
  return Object.freeze({
    ...(value.metaKey === undefined ? {} : { metaKey: value.metaKey }),
    ...(value.shiftKey === undefined ? {} : { shiftKey: value.shiftKey }),
    ...(value.altKey === undefined ? {} : { altKey: value.altKey }),
    ...(value.controlKey === undefined
      ? {}
      : { controlKey: value.controlKey }),
  });
}

function headerContext(thread: LegacyThread): ThreadHeaderContext {
  const state = adapterState();
  return Object.freeze({
    kind: "thread",
    ownerId: threadOwnerId(thread),
    windowId: state.windowId,
    thread: threadSummary(thread),
  });
}

function sidebarThreadRowContext(thread: LegacyThread): SidebarThreadRowContext {
  const state = adapterState();
  return Object.freeze({
    ownerId: threadOwnerId(thread),
    windowId: state.windowId,
    thread: threadSummary(thread),
    selected: thread.selected ?? false,
  });
}

type ThreadMenuOwnerContext = ThreadHeaderContext | SidebarThreadRowContext;
type PublicThreadMenuItem =
  | ThreadHeaderMenuItem
  | UiMenuItem<SidebarThreadRowContext>;

interface LegacyItemMapping<TItem> {
  readonly rawByPublicId: Map<string, TItem>;
  opaqueSequence: number;
}

function isAppOwned(origin: LegacyMenuItem["origin"]): boolean {
  return origin === undefined || origin === "app";
}

function opaqueItem<TItem extends { readonly label?: string }>(
  item: TItem,
  mapping: LegacyItemMapping<TItem>,
): UiOpaqueItem {
  let id: string;
  do {
    mapping.opaqueSequence += 1;
    id = `app.opaque:${mapping.opaqueSequence}`;
  } while (mapping.rawByPublicId.has(id));
  mapping.rawByPublicId.set(id, item);
  return Object.freeze({
    kind: "opaque",
    id,
    ...(item.label === undefined ? {} : { label: item.label }),
    origin: "app",
  });
}

function publicThreadMenuItem(
  item: LegacyMenuItem,
  context: ThreadMenuOwnerContext,
  mapping: LegacyItemMapping<LegacyMenuItem>,
): PublicThreadMenuItem {
  const appOwned = isAppOwned(item.origin);
  const stableId = appOwned ? threadBuiltInIds.get(item.id) : undefined;
  if (item.kind === "separator") {
    let id: string;
    do {
      mapping.opaqueSequence += 1;
      id = `app.separator:${mapping.opaqueSequence}`;
    } while (mapping.rawByPublicId.has(id));
    mapping.rawByPublicId.set(id, item);
    return Object.freeze({
      kind: "separator",
      id,
      origin: appOwned ? "app" : `extension:${item.origin}`,
    });
  }
  if (appOwned && stableId === undefined) {
    return opaqueItem(item, mapping);
  }
  const id = stableId ?? item.id;
  if (mapping.rawByPublicId.has(id)) return opaqueItem(item, mapping);
  mapping.rawByPublicId.set(id, item);
  return Object.freeze({
    kind: "action",
    id,
    label: item.label ?? id,
    ...(item.icon === undefined ? {} : { icon: item.icon }),
    ...(item.rightIcon === undefined ? {} : { rightIcon: item.rightIcon }),
    ...(item.subText === undefined ? {} : { subText: item.subText }),
    ...(item.keyboardShortcut === undefined
      ? {}
      : { keybinding: item.keyboardShortcut }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.items === undefined
      ? {}
      : {
          items: item.items.map((child) =>
            publicThreadMenuItem(child, context, mapping),
          ),
        }),
    ...(item.onClick === undefined
      ? {}
      : {
          onActivate: (_owner: ThreadMenuOwnerContext, next: UiActivation) =>
            item.onClick?.(legacyActivation(next)),
        }),
    origin: appOwned ? "app" : `extension:${item.origin}`,
  } as unknown as PublicThreadMenuItem);
}

function legacyThreadMenuItem(
  item: PublicThreadMenuItem,
  context: ThreadMenuOwnerContext,
  extensionId: string,
  mapping: LegacyItemMapping<LegacyMenuItem>,
): LegacyMenuItem {
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
  const existingAction = existing?.kind === "action" ? existing : undefined;
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
    ...(icon === undefined ? {} : { icon }),
    ...(rightIcon === undefined ? {} : { rightIcon }),
    ...(subText === undefined ? {} : { subText }),
    ...(keyboardShortcut === undefined ? {} : { keyboardShortcut }),
    ...(disabled === undefined ? {} : { disabled }),
    ...(children === undefined
      ? {}
      : {
          items: children.map((child) =>
            legacyThreadMenuItem(
              child as PublicThreadMenuItem,
              context,
              extensionId,
              mapping,
            ),
          ),
        }),
    ...(item.onActivate === undefined && existingAction?.onClick === undefined
      ? {}
      : item.onActivate === undefined
        ? { onClick: existingAction!.onClick }
      : {
          onClick: (next?: LegacyActivation) => {
            const onActivate = item.onActivate as
              | ((
                  owner: ThreadMenuOwnerContext,
                  activation: UiActivation,
                ) => void)
              | undefined;
            onActivate?.(context, activation(next));
          },
        }),
  };
}

function selectionContext(
  context: LegacyAssistantSelectionContext,
  currentThread: LegacyThread | undefined,
): AssistantSelectionActionContext {
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
    startedAt: new Date().toISOString(),
    createResponseAnnotation: (
      annotation: string,
      options?: { readonly submit?: boolean },
    ) =>
      context.createResponseAnnotation(annotation, options),
  });
}

function selectionTreeHasUnmappedAppItem(
  items: readonly LegacyAssistantSelectionItem[] | undefined,
): boolean {
  return items?.some(
    (item) =>
      (isAppOwned(item.origin) && !selectionBuiltInIds.has(item.id)) ||
      selectionTreeHasUnmappedAppItem(item.items),
  ) ?? false;
}

function publicSelectionItem(
  item: LegacyAssistantSelectionItem,
  context: AssistantSelectionActionContext,
  mapping: LegacyItemMapping<LegacyAssistantSelectionItem>,
): AssistantSelectionActionItem | UiOpaqueItem {
  const appOwned = isAppOwned(item.origin);
  const stableId = appOwned ? selectionBuiltInIds.get(item.id) : undefined;
  const hasOpaqueChild = selectionTreeHasUnmappedAppItem(item.items);
  if (appOwned && (stableId === undefined || hasOpaqueChild)) {
    return opaqueItem(item, mapping);
  }
  const id = stableId ?? item.id;
  if (mapping.rawByPublicId.has(id)) return opaqueItem(item, mapping);
  mapping.rawByPublicId.set(id, item);
  return Object.freeze({
    kind: "action",
    id,
    label: item.label,
    ...(item.placement === undefined ? {} : { placement: item.placement }),
    ...(item.labelScale === undefined ? {} : { labelScale: item.labelScale }),
    ...(item.verticalPadding === undefined
      ? {}
      : { verticalPadding: item.verticalPadding }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.items === undefined
      ? {}
      : {
          items: item.items.map((child) =>
            publicSelectionItem(child, context, mapping),
          ) as readonly AssistantSelectionActionItem[],
        }),
    ...(item.onClick === undefined
      ? {}
      : {
          onActivate: (_owner: AssistantSelectionActionContext, next: UiActivation) =>
            item.onClick?.(legacyActivation(next)),
        }),
    origin: appOwned ? "app" : `extension:${item.origin}`,
  });
}

function legacySelectionItem(
  item: AssistantSelectionActionItem | UiOpaqueItem,
  context: AssistantSelectionActionContext,
  extensionId: string,
  mapping: LegacyItemMapping<LegacyAssistantSelectionItem>,
): LegacyAssistantSelectionItem {
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
    ...(placement === undefined ? {} : { placement }),
    ...(labelScale === undefined ? {} : { labelScale }),
    ...(verticalPadding === undefined ? {} : { verticalPadding }),
    ...(disabled === undefined ? {} : { disabled }),
    ...(item.items !== undefined
      ? {
          items: item.items.map((child) =>
            legacySelectionItem(child, context, extensionId, mapping),
          ),
        }
      : existing?.items === undefined
        ? {}
        : { items: existing.items }),
    ...(item.onActivate === undefined && existing?.onClick === undefined
      ? {}
      : item.onActivate === undefined
        ? { onClick: existing!.onClick }
      : {
          onClick: (next) => {
            item.onActivate?.(context, activation(next));
          },
        }),
  };
}

function legacyComposerState(context: LegacyUiOwnerContext): ComposerState {
  if (context.composer) return context.composer;
  return Object.freeze({
    id: context.ownerId === "composer:main" ? context.ownerId : "composer:main",
    kind: context.kind ?? "main",
    focused: context.focused ?? false,
    content: Object.freeze([]),
    attachments: Object.freeze([]),
    planMode: context.plan ?? false,
    fastMode: false,
    submitting: false,
  });
}

function composerContext(context: LegacyUiOwnerContext): ComposerUtilityContext {
  return Object.freeze({
    ownerId: context.ownerId,
    windowId: adapterState().windowId,
    composer: legacyComposerState(context),
  });
}

function homeSuggestionContext(
  context: LegacyUiOwnerContext,
): HomeSuggestionContext {
  return Object.freeze({
    ownerId: context.ownerId,
    windowId: adapterState().windowId,
    composer: legacyComposerState(context),
    composerMode:
      context.composerMode ?? (context.mode === "work" ? "work" : "chat"),
    layout: context.layout ?? "cards",
    hostId: context.hostId ?? "",
    ...(context.projectRoot === undefined
      ? {}
      : { projectRoot: context.projectRoot }),
    plan: context.plan ?? false,
  });
}

function homeAnnouncementContext(
  context: LegacyUiOwnerContext,
): HomeAnnouncementContext {
  return Object.freeze({
    ownerId: context.ownerId,
    windowId: adapterState().windowId,
    composer: legacyComposerState(context),
    entryPoint: context.entryPoint ?? "home",
    homeComposerMode:
      context.homeComposerMode ??
      context.composerMode ??
      (context.mode === "work" ? "work" : "chat"),
    isLocalModeRemote: context.isLocalModeRemote ?? false,
    onboardingPromosHidden: context.onboardingPromosHidden ?? false,
  });
}

function sidebarDestinationContext(
  context: LegacyUiOwnerContext,
): SidebarDestinationContext {
  const mode = context.mode ?? "codex";
  const selectedDestination: SidebarDestinationContext["selectedDestination"] =
    context.selectedDestination ??
    destinationFromId(context.selectedDestinationId, mode);
  return Object.freeze({
    ownerId: context.ownerId,
    windowId: adapterState().windowId,
    mode,
    selectedDestination,
  });
}

function destinationFromId(
  id: string | undefined,
  mode: "chatgpt" | "work" | "codex",
): SidebarDestinationContext["selectedDestination"] {
  switch (id) {
    case undefined:
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
      return id.startsWith("app.mcp:")
        ? { kind: "connections" }
        : { kind: "extension", routeId: id };
  }
}

function productModeMenuContext(
  context: LegacyUiOwnerContext,
): ProductModeMenuContext {
  return Object.freeze({
    ownerId: context.ownerId,
    windowId: adapterState().windowId,
    mode: context.mode === "work" ? "work" : "codex",
    workModeAccess: context.workModeAccess ?? "chatgpt",
    disabled: context.disabled ?? false,
  });
}

function publicUiAction<TContext extends ComposerUtilityContext | HomeAnnouncementContext>(
  item: LegacyUiActionItem,
  context: TContext,
): UiActionItem<TContext> {
  return Object.freeze({
    kind: "action",
    id: item.id,
    label: item.label ?? item.id,
    ...(item.tooltip === undefined ? {} : { tooltip: item.tooltip }),
    ...(item.icon === undefined ? {} : { icon: item.icon as UiIcon }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.onClick === undefined
      ? {}
      : {
          onActivate: (_owner: TContext, next: UiActivation) =>
            item.onClick?.(legacyActivation(next)),
        }),
    origin: isAppOwned(item.origin) ? "app" : `extension:${item.origin}`,
  });
}

function publicHomeAnnouncementAction(
  item: LegacyUiActionItem,
  context: HomeAnnouncementContext,
): HomeAnnouncementActionItem {
  const action = publicUiAction(item, context);
  return Object.freeze({
    ...action,
    onActivate: (_owner: HomeAnnouncementContext, next: UiActivation) =>
      item.onClick?.(legacyActivation(next)),
  });
}

function legacyUiAction<TContext extends ComposerUtilityContext | HomeAnnouncementContext>(
  item: UiActionItem<TContext>,
  context: TContext,
  extensionId: string,
): LegacyUiActionItem {
  return {
    kind: "action",
    id: namespacedId(extensionId, item.id),
    label: item.label,
    ...(item.tooltip === undefined ? {} : { tooltip: item.tooltip }),
    ...(item.icon === undefined ? {} : { icon: item.icon }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.onActivate === undefined
      ? {}
      : {
          onClick: (next?: LegacyActivation) =>
            item.onActivate?.(context, activation(next)),
        }),
    origin: extensionId,
  };
}

function legacyComposerMenuItem(
  item: UiMenuItem<ComposerUtilityContext>,
  context: () => ComposerUtilityContext,
  extensionId: string,
): LegacyUiActionItem {
  if (item.kind === "opaque") {
    throw new TypeError("A composer action definition cannot contain an opaque menu item");
  }
  if (item.kind === "separator") {
    return {
      kind: "separator",
      id: namespacedId(extensionId, item.id),
      origin: extensionId,
    };
  }
  return {
    kind: "action",
    id: namespacedId(extensionId, item.id),
    label: item.label,
    ...(item.tooltip === undefined ? {} : { tooltip: item.tooltip }),
    ...(item.icon === undefined ? {} : { icon: item.icon }),
    ...(item.rightIcon === undefined ? {} : { rightIcon: item.rightIcon }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.checked === undefined ? {} : { checked: item.checked }),
    ...(item.keybinding === undefined ? {} : { keybinding: item.keybinding }),
    ...(item.message === undefined ? {} : { message: item.message }),
    ...(item.subText === undefined ? {} : { subText: item.subText }),
    ...(item.href === undefined ? {} : { href: item.href }),
    ...(item.items === undefined
      ? {}
      : {
          items: item.items.map((child) =>
            legacyComposerMenuItem(child, context, extensionId),
          ),
        }),
    ...(item.onActivate === undefined
      ? {}
      : {
          onClick: (next?: LegacyActivation) =>
            item.onActivate?.(context(), activation(next)),
        }),
    origin: extensionId,
  };
}

function publicHomeSuggestionItem(
  item: LegacyUiActionItem,
  context: HomeSuggestionContext,
  mapping: LegacyItemMapping<LegacyUiActionItem>,
): UiListItem<HomeSuggestionItem> {
  const appOwned = isAppOwned(item.origin);
  if (appOwned && !homeSuggestionBuiltInIds.has(item.id)) {
    return opaqueItem(item, mapping);
  }
  if (mapping.rawByPublicId.has(item.id)) return opaqueItem(item, mapping);
  mapping.rawByPublicId.set(item.id, item);
  return Object.freeze({
    kind: "action",
    id: item.id,
    label: item.label ?? item.id,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.tooltip === undefined ? {} : { tooltip: item.tooltip }),
    ...(item.icon === undefined ? {} : { icon: item.icon as UiIcon }),
    ...(item.listIcon === undefined
      ? {}
      : { listIcon: item.listIcon as UiIcon }),
    ...(item.keyboardShortcut === undefined
      ? {}
      : { keyboardShortcut: item.keyboardShortcut }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    onActivate: (_owner: HomeSuggestionContext, next: UiActivation) =>
      item.onClick?.(legacyActivation(next)),
    ...(item.onDismiss === undefined
      ? {}
      : {
          onDismiss: (_owner: HomeSuggestionContext, next: UiActivation) =>
            item.onDismiss?.(legacyActivation(next)),
        }),
    origin: appOwned ? "app" : `extension:${item.origin}`,
  });
}

function legacyHomeSuggestionItem(
  item: UiListItem<HomeSuggestionItem>,
  context: HomeSuggestionContext,
  extensionId: string,
  mapping: LegacyItemMapping<LegacyUiActionItem>,
): LegacyUiActionItem {
  const existing = mapping.rawByPublicId.get(item.id);
  if (item.kind === "opaque") {
    if (!existing) {
      throw new Error(`Opaque home suggestion is not from this evaluation: ${item.id}`);
    }
    return existing;
  }
  return {
    kind: "action",
    id: existing?.id ?? namespacedId(extensionId, item.id),
    label: item.label,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.tooltip === undefined ? {} : { tooltip: item.tooltip }),
    ...(item.icon === undefined ? {} : { icon: item.icon }),
    ...(item.listIcon === undefined ? {} : { listIcon: item.listIcon }),
    ...(item.keyboardShortcut === undefined
      ? {}
      : { keyboardShortcut: item.keyboardShortcut }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    onClick: (next?: LegacyActivation) =>
      item.onActivate(context, activation(next)),
    ...(item.onDismiss === undefined
      ? {}
      : {
          onDismiss: (next?: LegacyActivation) =>
            item.onDismiss?.(context, activation(next)),
        }),
    origin: existing?.origin ?? extensionId,
  };
}

function publicAnnouncementItem(
  item: LegacyAnnouncementItem,
  context: HomeAnnouncementContext,
  mapping: LegacyItemMapping<LegacyAnnouncementItem>,
): UiListItem<HomeAnnouncementItem> {
  if (item.kind === "opaque") return opaqueItem(item, mapping);
  if (mapping.rawByPublicId.has(item.id)) return opaqueItem(item, mapping);
  mapping.rawByPublicId.set(item.id, item);
  const appOwned = isAppOwned(item.origin);
  return Object.freeze({
    kind: "announcement",
    id: item.id,
    isEligible: item.isEligible,
    ...(item.isLoading === undefined ? {} : { isLoading: item.isLoading }),
    title: item.title,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.leadingVisual === undefined
      ? {}
      : { leadingVisual: item.leadingVisual as UiIcon }),
    ...(item.primaryAction === undefined
      ? {}
      : { primaryAction: publicHomeAnnouncementAction(item.primaryAction, context) }),
    ...(item.dismissAction === undefined
      ? {}
      : { dismissAction: publicHomeAnnouncementAction(item.dismissAction, context) }),
    origin: appOwned ? "app" : `extension:${item.origin}`,
  });
}

function legacyAnnouncementItem(
  item: UiListItem<HomeAnnouncementItem>,
  context: HomeAnnouncementContext,
  extensionId: string,
  mapping: LegacyItemMapping<LegacyAnnouncementItem>,
): LegacyAnnouncementItem {
  const existing = mapping.rawByPublicId.get(item.id);
  if (item.kind === "opaque") {
    if (!existing) {
      throw new Error(`Opaque announcement is not from this evaluation: ${item.id}`);
    }
    return existing;
  }
  return {
    kind: "announcement",
    id: existing?.id ?? namespacedId(extensionId, item.id),
    isEligible: item.isEligible,
    ...(item.isLoading === undefined ? {} : { isLoading: item.isLoading }),
    title: item.title,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.leadingVisual === undefined
      ? {}
      : { leadingVisual: item.leadingVisual }),
    ...(item.primaryAction === undefined
      ? {}
      : {
          primaryAction: legacyUiAction(
            item.primaryAction,
            context,
            extensionId,
          ),
        }),
    ...(item.dismissAction === undefined
      ? {}
      : {
          dismissAction: legacyUiAction(
            item.dismissAction,
            context,
            extensionId,
          ),
        }),
    origin: existing?.origin ?? extensionId,
  };
}

function publicSidebarDestinationItem(
  item: LegacyUiActionItem,
  context: SidebarDestinationContext,
  mapping: LegacyItemMapping<LegacyUiActionItem>,
): UiListItem<SidebarDestinationItem> {
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
    ...(item.icon === undefined ? {} : { icon: item.icon as UiIcon }),
    ...(item.railIcon === undefined ? {} : { railIcon: item.railIcon as UiIcon }),
    ...(item.animatedIcon === undefined
      ? {}
      : { animatedIcon: item.animatedIcon as UiIcon }),
    ...(item.customizable === undefined ? {} : { customizable: item.customizable }),
    ...(item.defaultLocation === undefined
      ? {}
      : { defaultLocation: item.defaultLocation }),
    ...(item.visibleByDefault === undefined
      ? {}
      : { visibleByDefault: item.visibleByDefault }),
    ...(item.destination === undefined ? {} : { destination: item.destination }),
    ...(item.hasUnreadActivity === undefined
      ? {}
      : { hasUnreadActivity: item.hasUnreadActivity }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.isCurrentDestination === undefined && item.isActive === undefined
      ? {}
      : {
          isCurrentDestination: () =>
            item.isCurrentDestination ?? item.isActive ?? false,
        }),
    ...(item.onPrefetch === undefined
      ? {}
      : { onPrefetch: () => item.onPrefetch?.() }),
    ...(item.onClick === undefined
      ? {}
      : {
          onSelect: (_owner: SidebarDestinationContext, next: UiActivation) =>
            item.onClick?.(legacyActivation(next)),
        }),
    origin: appOwned ? "app" : `extension:${item.origin}`,
  });
}

function legacySidebarDestinationItem(
  item: UiListItem<SidebarDestinationItem>,
  context: SidebarDestinationContext,
  extensionId: string,
  mapping: LegacyItemMapping<LegacyUiActionItem>,
): LegacyUiActionItem {
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
    ...(item.icon === undefined ? {} : { icon: item.icon }),
    ...(item.railIcon === undefined ? {} : { railIcon: item.railIcon }),
    ...(item.animatedIcon === undefined ? {} : { animatedIcon: item.animatedIcon }),
    ...(item.customizable === undefined ? {} : { customizable: item.customizable }),
    ...(item.defaultLocation === undefined
      ? {}
      : { defaultLocation: item.defaultLocation }),
    ...(item.visibleByDefault === undefined
      ? {}
      : { visibleByDefault: item.visibleByDefault }),
    ...(item.destination === undefined ? {} : { destination: item.destination }),
    ...(item.hasUnreadActivity === undefined
      ? {}
      : { hasUnreadActivity: item.hasUnreadActivity }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(isCurrentDestination === undefined
      ? {}
      : {
          isActive: isCurrentDestination,
          isCurrentDestination,
        }),
    ...(item.onPrefetch === undefined
      ? {}
      : { onPrefetch: () => item.onPrefetch?.(context) }),
    ...(item.onSelect === undefined
      ? {}
      : {
          onClick: (next?: LegacyActivation) =>
            item.onSelect?.(context, activation(next)),
        }),
    origin: existing?.origin ?? extensionId,
  };
}

function publicProductModeMenuItem(
  item: LegacyUiActionItem,
  context: ProductModeMenuContext,
  mapping: LegacyItemMapping<LegacyUiActionItem>,
): ProductModeMenuItem {
  const appOwned = isAppOwned(item.origin);
  if (item.kind === "separator") {
    const publicId = appOwned
      ? `app.separator:${++mapping.opaqueSequence}`
      : item.id;
    mapping.rawByPublicId.set(publicId, item);
    return Object.freeze({
      kind: "separator",
      id: publicId,
      origin: appOwned ? "app" : `extension:${item.origin}`,
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
    ...(item.tooltip === undefined ? {} : { tooltip: item.tooltip }),
    ...(item.icon === undefined ? {} : { icon: item.icon as UiIcon }),
    ...(item.rightIcon === undefined
      ? {}
      : { rightIcon: item.rightIcon as UiIcon }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.checked === undefined ? {} : { checked: item.checked }),
    ...(item.keybinding === undefined ? {} : { keybinding: item.keybinding }),
    ...(item.message === undefined ? {} : { message: item.message }),
    ...(item.subText === undefined ? {} : { subText: item.subText }),
    ...(item.href === undefined ? {} : { href: item.href }),
    ...(item.items === undefined
      ? {}
      : {
          items: item.items.map((child) =>
            publicProductModeMenuItem(child, context, mapping),
          ),
        }),
    ...(item.onClick === undefined
      ? {}
      : {
          onActivate: (_owner: ProductModeMenuContext, next: UiActivation) =>
            item.onClick?.(legacyActivation(next)),
        }),
    origin: appOwned ? "app" : `extension:${item.origin}`,
  });
}

function legacyProductModeMenuItem(
  item: ProductModeMenuItem,
  context: ProductModeMenuContext,
  extensionId: string,
  mapping: LegacyItemMapping<LegacyUiActionItem>,
): LegacyUiActionItem {
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
      origin: existing?.origin ?? extensionId,
    };
  }
  return {
    kind: "action",
    id: existing?.id ?? namespacedId(extensionId, item.id),
    label: item.label,
    ...(item.tooltip === undefined ? {} : { tooltip: item.tooltip }),
    ...(item.icon === undefined ? {} : { icon: item.icon }),
    ...(item.rightIcon === undefined ? {} : { rightIcon: item.rightIcon }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.checked === undefined ? {} : { checked: item.checked }),
    ...(item.keybinding === undefined ? {} : { keybinding: item.keybinding }),
    ...(item.message === undefined ? {} : { message: item.message }),
    ...(item.subText === undefined ? {} : { subText: item.subText }),
    ...(item.href === undefined ? {} : { href: item.href }),
    ...(item.items === undefined
      ? {}
      : {
          items: item.items.map((child) =>
            legacyProductModeMenuItem(child, context, extensionId, mapping),
          ),
        }),
    ...(item.onActivate === undefined
      ? {}
      : {
          onClick: (next?: LegacyActivation) =>
            item.onActivate?.(context, activation(next)),
        }),
    origin: existing?.origin ?? extensionId,
  };
}

function tracked<T extends Disposable>(entry: ActiveEntry, value: T): T {
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

interface EvaluationRecord {
  readonly controller: AbortController;
  readonly unlink: () => void;
}

function beginEvaluation(
  entry: ActiveEntry,
  evaluations: Map<string, EvaluationRecord>,
  ownerId: string,
): EvaluationRecord {
  abortEvaluations(evaluations, ownerId);
  const controller = new AbortController();
  const onLifetimeAbort = () => controller.abort(entry.controller.signal.reason);
  entry.controller.signal.addEventListener("abort", onLifetimeAbort, { once: true });
  const record = {
    controller,
    unlink() {
      entry.controller.signal.removeEventListener("abort", onLifetimeAbort);
    },
  };
  evaluations.set(ownerId, record);
  return record;
}

function abortEvaluations(
  evaluations: Map<string, EvaluationRecord>,
  ownerId?: string,
): void {
  const records = ownerId === undefined
    ? [...evaluations.entries()]
    : [[ownerId, evaluations.get(ownerId)] as const];
  for (const [key, record] of records) {
    if (!record) continue;
    evaluations.delete(key);
    record.unlink();
    record.controller.abort();
  }
}

function refreshingRegistration(
  entry: ActiveEntry,
  register: () => LegacyDisposable,
  beforeRefresh: (ownerId?: string) => void,
): UiRegistration {
  let value = register();
  let disposed = false;
  const result = Object.freeze({
    invalidate(ownerId?: string) {
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
    },
  });
  return tracked(entry, result);
}

function invalidatingRegistration(
  entry: ActiveEntry,
  register: () => LegacyInvalidatableRegistration,
  beforeInvalidate: (ownerId?: string) => void,
): UiRegistration {
  let value = register();
  let disposed = false;
  const result = Object.freeze({
    invalidate(ownerId?: string) {
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
    },
  });
  return tracked(entry, result);
}

function assistantContentContext(
  context: LegacyAssistantContentContext,
): Omit<AssistantDirectiveUiContext, "directive"> {
  const thread = context.scope === "execution"
    ? (() => {
        if (context.hostId === undefined || context.hostId.length === 0) {
          throw new TypeError(
            "Execution assistant-content context requires hostId",
          );
        }
        return Object.freeze({
          scope: "execution" as const,
          hostId: context.hostId,
          threadId: context.conversationId,
        });
      })()
    : (() => {
        if (context.accountId === undefined || context.accountId.length === 0) {
          throw new TypeError(
            "Cloud assistant-content context requires accountId",
          );
        }
        return Object.freeze({
          scope: "cloud" as const,
          accountId: context.accountId,
          ...(context.workspaceId === undefined
            ? {}
            : { workspaceId: context.workspaceId }),
          threadId: context.conversationId,
        });
      })();
  return {
    ownerId: context.ownerId,
    windowId: adapterState().windowId,
    thread,
    conversationId: context.conversationId,
    ...(context.messageId === undefined ? {} : { messageId: context.messageId }),
    ...(context.turnId === undefined ? {} : { turnId: context.turnId }),
    ...(context.hostId === undefined ? {} : { hostId: context.hostId }),
    streaming: context.streaming,
  };
}

function assistantDirectiveContext(
  context: LegacyAssistantDirectiveContext,
): AssistantDirectiveUiContext {
  return Object.freeze({
    ...assistantContentContext(context),
    directive: Object.freeze({
      name: context.directive.name,
      kind: context.directive.kind,
      attributes: Object.freeze({ ...context.directive.attributes }),
      ...(context.directive.directiveId === undefined
        ? {}
        : { directiveId: context.directive.directiveId }),
      terminalInline: context.directive.terminalInline,
      ...(context.directive.content === undefined
        ? {}
        : { content: context.directive.content }),
    }),
  });
}

function assistantContentReferenceContext(
  context: LegacyAssistantContentReferenceContext,
): AssistantContentReferenceUiContext {
  return Object.freeze({
    ...assistantContentContext(context),
    reference: Object.freeze({
      type: context.reference.type,
      data: context.reference.data,
    }),
    index: context.index,
    terminalInline: context.terminalInline,
  });
}

function assistantCodeBlockContext(
  context: LegacyAssistantCodeBlockContext,
): AssistantCodeBlockUiContext {
  return Object.freeze({
    ...assistantContentContext(context),
    codeBlock: Object.freeze({
      index: context.codeBlock.index,
      ...(context.codeBlock.language === undefined
        ? {}
        : { language: context.codeBlock.language }),
      content: context.codeBlock.content,
      fenceOpen: context.codeBlock.fenceOpen,
      ...(context.codeBlock.info === undefined
        ? {}
        : { info: context.codeBlock.info }),
    }),
  });
}

function conversationItemContext(
  context: LegacyConversationItemContext,
): ConversationItemUiContext {
  const item = context.item;
  const rawStatus = item.status;
  const status =
    rawStatus === "pending" ||
    rawStatus === "running" ||
    rawStatus === "complete" ||
    rawStatus === "failed" ||
    rawStatus === "cancelled"
      ? rawStatus
      : item.completed === true
        ? "complete"
        : "running";
  const thread = context.scope === "execution"
    ? Object.freeze({
        scope: "execution" as const,
        hostId: context.hostId ?? "local",
        threadId: context.conversationId,
      })
    : (() => {
        if (context.accountId === undefined) {
          throw new TypeError(
            "Cloud conversation-item context requires accountId",
          );
        }
        return Object.freeze({
          scope: "cloud" as const,
          accountId: context.accountId,
          ...(context.workspaceId === undefined
            ? {}
            : { workspaceId: context.workspaceId }),
          threadId: context.conversationId,
        });
      })();
  const label =
    typeof item.label === "string"
      ? item.label
      : typeof item.title === "string"
        ? item.title
        : context.itemType;
  const text =
    typeof item.text === "string"
      ? item.text
      : typeof item.content === "string"
        ? item.content
        : undefined;
  return Object.freeze({
    ownerId: context.ownerId,
    windowId: adapterState().windowId,
    conversationId: context.conversationId,
    ...(context.turnId === undefined ? {} : { turnId: context.turnId }),
    ...(context.hostId === undefined ? {} : { hostId: context.hostId }),
    item: Object.freeze({
      id:
        typeof item.id === "string"
          ? item.id
          : `${context.itemType}:${context.ownerId}`,
      thread,
      ...(context.turnId === undefined ? {} : { turnId: context.turnId }),
      status,
      kind: "opaque" as const,
      sourceKind: context.itemType,
      data: item,
      presentationVersion: 1,
      label,
      ...(text === undefined ? {} : { text }),
    }),
    layout: context.itemLayout,
  });
}

function memoizedRichContext<
  TLegacy extends object,
  TPublic extends UiOwnerContext,
>(mapper: (context: TLegacy) => TPublic): (context: TLegacy) => TPublic {
  const cache = new WeakMap<TLegacy, TPublic>();
  return (context) => {
    const existing = cache.get(context);
    if (existing) return existing;
    const mapped = mapper(context);
    cache.set(context, mapped);
    return mapped;
  };
}

function richContentProvider<
  TLegacy extends LegacyUiOwnerContext,
  TPublic extends UiOwnerContext,
>(
  entry: ActiveEntry,
  identity: AdapterIdentity,
  kind: string,
  mapContext: (context: TLegacy) => TPublic,
  render: UiRenderProvider<TPublic>,
): RichContentProvider<TLegacy> {
  return (legacyContext, container) => {
    const context = mapContext(legacyContext);
    const controller = new AbortController();
    const onLifetimeAbort = () =>
      controller.abort(entry.controller.signal.reason);
    entry.controller.signal.addEventListener("abort", onLifetimeAbort, {
      once: true,
    });
    let disposer: Disposable | undefined;
    try {
      const value = render({
        id: randomId(kind),
        ownerId: context.ownerId,
        windowId: adapterState().windowId,
        container,
        context,
        signal: controller.signal,
      });
      if (
        value !== undefined &&
        (!value ||
          typeof value !== "object" ||
          typeof (value as { readonly dispose?: unknown }).dispose !== "function")
      ) {
        throw new TypeError("A render provider must return a Disposable or undefined");
      }
      disposer = value as Disposable | undefined;
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
      },
    });
  };
}

function settingsHub(extensionId: string): SettingsHub {
  const state = adapterState();
  let hub = state.settings.get(extensionId);
  if (hub) return hub;
  hub = {
    extensionId,
    storage: createExtensionStorage(extensionId),
    listeners: new Set(),
    invalidators: new Set(),
    values: {},
    textDrafts: new Map(),
    sourceId: state.documentId,
    operations: Promise.resolve(),
    revision: 0,
  };
  if (typeof BroadcastChannel === "function") {
    const channel = new BroadcastChannel(`chatgptx-v5-settings:${extensionId}`);
    const unref = (channel as BroadcastChannel & { unref?: () => void }).unref;
    unref?.call(channel);
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = parseSettingsBroadcast(event.data);
      if (!message || message.sourceId === hub!.sourceId) return;
      void loadSettings(hub!)
        .then(() => {
          if (message.deleted) {
            delete hub!.values[message.key];
          } else {
            hub!.values[message.key] = message.value!;
          }
          emitSetting(hub!, message.key, message.value, false);
        })
        .catch((error) =>
          console.error(`[${extensionId}] settings broadcast failed`, error),
        );
    });
    hub.channel = channel;
  }
  state.settings.set(extensionId, hub);
  return hub;
}

function parseSettingsBroadcast(value: unknown): SettingsBroadcast | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.sourceId !== "string" ||
    typeof candidate.key !== "string" ||
    typeof candidate.deleted !== "boolean"
  ) {
    return undefined;
  }
  if (candidate.deleted) {
    return {
      sourceId: candidate.sourceId,
      key: candidate.key,
      deleted: true,
    };
  }
  if (!("value" in candidate) || candidate.value === undefined) return undefined;
  return {
    sourceId: candidate.sourceId,
    key: candidate.key,
    deleted: false,
    value: candidate.value as JsonValue,
  };
}

async function loadSettings(hub: SettingsHub): Promise<void> {
  hub.load ??= hub.storage.readTextFile(settingsFile).then((contents) => {
    if (contents === undefined) return;
    const parsed: unknown = JSON.parse(contents);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("Extension settings must contain a JSON object");
    }
    Object.assign(hub.values, parsed as JsonObject);
    for (const [key, value] of Object.entries(hub.values)) {
      synchronizeTextDrafts(hub, key, value);
    }
  });
  await hub.load;
}

function extensionScope(): SettingsScope {
  return Object.freeze({ kind: "extension" });
}

function emitSetting(
  hub: SettingsHub,
  key: string,
  value: JsonValue | undefined,
  broadcast = true,
) {
  synchronizeTextDrafts(hub, key, value);
  hub.revision += 1;
  const change: SettingChange = Object.freeze({
    key,
    scope: extensionScope(),
    value,
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
      deleted: value === undefined,
      ...(value === undefined ? {} : { value }),
    } satisfies SettingsBroadcast);
  }
}

function persistSettings(hub: SettingsHub): Promise<void> {
  const contents = `${JSON.stringify(hub.values, null, 2)}\n`;
  const operation = hub.operations.then(() =>
    hub.storage.writeTextFile(settingsFile, contents),
  );
  hub.operations = operation.catch(() => undefined);
  return operation;
}

function settingDefault(control: SettingControl): JsonValue | undefined {
  if ("defaultValue" in control) return control.defaultValue;
  return undefined;
}

function settingValue(hub: SettingsHub, control: SettingControl): JsonValue | undefined {
  if (!control.settingKey) return settingDefault(control);
  return hub.values[control.settingKey] ?? settingDefault(control);
}

function synchronizeTextDrafts(
  hub: SettingsHub,
  key: string,
  value: JsonValue | undefined,
): void {
  for (const draft of hub.textDrafts.values()) {
    if (draft.settingKey !== key) continue;
    draft.value = typeof value === "string" ? value : draft.defaultValue;
  }
}

function textDraft(
  hub: SettingsHub,
  controlId: string,
  control: Extract<SettingControl, { readonly type: "text" }>,
) {
  let draft = hub.textDrafts.get(controlId);
  if (draft) return draft;
  const value = settingValue(hub, control);
  draft = {
    ...(control.settingKey === undefined
      ? {}
      : { settingKey: control.settingKey }),
    defaultValue: control.defaultValue ?? "",
    value: typeof value === "string" ? value : "",
  };
  hub.textDrafts.set(controlId, draft);
  return draft;
}

function settingDescription(
  hub: SettingsHub,
  controlId: string,
  control: SettingControl,
): string | undefined {
  if (control.type !== "text" || control.validate === undefined) {
    return control.description;
  }
  return control.validate(textDraft(hub, controlId, control).value) ??
    control.description;
}

function nativeControl(
  legacy: LegacyPlatformApi,
  identity: AdapterIdentity,
  hub: SettingsHub,
  control: SettingControl,
  controlId: string,
  invalidate: () => void,
): unknown {
  const key = control.settingKey;
  const save = async (value: JsonValue) => {
    if (!key) return;
    hub.values[key] = value;
    emitSetting(hub, key, value);
    invalidate();
    await persistSettings(hub);
  };
  const value = settingValue(hub, control);
  switch (control.type) {
    case "toggle":
      return legacy.settings.ui.toggle({
        checked: typeof value === "boolean" ? value : false,
        ...(control.disabled === undefined ? {} : { disabled: control.disabled }),
        onChange: (next) => save(next),
      });
    case "text": {
      const draft = textDraft(hub, controlId, control);
      return legacy.settings.ui.textField({
        value: draft.value,
        ...(control.placeholder === undefined
          ? {}
          : { placeholder: control.placeholder }),
        ...(control.disabled === undefined ? {} : { disabled: control.disabled }),
        onChange: (next) => {
          draft.value = next;
          invalidate();
          if (control.validate?.(next) !== undefined) return;
          return save(next);
        },
      });
    }
    case "number":
      return legacy.settings.ui.textField({
        value: typeof value === "number" ? String(value) : "",
        ...(control.disabled === undefined ? {} : { disabled: control.disabled }),
        onChange: (next) => {
          const number = Number(next);
          if (!Number.isFinite(number)) return;
          return save(number);
        },
      });
    case "select":
    case "radio":
    case "segmented":
      return legacy.settings.ui.select({
        ...(typeof value === "string" ? { value } : {}),
        options: control.options,
        ...(control.disabled === undefined ? {} : { disabled: control.disabled }),
        onChange: (next) => save(next),
      });
    case "button":
    case "link":
      {
        if (!control.commandId && control.destination) return undefined;
        const command = control.commandId
          ? adapterState().commands.get(namespacedId(identity.id, control.commandId))
          : undefined;
        const commandContext = Object.freeze({}) satisfies CommandContext;
        const commandEnabled =
          command !== undefined &&
          (command.definition.isEnabled?.(commandContext) ?? true);
      return legacy.settings.ui.button({
        label: control.title,
        disabled: control.disabled === true || !commandEnabled,
        async onClick() {
          if (!command || !commandEnabled) return;
          await command.definition.handler(commandContext);
          invalidate();
        },
      });
      }
    default:
      return undefined;
  }
}

function registerSettingsSection(
  legacy: LegacyPlatformApi,
  identity: AdapterIdentity,
  entry: ActiveEntry,
  definition:
    | SettingsSectionDefinition
    | NativeSettingsControlsSectionDefinition,
): UiRegistration {
  if (
    typeof definition.id !== "string" ||
    definition.id.length === 0 ||
    definition.id.includes(".")
  ) {
    throw new TypeError(
      "A native settings section id must be a non-empty local id without dots",
    );
  }
  if (definition.content !== "controls") {
    throw new Error("The current exact binding supports native settings controls only");
  }
  if (
    ("icon" in definition && definition.icon !== undefined) ||
    ("order" in definition && definition.order !== undefined) ||
    ("isVisible" in definition && definition.isVisible !== undefined)
  ) {
    throw new Error(
      "The current exact binding supports the NativeSettingsControlsSectionDefinition shape only",
    );
  }
  if (definition.group !== undefined && !nativeSettingsGroups.has(definition.group)) {
    throw new Error(`The current exact binding does not support settings group ${definition.group}`);
  }
  const unsupportedControl = definition.controls.find(
    (control) => !nativeSettingsControlTypeSet.has(control.type),
  );
  if (unsupportedControl) {
    throw new Error(
      `The current exact binding does not support the ${unsupportedControl.type} settings control`,
    );
  }
  for (const control of definition.controls) {
    if (
      (control.type === "toggle" ||
        control.type === "text" ||
        control.type === "select") &&
      (typeof control.settingKey !== "string" || control.settingKey.length === 0)
    ) {
      throw new Error(
        `The current exact binding requires settingKey for the ${control.type} settings control`,
      );
    }
    if (
      control.type === "text" &&
      "secure" in control &&
      control.secure !== undefined
    ) {
      throw new Error("The current exact binding does not support secure text settings controls");
    }
    if (
      control.type === "select" &&
      control.options.some(
        (option) => "description" in option && option.description !== undefined,
      )
    ) {
      throw new Error("The current exact binding does not support select option descriptions");
    }
    if (
      control.type === "button" &&
      !control.commandId &&
      control.destination === undefined
    ) {
      throw new Error(
        "The current exact binding requires commandId or destination for a button settings control",
      );
    }
    if (
      control.type === "button" &&
      (("href" in control && control.href !== undefined) ||
        ("settingKey" in control && control.settingKey !== undefined))
    ) {
      throw new Error(
        "The current exact binding does not support href or settingKey on a button settings control",
      );
    }
    if (
      control.type === "button" &&
      !control.commandId &&
      control.destination !== undefined &&
      control.disabled !== undefined
    ) {
      throw new Error(
        "The current exact binding cannot disable a destination-only button settings control",
      );
    }
  }
  if (
    definition.searchEntries?.some((entry) =>
      Object.prototype.hasOwnProperty.call(entry, "id")
    )
  ) {
    throw new Error(
      "The current exact binding does not preserve settings search entry ids",
    );
  }
  const paneId = `${identity.id}.${definition.id}`;
  const groupId = `${paneId}.controls`;
  const categoryId = definition.group ?? "integrations";
  const hub = settingsHub(identity.id);
  let itemRegistration: LegacySettingsRegistration;
  const categories = legacy.settings.transformCategories((current) =>
    current.map((category) =>
      category.id === categoryId
        ? {
            ...category,
            panes: [
              ...category.panes,
              {
                id: paneId,
                label: definition.title,
                title: definition.title,
                ...(definition.searchEntries === undefined
                  ? {}
                  : {
                      keywords: definition.searchEntries.flatMap((entry) => [
                        entry.title,
                        ...(entry.keywords ?? []),
                      ]),
                    }),
              },
            ],
          }
        : category,
    ),
  );
  const groups = legacy.settings.transformGroups((current, pane) =>
    pane.id === paneId
      ? [
          ...current,
          {
            id: groupId,
            title: definition.title,
            ...(definition.controls.some((control) => control.restartRequired)
              ? { footer: "Changes apply after ChatGPT restarts." }
              : {}),
            items: [],
          },
        ]
      : current,
  );
  itemRegistration = legacy.settings.transformItems((current, context) => {
    if (context.group.id !== groupId) return current;
    return [
      ...current,
      ...definition.controls.map((control) => {
        const controlId = `${paneId}.${control.id}`;
        const description = settingDescription(hub, controlId, control);
        const destinationPaneId = control.destination
          ? settingsTargetId(identity.id, control.destination.sectionId)
          : undefined;
        return {
          id: controlId,
          label: control.title,
          ...(description === undefined ? {} : { description }),
          ...(control.destination === undefined
            ? {}
            : {
                destination: {
                  paneId: destinationPaneId!,
                  ...(control.destination.controlId === undefined
                    ? {}
                    : {
                        itemId: `${destinationPaneId}.${control.destination.controlId}`,
                      }),
                },
              }),
          control: nativeControl(
            legacy,
            identity,
            hub,
            control,
            controlId,
            () => itemRegistration.invalidate(),
          ),
        };
      }),
    ];
  });
  const invalidateItems = () => itemRegistration.invalidate();
  hub.invalidators.add(invalidateItems);
  let disposed = false;
  void loadSettings(hub)
    .then(() => {
      if (!disposed) itemRegistration.invalidate();
    })
    .catch((error) =>
      console.error(`[${identity.id}] settings load failed`, error),
    );
  const result: UiRegistration = Object.freeze({
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
    },
  });
  return tracked(entry, result);
}

function namespacedId(extensionId: string, id: string): string {
  return id.startsWith(`${extensionId}.`) ? id : `${extensionId}.${id}`;
}

function settingsTargetId(extensionId: string, id: string): string {
  if (id.includes(".")) return id;
  return builtInSettingsSectionIds.has(id)
    ? `codex.settings.${id}`
    : `${extensionId}.${id}`;
}

function extensionSettingsOptions(
  options: SettingReadOptions | SettingWriteOptions | undefined,
): AbortSignal | undefined {
  const signal = options?.signal;
  signal?.throwIfAborted();
  if (options?.scope !== undefined && options.scope.kind !== "extension") {
    return unsupported(`Settings scope ${options.scope.kind}`);
  }
  return signal;
}

function eventSubscriptionSignal(
  options: EventSubscriptionOptions | undefined,
): AbortSignal | undefined {
  const signal = options?.signal;
  signal?.throwIfAborted();
  return signal;
}

function registerCommand(
  identity: AdapterIdentity,
  entry: ActiveEntry,
  definition: CommandDefinition,
): UiRegistration {
  const state = adapterState();
  const id = namespacedId(identity.id, definition.id);
  if (state.commands.has(id)) {
    throw new Error(`Command is already registered: ${id}`);
  }
  state.commands.set(id, { id, definition });
  let disposed = false;
  const result: UiRegistration = Object.freeze({
    invalidate() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      state.commands.delete(id);
      entry.disposables.delete(result);
    },
  });
  return tracked(entry, result);
}

function apiError(
  code: "capability-unavailable" | "not-found" | "unsupported",
  message: string,
  details?: JsonObject,
): Error {
  return Object.assign(new Error(message), {
    name: "ChatGPTXApiError",
    code,
    retryable: false,
    ...(details === undefined ? {} : { details: Object.freeze(details) }),
  });
}

function unsupported(name: string): never {
  throw apiError(
    "capability-unavailable",
    `${name} is not available in this exact-build adapter`,
    { operation: name, reason: "binding-unavailable" },
  );
}

function unavailableApiMember(path: string): unknown {
  const callable = () => unsupported(`API operation ${path}`);
  return new Proxy(callable, {
    get(_target, property) {
      if (property === "then") return undefined;
      if (typeof property === "symbol") return undefined;
      return unavailableApiMember(`${path}.${String(property)}`);
    },
    apply() {
      return unsupported(`API operation ${path}`);
    },
  });
}

function apiNamespace<T extends object>(name: string, value: T): T {
  return new Proxy(value, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      if (typeof property === "symbol") return undefined;
      return unavailableApiMember(`${name}.${String(property)}`);
    },
  });
}

function requestedScope(options?: CapabilityOptions): CapabilityScope {
  options?.signal?.throwIfAborted();
  return options?.scope ?? Object.freeze({ kind: "global" });
}

function rendererOwnerScopeAvailable(
  id: CapabilityId,
  scope: CapabilityScope,
): boolean {
  const windowId = adapterState().windowId;
  if (scope.kind === "global") return true;
  if (scope.kind === "window") return scope.windowId === windowId;
  if (scope.kind !== "thread") return false;
  if (scope.windowId !== undefined && scope.windowId !== windowId) return false;
  if (
    id === "ui.definition.assistant-code-block" ||
    id === "ui.definition.assistant-content-reference" ||
    id === "ui.definition.assistant-directive" ||
    id === "ui.definition.conversation-item"
  ) {
    return scope.thread.scope === "execution" || scope.thread.scope === "cloud";
  }
  if (scope.thread.scope === "execution") {
    return (
      id === "ui.point.assistant-selection.actions" ||
      id === "ui.point.thread.header.menu" ||
      id === "ui.point.sidebar.thread-row.title-prefix" ||
      id === "ui.point.sidebar.thread-row.priority-indicator"
    );
  }
  if (scope.thread.scope !== "cloud") return false;
  return (
    id === "ui.point.sidebar.thread-row.menu" ||
    id === "ui.point.sidebar.thread-row.title-prefix" ||
    id === "ui.point.sidebar.thread-row.priority-indicator"
  );
}

function capabilityStatus(
  id: CapabilityId,
  scope: CapabilityScope,
  extensionDeactivated = false,
): CapabilityStatus {
  if (extensionDeactivated) {
    return Object.freeze({
      id,
      scope,
      state: "unavailable",
      unavailableReason: "extension-deactivated",
      detail: "The renderer extension is inactive.",
      operations: Object.freeze([]),
    });
  }
  let operations = availableCapabilityOperations.get(id);
  let scopeUnavailable = false;
  if (id.startsWith("ui.point.")) {
    const point = id.slice("ui.point.".length);
    const available = availableListPoints.has(point) || availableRenderPoints.has(point);
    operations = available
      ? [availableListPoints.has(point) ? "transform" : "render"]
      : undefined;
  } else if (id.startsWith("ui.definition.")) {
    const kind = id.slice("ui.definition.".length);
    operations = availableDefinitionKinds.has(kind) ? ["register"] : undefined;
  }
  if (
    (id.startsWith("ui.point.") || id.startsWith("ui.definition.")) &&
    !rendererOwnerScopeAvailable(id, scope)
  ) {
    operations = undefined;
    scopeUnavailable = true;
  }
  if (
    (id === "settings.read" || id === "settings.write") &&
    scope.kind !== "global"
  ) {
    operations = undefined;
    scopeUnavailable = true;
  }
  if (
    id === "threads.read" &&
    scope.kind !== "global" &&
    !(scope.kind === "window" && scope.windowId === adapterState().windowId)
  ) {
    operations = undefined;
    scopeUnavailable = true;
  }
  return Object.freeze({
    id,
    scope,
    state: operations === undefined ? "unavailable" : "available",
    ...(operations === undefined
      ? {
          unavailableReason: "binding-unavailable" as const,
          detail: scopeUnavailable
            ? "The exact-build adapter does not bind this capability for the requested scope."
            : "The exact-build adapter does not bind this capability.",
          operations: Object.freeze([]),
        }
      : { operations: Object.freeze([...operations]) }),
  });
}

function allCapabilityIds(): readonly CapabilityId[] {
  return Object.freeze([
    ...builtInCapabilityIds,
    ...listPointIds.map((id) => `ui.point.${id}` as const),
    ...renderPointIds.map((id) => `ui.point.${id}` as const),
    ...definitionKinds.map((kind) => `ui.definition.${kind}` as const),
  ]);
}

function capabilitySnapshot(
  scope: CapabilityScope,
  extensionDeactivated = false,
): CapabilitySnapshot {
  return Object.freeze({
    revision: 1,
    generatedAt: new Date().toISOString(),
    scope,
    statuses: Object.freeze(
      allCapabilityIds().map((id) =>
        capabilityStatus(id, scope, extensionDeactivated)
      ),
    ),
  });
}

function unavailableCapabilityError(status: CapabilityStatus): Error {
  return Object.assign(
    new Error(`Capability is unavailable: ${status.id}`),
    {
      name: "ChatGPTXApiError",
      code: "capability-unavailable" as const,
      retryable: false,
      details: {
        capabilityId: status.id,
        reason: status.unavailableReason ?? "binding-unavailable",
      },
    },
  );
}

function apiFor(
  legacy: LegacyPlatformApi,
  identity: AdapterIdentity,
  entry: ActiveEntry,
  extension: ExtensionIdentity,
): ChatGPTXApi {
  const state = adapterState();
  const hub = settingsHub(identity.id);

  const capabilities = {
    async getSnapshot(options?: CapabilityOptions) {
      return capabilitySnapshot(
        requestedScope(options),
        entry.controller.signal.aborted,
      );
    },
    async get(id: CapabilityId, options?: CapabilityOptions) {
      return capabilityStatus(
        id,
        requestedScope(options),
        entry.controller.signal.aborted,
      );
    },
    async require(id: CapabilityId, options?: CapabilityOptions) {
      const status = capabilityStatus(
        id,
        requestedScope(options),
        entry.controller.signal.aborted,
      );
      if (status.state === "unavailable") throw unavailableCapabilityError(status);
    },
    changed: {
      subscribe(
        listener: (message: unknown) => void,
        options?: EventSubscriptionOptions,
      ) {
        if (typeof listener !== "function") {
          throw new TypeError("A capability event listener is required");
        }
        const signal = eventSubscriptionSignal(options);
        let active = true;
        let resource: Disposable;
        const emit = (message: unknown) => {
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
          if (options?.afterCursor !== undefined) {
            emit({
              type: "reset",
              cursor: "1",
              reason: "cursor-expired",
            });
          }
          emit({
            type: "snapshot",
            cursor: "1",
            value: capabilitySnapshot(
              Object.freeze({ kind: "global" }),
              entry.controller.signal.aborted,
            ),
          });
        });
        return dispose;
      },
    },
  };

  const runtime = {
    async getInfo(options?: RequestOptions) {
      options?.signal?.throwIfAborted();
      const value = await globalThis.__CGPTX_RUNTIME__?.request("runtime.info", {
        extensionId: identity.id,
      });
      options?.signal?.throwIfAborted();
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid runtime information");
      }
      return Object.freeze({
        ...(value as RuntimeInfo),
        extension,
      });
    },
    capabilities,
  };

  const appearance = {
    header: {
      registerProperties(properties: HeaderCssProperties) {
        return tracked(entry, legacy.appearance.header.registerProperties(properties));
      },
      getProperties() {
        return legacy.appearance.header.getProperties();
      },
    },
    getColorScheme() {
      return legacy.appearance.getColorScheme();
    },
    openColorPicker(options: Parameters<LegacyPlatformApi["appearance"]["openColorPicker"]>[0]) {
      return tracked(entry, legacy.appearance.openColorPicker(options));
    },
  };

  const threads = {
    async getCurrent(windowId: WindowId, options?: RequestOptions) {
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
      subscribe(
        listener: (message: unknown) => void,
        options?: EventSubscriptionOptions,
      ) {
        if (typeof listener !== "function") {
          throw new TypeError("A thread event listener is required");
        }
        const signal = eventSubscriptionSignal(options);
        let first = true;
        let revision = 0;
        let active = true;
        let subscription: LegacyDisposable | undefined;
        let resource: Disposable;
        const emit = (message: unknown) => {
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
        if (options?.afterCursor !== undefined) {
          emit({
            type: "reset",
            cursor: "0",
            reason: "cursor-expired",
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
                  [state.windowId]: thread ? threadRef(thread) : null,
                },
                sections: [],
              },
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
              occurredAt: new Date().toISOString(),
              scope: { windowId: state.windowId },
              event: {
                type: "selected",
                windowId: state.windowId,
                thread: thread ? threadRef(thread) : null,
              },
            },
          });
        });
        if (!active) subscription.dispose();
        return dispose;
      },
    },
  };

  const contributions = {
    async listPoints(options?: CapabilityOptions) {
      const scope = requestedScope(options);
      return [
        ...listPointIds.map((id) => {
          const status = capabilityStatus(
            `ui.point.${id}`,
            scope,
            entry.controller.signal.aborted,
          );
          const available = status.state === "available";
          const builtInItemIds =
            id === "thread.header.menu" || id === "sidebar.thread-row.menu"
            ? [...new Set(threadBuiltInIds.values())]
            : id === "assistant-selection.actions"
              ? [...new Set(selectionBuiltInIds.values())]
              : id === "home.new-chat-suggestions"
                ? [...homeSuggestionBuiltInIds]
                : id === "sidebar.destinations"
                  ? [...sidebarBuiltInIds]
                  : id === "sidebar.product-mode.menu"
                    ? [...productModeBuiltInIds]
              : [];
          return {
            id,
            operation: "transform" as const,
            asynchronous: asynchronousListPoints.has(id),
            capabilityId: `ui.point.${id}` as const,
            state: available ? "available" as const : "unavailable" as const,
            ...(available
              ? {}
              : {
                  unavailableReason:
                    status.unavailableReason ?? "binding-unavailable",
                }),
            builtInItemIds: Object.freeze(builtInItemIds),
          };
        }),
        ...renderPointIds.map((id) => {
          const status = capabilityStatus(
            `ui.point.${id}`,
            scope,
            entry.controller.signal.aborted,
          );
          const available = status.state === "available";
          return {
            id,
            operation: "render" as const,
            capabilityId: `ui.point.${id}` as const,
            state: available ? "available" as const : "unavailable" as const,
            ...(available
              ? {}
              : {
                  unavailableReason:
                    status.unavailableReason ?? "binding-unavailable",
                }),
            builtInItemIds: Object.freeze([]),
          };
        }),
      ];
    },
    async listDefinitionKinds(options?: CapabilityOptions) {
      const scope = requestedScope(options);
      return definitionKinds.map((kind) => {
        const status = capabilityStatus(
          `ui.definition.${kind}`,
          scope,
          entry.controller.signal.aborted,
        );
        const available = status.state === "available";
        return {
          kind,
          capabilityId: `ui.definition.${kind}` as const,
          state: available ? "available" as const : "unavailable" as const,
          ...(available
            ? {}
            : {
                unavailableReason:
                  status.unavailableReason ?? "binding-unavailable",
              }),
          ...(kind === "settings-section"
            ? {
                supportedDefinitionShapes: Object.freeze([
                  "native-controls" as const,
                ]),
              }
            : {}),
        };
      });
    },
    transform(point: string, transformer: (...arguments_: unknown[]) => unknown) {
      if (point === "home.new-chat-suggestions") {
        const evaluations = new Map<string, EvaluationRecord>();
        const register = () => legacy.ui.transformSuggestions((items, legacyContext) => {
          const ownerId = legacyContext.ownerId;
          const evaluation = beginEvaluation(entry, evaluations, ownerId);
          try {
            const context = homeSuggestionContext(legacyContext);
            const mapping: LegacyItemMapping<LegacyUiActionItem> = {
              rawByPublicId: new Map(),
              opaqueSequence: 0,
            };
            const mapped = items.map((item) =>
              publicHomeSuggestionItem(item, context, mapping),
            );
            const transformed = transformer(mapped, context, {
              id: randomId("home-suggestions"),
              signal: evaluation.controller.signal,
            });
            if (
              transformed &&
              typeof (transformed as { readonly then?: unknown }).then === "function"
            ) {
              throw new Error(
                "The current exact binding requires a synchronous home suggestion transform",
              );
            }
            return (transformed as readonly UiListItem<HomeSuggestionItem>[]).map(
              (item) =>
                legacyHomeSuggestionItem(
                  item,
                  context,
                  identity.id,
                  mapping,
                ),
            );
          } catch (error) {
            abortEvaluations(evaluations, ownerId);
            throw error;
          }
        });
        return invalidatingRegistration(
          entry,
          register,
          (ownerId) => abortEvaluations(evaluations, ownerId),
        );
      }
      if (point === "home.announcements") {
        const evaluations = new Map<string, EvaluationRecord>();
        const register = () => legacy.ui.transformAnnouncements((items, legacyContext) => {
          const ownerId = legacyContext.ownerId;
          const evaluation = beginEvaluation(entry, evaluations, ownerId);
          try {
            const context = homeAnnouncementContext(legacyContext);
            const mapping: LegacyItemMapping<LegacyAnnouncementItem> = {
              rawByPublicId: new Map(),
              opaqueSequence: 0,
            };
            const mapped = items.map((item) =>
              publicAnnouncementItem(item, context, mapping),
            );
            const transformed = transformer(mapped, context, {
              id: randomId("home-announcements"),
              signal: evaluation.controller.signal,
            });
            if (
              transformed &&
              typeof (transformed as { readonly then?: unknown }).then === "function"
            ) {
              throw new Error(
                "The current exact binding requires a synchronous home announcement transform",
              );
            }
            return (transformed as readonly UiListItem<HomeAnnouncementItem>[]).map(
              (item) =>
                legacyAnnouncementItem(
                  item,
                  context,
                  identity.id,
                  mapping,
                ),
            );
          } catch (error) {
            abortEvaluations(evaluations, ownerId);
            throw error;
          }
        });
        return invalidatingRegistration(
          entry,
          register,
          (ownerId) => abortEvaluations(evaluations, ownerId),
        );
      }
      if (point === "sidebar.destinations") {
        const evaluations = new Map<string, EvaluationRecord>();
        const register = () =>
          legacy.ui.transformSidebarDestinations((items, legacyContext) => {
            const ownerId = legacyContext.ownerId;
            const evaluation = beginEvaluation(entry, evaluations, ownerId);
            try {
              const context = sidebarDestinationContext(legacyContext);
              const mapping: LegacyItemMapping<LegacyUiActionItem> = {
                rawByPublicId: new Map(),
                opaqueSequence: 0,
              };
              const mapped = items.map((item) =>
                publicSidebarDestinationItem(item, context, mapping),
              );
              const transformed = transformer(mapped, context, {
                id: randomId("sidebar-destinations"),
                signal: evaluation.controller.signal,
              });
              if (
                transformed &&
                typeof (transformed as { readonly then?: unknown }).then ===
                  "function"
              ) {
                throw new Error(
                  "The current exact binding requires a synchronous sidebar destination transform",
                );
              }
              return (
                transformed as readonly UiListItem<SidebarDestinationItem>[]
              ).map((item) =>
                legacySidebarDestinationItem(
                  item,
                  context,
                  identity.id,
                  mapping,
                ),
              );
            } catch (error) {
              abortEvaluations(evaluations, ownerId);
              throw error;
            }
          });
        return invalidatingRegistration(
          entry,
          register,
          (ownerId) => abortEvaluations(evaluations, ownerId),
        );
      }
      if (point === "sidebar.product-mode.menu") {
        const evaluations = new Map<string, EvaluationRecord>();
        const register = () => legacy.ui.transformProductModeMenu(
          (items, legacyContext) => {
            const ownerId = legacyContext.ownerId;
            const evaluation = beginEvaluation(entry, evaluations, ownerId);
            try {
              const context = productModeMenuContext(legacyContext);
              const mapping: LegacyItemMapping<LegacyUiActionItem> = {
                rawByPublicId: new Map(),
                opaqueSequence: 0,
              };
              const mapped = items.map((item) =>
                publicProductModeMenuItem(item, context, mapping),
              );
              const transformed = transformer(mapped, context, {
                id: randomId("product-mode-menu"),
                signal: evaluation.controller.signal,
              });
              if (
                transformed &&
                typeof (transformed as { readonly then?: unknown }).then ===
                  "function"
              ) {
                throw new Error(
                  "The current exact binding requires a synchronous product mode menu transform",
                );
              }
              return (transformed as readonly ProductModeMenuItem[]).map((item) =>
                legacyProductModeMenuItem(
                  item,
                  context,
                  identity.id,
                  mapping,
                ),
              );
            } catch (error) {
              abortEvaluations(evaluations, ownerId);
              throw error;
            }
          },
        );
        return invalidatingRegistration(
          entry,
          register,
          (ownerId) => abortEvaluations(evaluations, ownerId),
        );
      }
      if (point === "thread.header.menu" || point === "sidebar.thread-row.menu") {
        const evaluations = new Map<string, EvaluationRecord>();
        const register = () => legacy.menus.thread.transformItems((items, thread) => {
          const isSidebarOwner = thread.surface === "sidebar";
          if (
            (point === "thread.header.menu" && isSidebarOwner) ||
            (point === "sidebar.thread-row.menu" && !isSidebarOwner)
          ) {
            return items;
          }
          const ownerId = threadOwnerId(thread);
          const evaluation = beginEvaluation(entry, evaluations, ownerId);
          try {
            const context = point === "thread.header.menu"
              ? headerContext(thread)
              : sidebarThreadRowContext(thread);
            const mapping: LegacyItemMapping<LegacyMenuItem> = {
              rawByPublicId: new Map(),
              opaqueSequence: 0,
            };
            const mapped = items.map((item) =>
              publicThreadMenuItem(item, context, mapping),
            );
            const transformed = transformer(mapped, context, {
              id: randomId("thread-menu"),
              signal: evaluation.controller.signal,
            });
            const isPromise =
              transformed !== null &&
              typeof transformed === "object" &&
              typeof (transformed as { readonly then?: unknown }).then === "function";
            if (point === "thread.header.menu" && isPromise) {
              throw new Error(
                "The current exact binding requires a synchronous thread menu transform",
              );
            }
            const mapResult = (result: readonly PublicThreadMenuItem[]) =>
              result.map((item) =>
                legacyThreadMenuItem(item, context, identity.id, mapping),
              );
            return isPromise
              ? Promise.resolve(transformed).then((result) =>
                  mapResult(result as readonly PublicThreadMenuItem[]),
                )
              : mapResult(transformed as readonly PublicThreadMenuItem[]);
          } catch (error) {
            abortEvaluations(evaluations, ownerId);
            throw error;
          }
        });
        return refreshingRegistration(
          entry,
          register,
          (ownerId) => abortEvaluations(evaluations, ownerId),
        );
      }
      if (point === "assistant-selection.actions") {
        const evaluations = new Map<string, EvaluationRecord>();
        const register = () => legacy.menus.assistantSelection.transformItems(
          (items, legacyContext) => {
            const evaluation = beginEvaluation(entry, evaluations, "active-selection");
            try {
              const context = selectionContext(
                legacyContext,
                legacy.threads.getCurrent(),
              );
              const mapping: LegacyItemMapping<LegacyAssistantSelectionItem> = {
                rawByPublicId: new Map(),
                opaqueSequence: 0,
              };
              const mapped = items.map((item) =>
                publicSelectionItem(item, context, mapping),
              );
              const transformed = transformer(mapped, context, {
                id: randomId("selection"),
                signal: evaluation.controller.signal,
              });
              if (
                transformed &&
                typeof (transformed as { readonly then?: unknown }).then === "function"
              ) {
                throw new Error(
                  "The current exact binding requires a synchronous selection transform",
                );
              }
              return (
                transformed as readonly (AssistantSelectionActionItem | UiOpaqueItem)[]
              ).map((item) =>
                legacySelectionItem(item, context, identity.id, mapping),
              );
            } catch (error) {
              abortEvaluations(evaluations, "active-selection");
              throw error;
            }
          },
        );
        return refreshingRegistration(
          entry,
          register,
          (ownerId) => abortEvaluations(evaluations, ownerId),
        );
      }
      return unsupported(`Contribution transform ${point}`);
    },
    render(
      point: string,
      contribution: {
        readonly isVisible?: (context: unknown) => boolean;
        readonly render: (mount: unknown) => unknown;
      },
    ) {
      if (
        point === "composer.footer.leading" ||
        point === "composer.footer.trailing" ||
        point === "composer.action-bar.leading" ||
        point === "composer.action-bar.trailing" ||
        point === "composer.utility.leading" ||
        point === "composer.utility.trailing" ||
        point === "composer.attachments"
      ) {
        interface MountRecord {
          readonly ownerId: string;
          readonly container: HTMLElement;
          readonly controller: AbortController;
          readonly onLifetimeAbort: () => void;
          disposer: Disposable | undefined;
          seenConnected: boolean;
          disposed: boolean;
        }
        const mounts = new Map<string, Set<MountRecord>>();
        const cleanupMount = (mount: MountRecord) => {
          if (mount.disposed) return;
          mount.disposed = true;
          entry.controller.signal.removeEventListener(
            "abort",
            mount.onLifetimeAbort,
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
        const cleanupMounts = (ownerId?: string) => {
          const records = ownerId === undefined
            ? [...mounts.values()].flatMap((values) => [...values])
            : [...(mounts.get(ownerId) ?? [])];
          for (const mount of records) cleanupMount(mount);
        };
        const observer =
          typeof MutationObserver === "function" && document.documentElement
            ? new MutationObserver(() => {
                for (const values of mounts.values()) {
                  for (const mount of [...values]) {
                    if (mount.container.isConnected) mount.seenConnected = true;
                    else if (mount.seenConnected) cleanupMount(mount);
                  }
                }
              })
            : undefined;
        observer?.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
        const provider = (legacyContext: LegacyUiOwnerContext) => {
          const context = composerContext(legacyContext);
          if (contribution.isVisible && !contribution.isVisible(context)) {
            return undefined;
          }
          return {
            view() {
              const container = document.createElement("div");
              container.style.display = "contents";
              const controller = new AbortController();
              const onLifetimeAbort = () =>
                controller.abort(entry.controller.signal.reason);
              entry.controller.signal.addEventListener(
                "abort",
                onLifetimeAbort,
                { once: true },
              );
              const mount: MountRecord = {
                ownerId: context.ownerId,
                container,
                controller,
                onLifetimeAbort,
                seenConnected: false,
                disposed: false,
                disposer: undefined,
              };
              const ownerMounts = mounts.get(context.ownerId) ?? new Set();
              ownerMounts.add(mount);
              mounts.set(context.ownerId, ownerMounts);
              try {
                const disposer = contribution.render({
                  id: randomId(`composer-${point}`),
                  ownerId: context.ownerId,
                  windowId: state.windowId,
                  container,
                  context,
                  signal: controller.signal,
                });
                if (
                  disposer !== undefined &&
                  (!disposer ||
                    typeof disposer !== "object" ||
                    typeof (disposer as { readonly dispose?: unknown }).dispose !==
                      "function")
                ) {
                  throw new TypeError(
                    "A render provider must return a Disposable or undefined",
                  );
                }
                mount.disposer = disposer as Disposable | undefined;
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
            },
          };
        };
        let legacyRegistration = legacy.ui.registerRender(point, provider);
        let disposed = false;
        const result: UiRegistration = Object.freeze({
          invalidate(ownerId?: string) {
            if (disposed) return;
            cleanupMounts(ownerId);
            if (legacyRegistration.invalidate) {
              legacyRegistration.invalidate(ownerId);
            } else {
              legacyRegistration.dispose();
              legacyRegistration = legacy.ui.registerRender(point, provider);
            }
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            observer?.disconnect();
            cleanupMounts();
            legacyRegistration.dispose();
            entry.disposables.delete(result);
          },
        });
        return tracked(entry, result);
      }
      if (
        point !== "sidebar.thread-row.title-prefix" &&
        point !== "sidebar.thread-row.priority-indicator"
      ) {
        return unsupported(`Contribution render ${point}`);
      }
      const slot = point === "sidebar.thread-row.priority-indicator"
        ? "priority-indicator"
        : "title-prefix";
      interface MountRecord {
        readonly ownerId: string;
        readonly container: HTMLElement;
        readonly controller: AbortController;
        readonly onLifetimeAbort: () => void;
        disposer: Disposable | undefined;
        seenConnected: boolean;
        disposed: boolean;
      }
      const mounts = new Map<string, Set<MountRecord>>();
      const threadIdByOwnerId = new Map<string, string>();
      const cleanupMount = (mount: MountRecord) => {
        if (mount.disposed) return;
        mount.disposed = true;
        entry.controller.signal.removeEventListener(
          "abort",
          mount.onLifetimeAbort,
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
      const cleanupMounts = (ownerId?: string) => {
        const records = ownerId === undefined
          ? [...mounts.values()].flatMap((values) => [...values])
          : [...(mounts.get(ownerId) ?? [])];
        for (const mount of records) cleanupMount(mount);
      };
      const observer =
        typeof MutationObserver === "function" && document.documentElement
          ? new MutationObserver(() => {
              for (const values of mounts.values()) {
                for (const mount of [...values]) {
                  if (mount.container.isConnected) mount.seenConnected = true;
                  else if (mount.seenConnected) cleanupMount(mount);
                }
              }
            })
          : undefined;
      observer?.observe(document.documentElement, { childList: true, subtree: true });
      const legacyRegistration = legacy.threads.list.registerItem((thread) => {
        const ownerId = threadOwnerId(thread);
        threadIdByOwnerId.set(ownerId, thread.threadId);
        const currentThread = legacy.threads.getCurrent();
        const context = {
          ownerId,
          windowId: state.windowId,
          thread: threadSummary(thread),
          selected: thread.selected ?? sameThreadIdentity(currentThread, thread),
        };
        if (contribution.isVisible && !contribution.isVisible(context)) {
          return undefined;
        }
        return {
          view() {
            const container = document.createElement("span");
            container.style.display = "block";
            container.style.height = "100%";
            const controller = new AbortController();
            const onLifetimeAbort = () =>
              controller.abort(entry.controller.signal.reason);
            entry.controller.signal.addEventListener(
              "abort",
              onLifetimeAbort,
              { once: true },
            );
            const mount: MountRecord = {
              ownerId,
              container,
              controller,
              onLifetimeAbort,
              seenConnected: false,
              disposed: false,
              disposer: undefined,
            };
            const ownerMounts = mounts.get(ownerId) ?? new Set();
            ownerMounts.add(mount);
            mounts.set(ownerId, ownerMounts);
            try {
              const disposer = contribution.render({
                id: randomId(`thread-row-${slot}`),
                ownerId,
                windowId: state.windowId,
                container,
                context,
                signal: controller.signal,
              });
              if (
                disposer !== undefined &&
                (!disposer ||
                  typeof disposer !== "object" ||
                  typeof (disposer as { readonly dispose?: unknown }).dispose !==
                    "function")
              ) {
                throw new TypeError("A render provider must return a Disposable or undefined");
              }
              mount.disposer = disposer as Disposable | undefined;
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
          },
        };
      }, { slot });
      let disposed = false;
      const result: UiRegistration = Object.freeze({
        invalidate(ownerId?: string) {
          if (disposed) return;
          cleanupMounts(ownerId);
          legacyRegistration.invalidate(
            ownerId === undefined ? undefined : threadIdByOwnerId.get(ownerId),
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
        },
      });
      return tracked(entry, result);
    },
    register(
      kind: string,
      definition:
        | SettingsSectionDefinition
        | NativeSettingsControlsSectionDefinition
        | CommandDefinition
        | ComposerActionDefinition
        | AssistantDirectiveDefinition
        | AssistantContentReferenceDefinition
        | AssistantCodeBlockDefinition
        | ConversationItemRendererDefinition,
    ) {
      if (kind === "assistant-directive") {
        const next = definition as AssistantDirectiveDefinition;
        const context = memoizedRichContext(assistantDirectiveContext);
        const register = () =>
          legacy.ui.registerAssistantDirective({
            id: namespacedId(identity.id, next.id),
            name: next.name,
            provider: richContentProvider(
              entry,
              identity,
              "assistant-directive",
              context,
              next.render,
            ),
          });
        return invalidatingRegistration(entry, register, () => {});
      }
      if (kind === "assistant-content-reference") {
        const next = definition as AssistantContentReferenceDefinition;
        const context = memoizedRichContext(assistantContentReferenceContext);
        const register = () =>
          legacy.ui.registerAssistantContentReference({
            id: namespacedId(identity.id, next.id),
            type: next.type,
            ...(next.matches === undefined
              ? {}
              : { matches: (legacyContext) => next.matches?.(context(legacyContext)) === true }),
            provider: richContentProvider(
              entry,
              identity,
              "assistant-content-reference",
              context,
              next.render,
            ),
          });
        return invalidatingRegistration(entry, register, () => {});
      }
      if (kind === "assistant-code-block") {
        const next = definition as AssistantCodeBlockDefinition;
        const context = memoizedRichContext(assistantCodeBlockContext);
        const register = () =>
          legacy.ui.registerAssistantCodeBlock({
            id: namespacedId(identity.id, next.id),
            ...(next.language === undefined ? {} : { language: next.language }),
            ...(next.matches === undefined
              ? {}
              : { matches: (legacyContext) => next.matches?.(context(legacyContext)) === true }),
            provider: richContentProvider(
              entry,
              identity,
              "assistant-code-block",
              context,
              next.render,
            ),
          });
        return invalidatingRegistration(entry, register, () => {});
      }
      if (kind === "conversation-item") {
        const next = definition as ConversationItemRendererDefinition;
        const context = memoizedRichContext(conversationItemContext);
        const register = () =>
          legacy.ui.registerConversationItem({
            id: namespacedId(identity.id, next.id),
            type: next.type,
            ...(next.matches === undefined
              ? {}
              : { matches: (legacyContext) => next.matches?.(context(legacyContext)) === true }),
            provider: richContentProvider(
              entry,
              identity,
              "conversation-item",
              context,
              next.render,
            ),
          });
        return invalidatingRegistration(entry, register, () => {});
      }
      if (kind === "command") {
        return registerCommand(identity, entry, definition as CommandDefinition);
      }
      if (kind === "settings-section") {
        return registerSettingsSection(
          legacy,
          identity,
          entry,
          definition as
            | SettingsSectionDefinition
            | NativeSettingsControlsSectionDefinition,
        );
      }
      if (kind === "composer-action") {
        const action = definition as ComposerActionDefinition;
        let currentContext = composerContext({
          ownerId: "composer:main",
          kind: "main",
        });
        const publicContext = (legacyContext: LegacyUiOwnerContext) => {
          currentContext = composerContext(legacyContext);
          return currentContext;
        };
        const register = () =>
          legacy.ui.registerComposerAction({
            id: namespacedId(identity.id, action.id),
            placement: action.placement,
            label: action.label,
            ...(action.icon === undefined ? {} : { icon: action.icon }),
            ...(action.tooltip === undefined ? {} : { tooltip: action.tooltip }),
            ...(action.order === undefined ? {} : { order: action.order }),
            isVisible: (legacyContext: LegacyUiOwnerContext) =>
              action.isVisible?.(publicContext(legacyContext)) ?? true,
            isDisabled: (legacyContext: LegacyUiOwnerContext) =>
              action.isDisabled?.(publicContext(legacyContext)) ?? false,
            ...(action.menuItems === undefined
              ? {}
              : {
                  menuItems: action.menuItems.map((item) =>
                    legacyComposerMenuItem(
                      item,
                      () => currentContext,
                      identity.id,
                    ),
                  ),
                }),
            onClick: (legacyContext, next) =>
              action.onActivate(publicContext(legacyContext), activation(next)),
            origin: identity.id,
          });
        return invalidatingRegistration(entry, register, () => {});
      }
      return unsupported(`Contribution definition ${kind}`);
    },
  };

  const settings = {
    async get(key: string, options?: SettingReadOptions) {
      const signal = extensionSettingsOptions(options);
      await loadSettings(hub);
      signal?.throwIfAborted();
      return hub.values[key];
    },
    async set(key: string, value: JsonValue, options?: SettingWriteOptions) {
      const signal = extensionSettingsOptions(options);
      await loadSettings(hub);
      signal?.throwIfAborted();
      hub.values[key] = value;
      emitSetting(hub, key, value);
      await persistSettings(hub);
      signal?.throwIfAborted();
    },
    async delete(key: string, options?: SettingWriteOptions) {
      const signal = extensionSettingsOptions(options);
      await loadSettings(hub);
      signal?.throwIfAborted();
      delete hub.values[key];
      emitSetting(hub, key, undefined);
      await persistSettings(hub);
      signal?.throwIfAborted();
    },
    async batch(values: JsonObject, options?: SettingWriteOptions) {
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
    async listSections(options?: RequestOptions) {
      options?.signal?.throwIfAborted();
      return unsupported("Settings section listing");
    },
    async open(options?: SettingsOpenOptions) {
      const signal = options?.signal;
      signal?.throwIfAborted();
      if (options?.hostId !== undefined) {
        return unsupported("Host-scoped settings navigation");
      }
      const sectionId = options?.sectionId ?? "general-settings";
      if (typeof sectionId !== "string" || sectionId.length === 0) {
        throw new TypeError("A settings section id must be non-empty");
      }
      if (options?.controlId !== undefined && options.controlId.length === 0) {
        throw new TypeError("A settings control id must be non-empty");
      }
      // A local section ID has no dot. IDs returned by extension discovery are
      // already fully qualified, for example `reactions.settings`, and the
      // Extensions manager must be able to open them without changing them.
      const paneId = settingsTargetId(identity.id, sectionId);
      const opened = await legacy.settings.open(
        paneId,
        options?.controlId ? { itemId: `${paneId}.${options.controlId}` } : {},
      );
      signal?.throwIfAborted();
      if (!opened) throw new Error(`Settings section is unavailable: ${sectionId}`);
    },
    events(scope: SettingsScope) {
      if (scope.kind !== "extension") {
        return unsupported("Non-extension settings scope");
      }
      return {
        subscribe(
          listener: (message: unknown) => void,
          options?: EventSubscriptionOptions,
        ) {
          if (typeof listener !== "function") {
            throw new TypeError("A settings event listener is required");
          }
          const signal = eventSubscriptionSignal(options);
          let active = true;
          let resource: Disposable;
          const emit = (message: unknown) => {
            if (!active) return;
            try {
              listener(message);
            } catch (error) {
              console.error(`[${identity.id}] settings listener failed`, error);
            }
          };
          const onChange = (change: SettingChange) => {
            if (!active) return;
            state.sequence += 1;
            emit({
              type: "event",
              cursor: String(hub.revision),
              value: {
                id: `settings-${state.sequence}`,
                sequence: state.sequence,
                occurredAt: new Date().toISOString(),
                scope: {},
                event: change,
              },
            });
          };
          hub.listeners.add(onChange);
          if (options?.afterCursor !== undefined) {
            emit({
              type: "reset",
              cursor: String(hub.revision),
              reason: "cursor-expired",
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
                values: { ...hub.values },
              },
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
        },
      };
    },
  };

  const implemented = {
    runtime: apiNamespace("runtime", runtime),
    appearance: apiNamespace("appearance", appearance),
    contributions: apiNamespace("contributions", contributions),
    settings: apiNamespace("settings", settings),
    threads: apiNamespace("threads", threads),
  };
  return new Proxy(implemented, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      if (typeof property === "symbol") return undefined;
      return unavailableApiMember(String(property));
    },
  }) as unknown as ChatGPTXApi;
}

function normalizeInstalledExtensions(
  value: unknown,
): readonly InstalledExtension[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Invalid installed extension listing");
  }
  const ids = new Set<string>();
  return Object.freeze(
    value.map((entry): InstalledExtension => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new TypeError("Invalid installed extension listing");
      }
      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.id !== "string" ||
        !extensionIdPattern.test(candidate.id) ||
        ids.has(candidate.id) ||
        typeof candidate.name !== "string" ||
        typeof candidate.description !== "string" ||
        typeof candidate.version !== "string" ||
        typeof candidate.enabled !== "boolean" ||
        typeof candidate.required !== "boolean" ||
        (candidate.settingsSectionId !== undefined &&
          (typeof candidate.settingsSectionId !== "string" ||
            !candidate.settingsSectionId.startsWith(`${candidate.id}.`)))
      ) {
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
        ...(candidate.settingsSectionId === undefined
          ? {}
          : { settingsSectionId: candidate.settingsSectionId }),
      });
    }),
  );
}

function extensionsApi(callerExtensionId: string) {
  return Object.freeze({
    async list(options?: RequestOptions): Promise<readonly InstalledExtension[]> {
      options?.signal?.throwIfAborted();
      const result = await globalThis.__CGPTX_RUNTIME__?.request(
        "extensions.list",
        { extensionId: callerExtensionId },
      );
      options?.signal?.throwIfAborted();
      return normalizeInstalledExtensions(result);
    },
    async setEnabled(
      extensionId: string,
      enabled: boolean,
      options?: RequestOptions,
    ) {
      if (!extensionIdPattern.test(extensionId)) {
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
          enabled,
        },
      );
      options?.signal?.throwIfAborted();
      return normalizeInstalledExtensions(result);
    },
  });
}

function contextFor(
  legacy: LegacyPlatformApi,
  identity: AdapterIdentity,
  entry: ActiveEntry,
  phase: string,
): RendererExtensionContext {
  const state = adapterState();
  const extension: ExtensionIdentity = Object.freeze({
    ...identity,
    instanceId: `${identity.id}:${phase}:${state.documentId}`,
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
        url: globalThis.location?.href ?? "app://-/",
      },
    ),
    main: Object.freeze({
      async invoke<TResult extends ExtensionMessage | undefined = ExtensionMessage | undefined>(
        method: string,
        parameters?: ExtensionMessage,
        options?: { readonly signal?: AbortSignal },
      ): Promise<TResult> {
        if (typeof method !== "string" || method.length === 0) {
          throw new TypeError("A main-channel method is required");
        }
        options?.signal?.throwIfAborted();
        const callId = randomId("main-call");
        const onAbort = () => {
          void globalThis.__CGPTX_RUNTIME__?.request("main-channel.cancel", {
            extensionId: identity.id,
            documentId:
              globalThis.__CGPTX_RUNTIME__?.document?.id ?? state.documentId,
            callId,
          });
        };
        options?.signal?.addEventListener("abort", onAbort, { once: true });
        try {
          const value = await globalThis.__CGPTX_RUNTIME__?.request(
            "main-channel.invoke",
            {
              extensionId: identity.id,
              documentId:
                globalThis.__CGPTX_RUNTIME__?.document?.id ?? state.documentId,
              callId,
              method,
              ...(parameters === undefined ? {} : { parameters }),
            },
          );
          options?.signal?.throwIfAborted();
          return value as TResult;
        } finally {
          options?.signal?.removeEventListener("abort", onAbort);
        }
      },
      on(
        event: string,
        listener: (payload: ExtensionMessage | undefined) => void,
      ): Disposable {
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
              listener(payload as ExtensionMessage | undefined);
            } catch (error) {
              console.error(`[${identity.id}] main-channel listener failed`, error);
            }
          },
        );
        let result: Disposable;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          unsubscribe?.();
          entry.disposables.delete(result);
        };
        result = Object.freeze({ dispose });
        return tracked(entry, result);
      },
    }),
  });
}

export function activateExactBuildRendererExtension(
  hostApi: unknown,
  identity: AdapterIdentity,
  module: RendererModule,
  phase: "renderer" | "settings",
): void {
  const state = adapterState();
  const key = `${identity.id}:${phase}`;
  if (state.active.has(key)) return;
  const entry: ActiveEntry = {
    controller: new AbortController(),
    disposables: new Set(),
  };
  state.active.set(key, entry);
  const context = contextFor(
    hostApi as LegacyPlatformApi,
    identity,
    entry,
    phase,
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
        },
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

function reportActivation(
  extensionId: string,
  phase: "renderer" | "settings",
  status: "activated" | "failed",
  error?: unknown,
): void {
  try {
    void globalThis.__CGPTX_RUNTIME__
      ?.request("renderer-entry.report", {
        extensionId,
        phase,
        status,
        ...(error === undefined ? {} : { error: String(error) }),
      })
      .catch(() => {});
  } catch {
    // Activation reporting is diagnostic and must not affect the extension.
  }
}

export function deactivateExactBuildRendererExtension(
  extensionId: string,
  module: RendererModule,
  phase: "renderer" | "settings",
): void {
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
  const hasAnotherPhase = [...state.active.keys()].some((activeKey) =>
    activeKey.startsWith(`${extensionId}:`)
  );
  if (!hasAnotherPhase) {
    const hub = state.settings.get(extensionId);
    hub?.channel?.close();
    state.settings.delete(extensionId);
  }
  try {
    const result = module.deactivate?.();
    if (result && typeof result.then === "function") {
      void result.catch((error) =>
        console.error(`[${extensionId}] deactivation failed`, error),
      );
    }
  } catch (error) {
    console.error(`[${extensionId}] deactivation failed`, error);
  }
}
