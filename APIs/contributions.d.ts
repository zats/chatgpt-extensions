import type {
  AccountId,
  CapabilityScope,
  CapabilityUnavailableReason,
  HostId,
  JsonObject,
  RequestOptions,
} from "./core.js";
import type {
  AssistantContentReference,
  ConversationItem,
  ComposerState,
  UserMessageItem,
} from "./messages.js";
import type { ThreadLocator, TurnId } from "./identifiers.js";
import type {
  AssistantSelectionActionContext,
  AssistantSelectionActionItem,
  ThreadHeaderContext,
  ThreadHeaderMenuItem,
} from "./menus.js";
import type {
  AppDestination,
  CommandDefinition,
  CommandMenuProviderDefinition,
  SidebarSectionId,
} from "./shell.js";
import type {
  NativeSettingsControlsSectionDefinition,
  SettingsSectionDefinitionShape,
} from "./settings.js";
import type {
  ExtensionSurfaceDefinition,
  MainRouteDefinition,
  OpenSurfaceInput,
  ThreadPanelPlacement,
} from "./surfaces.js";
import type { ThreadSummary } from "./threads.js";
import type {
  UiActionItem,
  UiActivation,
  UiIcon,
  UiItemOrigin,
  UiListItem,
  UiMenuItem,
  UiOwnerContext,
  UiRegistration,
  UiRenderProvider,
} from "./ui-core.js";

export interface UiListPointSpec<
  TContext extends UiOwnerContext,
  TItem,
  TAsynchronous extends boolean,
> {
  readonly context: TContext;
  readonly item: TItem;
  readonly asynchronous: TAsynchronous;
}

export interface UiRenderPointSpec<
  TContext extends UiOwnerContext,
  TOptions extends object,
> {
  readonly context: TContext;
  readonly options: TOptions;
}

export interface AssistantMessageUiContext extends UiOwnerContext {
  readonly message: import("./messages.js").AssistantMessageItem;
  readonly completed: boolean;
}

/** Stable owner data shared by assistant rich-content renderers. */
export interface AssistantContentUiContext extends UiOwnerContext {
  /** Canonical routable identity for the thread that owns this content. */
  readonly thread: ThreadLocator;
  readonly conversationId: string;
  readonly messageId?: string;
  readonly turnId?: TurnId;
  readonly hostId?: HostId;
  readonly streaming: boolean;
}

export interface AssistantDirectiveValue {
  readonly name: string;
  readonly kind: "leaf" | "container";
  readonly attributes: Readonly<Record<string, string>>;
  readonly directiveId?: string;
  readonly terminalInline: boolean;
  readonly content?: string;
}

export interface AssistantDirectiveUiContext extends AssistantContentUiContext {
  readonly directive: AssistantDirectiveValue;
}

/** Maps one Markdown directive through ChatGPT's directive component map. */
export interface AssistantDirectiveDefinition {
  readonly id: string;
  readonly name: string;
  readonly render: UiRenderProvider<AssistantDirectiveUiContext>;
}

export interface AssistantContentReferenceUiContext
  extends AssistantContentUiContext {
  readonly reference: AssistantContentReference;
  readonly index: number;
  readonly terminalInline: boolean;
}

/** Maps one ChatGPT content-reference type before its first-party dispatcher. */
export interface AssistantContentReferenceDefinition {
  readonly id: string;
  readonly type: string;
  readonly matches?: (context: AssistantContentReferenceUiContext) => boolean;
  readonly render: UiRenderProvider<AssistantContentReferenceUiContext>;
}

export interface AssistantCodeBlockValue {
  readonly index: number;
  readonly language?: string;
  readonly content: string;
  readonly fenceOpen: boolean;
  readonly info?: string;
}

export interface AssistantCodeBlockUiContext extends AssistantContentUiContext {
  readonly codeBlock: AssistantCodeBlockValue;
}

/** Maps a fenced block before ChatGPT selects its normal rich block UI. */
export interface AssistantCodeBlockDefinition {
  readonly id: string;
  readonly language?: string;
  readonly matches?: (context: AssistantCodeBlockUiContext) => boolean;
  readonly render: UiRenderProvider<AssistantCodeBlockUiContext>;
}

export interface ConversationItemUiContext extends UiOwnerContext {
  readonly conversationId: string;
  readonly turnId?: TurnId;
  readonly hostId?: HostId;
  readonly item: ConversationItem;
  readonly layout: "standalone" | "grouped";
}

/** Maps one typed conversation item before ChatGPT's item dispatcher. */
export interface ConversationItemRendererDefinition {
  readonly id: string;
  readonly type: string;
  readonly matches?: (context: ConversationItemUiContext) => boolean;
  readonly render: UiRenderProvider<ConversationItemUiContext>;
}

export interface AssistantMessageActionDefinition
  extends UiActionItem<AssistantMessageUiContext> {
  readonly messageKind: "assistant";
  /** Maps to the host's additional or persistent React-node collection. */
  readonly placement?: "additional" | "persistent";
  readonly order?: number;
  readonly isVisible?: (context: AssistantMessageUiContext) => boolean;
  readonly isDisabled?: (context: AssistantMessageUiContext) => boolean;
  readonly onActivate: (
    context: AssistantMessageUiContext,
    activation: UiActivation,
  ) => void | Promise<void>;
}

export interface UserMessageUiContext extends UiOwnerContext {
  readonly message: UserMessageItem;
}

export interface UserMessageActionDefinition
  extends UiActionItem<UserMessageUiContext> {
  readonly messageKind: "user";
  readonly order?: number;
  readonly isVisible?: (context: UserMessageUiContext) => boolean;
  readonly isDisabled?: (context: UserMessageUiContext) => boolean;
  readonly onActivate: (
    context: UserMessageUiContext,
    activation: UiActivation,
  ) => void | Promise<void>;
}

export type MessageActionDefinition =
  | AssistantMessageActionDefinition
  | UserMessageActionDefinition;

export type BuiltInHomeSuggestionId =
  | "codex-explore"
  | "codex-create"
  | "codex-review"
  | "codex-fix";

export type HomeComposerMode = "chat" | "work";

export interface HomeSuggestionContext extends UiOwnerContext {
  readonly composer: ComposerState;
  readonly composerMode: HomeComposerMode;
  readonly layout: "cards" | "list";
  readonly hostId: HostId;
  readonly projectRoot?: string;
  readonly plan: boolean;
}

/**
 * One item rendered by ChatGPT's `HomeSuggestionSurface`.
 *
 * The exact binding converts this descriptor to the app's own card or list
 * item. An activation callback can use `context.composer.id` with the composer
 * service to fill or submit the draft.
 */
export interface HomeSuggestionItem
  extends UiActionItem<HomeSuggestionContext> {
  readonly id: BuiltInHomeSuggestionId | (string & {});
  readonly description?: string;
  readonly listIcon?: UiIcon;
  readonly keyboardShortcut?: string;
  readonly order?: number;
  readonly onActivate: (
    context: HomeSuggestionContext,
    activation: UiActivation,
  ) => void | Promise<void>;
  readonly onDismiss?: (
    context: HomeSuggestionContext,
    activation: UiActivation,
  ) => void | Promise<void>;
}

export interface HomeAnnouncementContext extends UiOwnerContext {
  readonly composer: ComposerState;
  readonly entryPoint: string;
  readonly homeComposerMode: HomeComposerMode;
  readonly isLocalModeRemote: boolean;
  readonly onboardingPromosHidden: boolean;
}

export interface HomeAnnouncementActionItem
  extends UiActionItem<HomeAnnouncementContext> {
  readonly onActivate: (
    context: HomeAnnouncementContext,
    activation: UiActivation,
  ) => void | Promise<void>;
}

/**
 * One ordered entry in ChatGPT's `HomeComposerAnnouncements` owner.
 *
 * The owner shows the first entry that is eligible or loading. The binding
 * reconstructs eligible extension entries with ChatGPT's announcement card.
 */
export interface HomeAnnouncementItem {
  readonly kind: "announcement";
  readonly id: string;
  readonly isEligible: boolean;
  readonly isLoading?: boolean;
  readonly title: string;
  readonly description?: string;
  readonly leadingVisual?: UiIcon;
  readonly primaryAction?: HomeAnnouncementActionItem;
  readonly dismissAction?: HomeAnnouncementActionItem;
  /** Set by the runtime. */
  readonly origin?: UiItemOrigin;
}

export type BuiltInProductModeMenuItemId = "app.work" | "app.codex";

export interface ProductModeMenuContext extends UiOwnerContext {
  readonly mode: "work" | "codex";
  readonly workModeAccess: "chatgpt" | "chatgpt_work" | "work";
  readonly disabled: boolean;
}

export type ProductModeMenuItem = UiMenuItem<ProductModeMenuContext>;

export type BuiltInSidebarDestinationId =
  | "app.archive"
  | "app.automations"
  | "app.debug"
  | "app.finance"
  | "app.library"
  | "app.projects"
  | "app.pull-requests"
  | "app.security"
  | "app.sites"
  | "app.skills"
  | `app.mcp:${string}`;

export interface SidebarDestinationContext extends UiOwnerContext {
  readonly mode: "chatgpt" | "work" | "codex";
  readonly selectedDestination: AppDestination;
}

export interface SidebarDestinationItem {
  readonly kind: "destination";
  readonly id: BuiltInSidebarDestinationId | (string & {});
  readonly label: string;
  readonly icon?: UiIcon;
  readonly railIcon?: UiIcon;
  readonly animatedIcon?: UiIcon;
  readonly customizable?: boolean;
  readonly defaultLocation?: "sidebar" | "explore";
  readonly visibleByDefault?: boolean;
  readonly destination?: AppDestination;
  readonly hasUnreadActivity?: boolean;
  readonly disabled?: boolean;
  readonly trailingActions?: readonly UiActionItem<SidebarDestinationContext>[];
  readonly contextMenuItems?: readonly UiMenuItem<SidebarDestinationContext>[];
  readonly getContextMenuItems?: (
    context: SidebarDestinationContext,
  ) =>
    | readonly UiMenuItem<SidebarDestinationContext>[]
    | Promise<readonly UiMenuItem<SidebarDestinationContext>[]>;
  readonly isCurrentDestination?: (context: SidebarDestinationContext) => boolean;
  readonly onPrefetch?: (context: SidebarDestinationContext) => void | Promise<void>;
  readonly onSelect?: (
    context: SidebarDestinationContext,
    activation: UiActivation,
  ) => void | Promise<void>;
  /** Set by the runtime. */
  readonly origin?: UiItemOrigin;
}

export interface SidebarThreadRowContext extends UiOwnerContext {
  readonly thread: ThreadSummary;
  readonly sectionId?: SidebarSectionId;
  readonly selected: boolean;
}

export interface SidebarThreadRowActionItem
  extends UiActionItem<SidebarThreadRowContext> {
  readonly visibility?: "hover" | "always";
}

/**
 * Options for ChatGPT's title-prefix slot on a thread row.
 *
 * The binding supplies the contribution through ChatGPT's first-party
 * `titlePrefix` slot. A false visibility result creates no host container and
 * no gap. The mount container has the app row-title height. The exact current
 * adapter attaches this slot to local execution rows and signed-in cloud rows.
 */
export interface SidebarThreadRowTitlePrefixOptions {
  readonly isVisible?: (context: SidebarThreadRowContext) => boolean;
}

/**
 * Options for ChatGPT's priority-indicator slot on a thread row.
 *
 * The slot stays outside the animated title marquee. A false visibility
 * result creates no host container and does not reserve the indicator rail.
 * The exact current adapter attaches this slot to local execution rows and
 * signed-in cloud rows through their first-party `priorityIndicatorNode` prop.
 */
export interface SidebarThreadRowPriorityIndicatorOptions {
  readonly isVisible?: (context: SidebarThreadRowContext) => boolean;
}

export interface SidebarDestinationRenderContext
  extends SidebarDestinationContext {
  readonly destinationId: string;
}

export interface ProfileMenuContext extends UiOwnerContext {
  readonly accountId?: AccountId;
}

export type ProfileMenuItem = UiMenuItem<ProfileMenuContext>;

export interface ComposerUtilityContext extends UiOwnerContext {
  readonly composer: ComposerState;
}

export type ComposerActionPlacement =
  | "composer.footer.leading"
  | "composer.footer.trailing"
  | "composer.action-bar.leading"
  | "composer.action-bar.trailing"
  | "composer.utility.leading"
  | "composer.utility.trailing";

/**
 * A native composer control rendered with ChatGPT's button and menu
 * components. Use the composer render points for arbitrary extension UI.
 */
export interface ComposerActionDefinition
  extends UiActionItem<ComposerUtilityContext> {
  readonly placement: ComposerActionPlacement;
  readonly order?: number;
  readonly isVisible?: (context: ComposerUtilityContext) => boolean;
  readonly isDisabled?: (context: ComposerUtilityContext) => boolean;
  readonly menuItems?: readonly UiMenuItem<ComposerUtilityContext>[];
  readonly onActivate: (
    context: ComposerUtilityContext,
    activation: UiActivation,
  ) => void | Promise<void>;
}

export interface SurfacePickerContext extends UiOwnerContext {
  readonly thread: ThreadSummary;
  readonly dropDestination: ThreadPanelPlacement;
}

export interface SurfacePickerItem
  extends UiActionItem<SurfacePickerContext> {
  readonly surface?: OpenSurfaceInput;
  readonly keybinding?: string;
}

/**
 * Typed app-owned descriptor lists. New stable points are added only after an
 * exact-build binding proves their semantic owner and attachment.
 */
export interface UiListPointMap {
  readonly "home.new-chat-suggestions": UiListPointSpec<
    HomeSuggestionContext,
    UiListItem<HomeSuggestionItem>,
    false
  >;
  readonly "home.announcements": UiListPointSpec<
    HomeAnnouncementContext,
    UiListItem<HomeAnnouncementItem>,
    false
  >;
  readonly "assistant-selection.actions": UiListPointSpec<
    AssistantSelectionActionContext,
    UiListItem<AssistantSelectionActionItem>,
    false
  >;
  readonly "thread.header.menu": UiListPointSpec<
    ThreadHeaderContext,
    ThreadHeaderMenuItem,
    false
  >;
  readonly "sidebar.destinations": UiListPointSpec<
    SidebarDestinationContext,
    UiListItem<SidebarDestinationItem>,
    false
  >;
  readonly "sidebar.product-mode.menu": UiListPointSpec<
    ProductModeMenuContext,
    ProductModeMenuItem,
    false
  >;
  readonly "sidebar.thread-row.actions": UiListPointSpec<
    SidebarThreadRowContext,
    UiListItem<SidebarThreadRowActionItem>,
    false
  >;
  readonly "sidebar.thread-row.menu": UiListPointSpec<
    SidebarThreadRowContext,
    UiMenuItem<SidebarThreadRowContext>,
    true
  >;
  readonly "profile.menu": UiListPointSpec<
    ProfileMenuContext,
    ProfileMenuItem,
    true
  >;
  readonly "surface.new-tab": UiListPointSpec<
    SurfacePickerContext,
    UiListItem<SurfacePickerItem>,
    false
  >;
}

export interface ThreadHeaderActionOptions {
  readonly actionId: string;
  readonly align?: "start" | "center" | "end";
  readonly order?: number;
  /** The binding maps this to the active header owner's position prop. */
  readonly position?: "left" | "center" | "right" | "main";
}

export interface MessageActionSlotOptions {
  readonly id: string;
  readonly order?: number;
}

export interface SurfaceChromeContext extends UiOwnerContext {
  readonly thread: ThreadSummary;
  readonly dropDestination: ThreadPanelPlacement;
}

export interface UiRenderPointMap {
  readonly "thread.header.action": UiRenderPointSpec<
    ThreadHeaderContext,
    ThreadHeaderActionOptions
  >;
  readonly "assistant-message.additional-actions": UiRenderPointSpec<
    AssistantMessageUiContext,
    MessageActionSlotOptions
  >;
  readonly "assistant-message.persistent-actions": UiRenderPointSpec<
    AssistantMessageUiContext,
    MessageActionSlotOptions
  >;
  readonly "assistant-message.after": UiRenderPointSpec<AssistantMessageUiContext, {}>;
  readonly "user-message.additional-actions": UiRenderPointSpec<
    UserMessageUiContext,
    MessageActionSlotOptions
  >;
  readonly "sidebar.destination.trailing": UiRenderPointSpec<
    SidebarDestinationRenderContext,
    {}
  >;
  readonly "sidebar.thread-row.title-prefix": UiRenderPointSpec<
    SidebarThreadRowContext,
    SidebarThreadRowTitlePrefixOptions
  >;
  readonly "sidebar.thread-row.priority-indicator": UiRenderPointSpec<
    SidebarThreadRowContext,
    SidebarThreadRowPriorityIndicatorOptions
  >;
  readonly "sidebar.thread-row.title-suffix": UiRenderPointSpec<
    SidebarThreadRowContext,
    {}
  >;
  readonly "sidebar.thread-row.secondary": UiRenderPointSpec<
    SidebarThreadRowContext,
    {}
  >;
  readonly "sidebar.thread-row.indicator-idle": UiRenderPointSpec<
    SidebarThreadRowContext,
    {}
  >;
  readonly "sidebar.thread-row.indicator-rest": UiRenderPointSpec<
    SidebarThreadRowContext,
    {}
  >;
  readonly "sidebar.thread-row.indicator-hover": UiRenderPointSpec<
    SidebarThreadRowContext,
    {}
  >;
  readonly "sidebar.thread-row.meta": UiRenderPointSpec<SidebarThreadRowContext, {}>;
  readonly "sidebar.thread-row.overlay-meta": UiRenderPointSpec<
    SidebarThreadRowContext,
    {}
  >;
  readonly "composer.footer.leading": UiRenderPointSpec<ComposerUtilityContext, {}>;
  readonly "composer.footer.trailing": UiRenderPointSpec<ComposerUtilityContext, {}>;
  readonly "composer.action-bar.leading": UiRenderPointSpec<ComposerUtilityContext, {}>;
  readonly "composer.action-bar.trailing": UiRenderPointSpec<ComposerUtilityContext, {}>;
  readonly "composer.utility.leading": UiRenderPointSpec<ComposerUtilityContext, {}>;
  readonly "composer.utility.trailing": UiRenderPointSpec<ComposerUtilityContext, {}>;
  readonly "composer.attachments": UiRenderPointSpec<ComposerUtilityContext, {}>;
  readonly "composer.banners": UiRenderPointSpec<ComposerUtilityContext, {}>;
  readonly "right-panel.tabs.before": UiRenderPointSpec<SurfaceChromeContext, {}>;
  readonly "right-panel.tabs.after": UiRenderPointSpec<SurfaceChromeContext, {}>;
  readonly "right-panel.tabs.after-sticky": UiRenderPointSpec<SurfaceChromeContext, {}>;
  readonly "right-panel.empty-state": UiRenderPointSpec<SurfaceChromeContext, {}>;
  readonly "bottom-panel.tabs.after": UiRenderPointSpec<SurfaceChromeContext, {}>;
  readonly "bottom-panel.tabs.after-sticky": UiRenderPointSpec<SurfaceChromeContext, {}>;
  readonly "bottom-panel.empty-state": UiRenderPointSpec<SurfaceChromeContext, {}>;
}

export interface UiDefinitionMap {
  readonly "assistant-code-block": AssistantCodeBlockDefinition;
  readonly "assistant-content-reference": AssistantContentReferenceDefinition;
  readonly "assistant-directive": AssistantDirectiveDefinition;
  readonly command: CommandDefinition;
  readonly "command-menu-provider": CommandMenuProviderDefinition;
  readonly "composer-action": ComposerActionDefinition;
  readonly "main-route": MainRouteDefinition;
  readonly "message-action": MessageActionDefinition;
  readonly "conversation-item": ConversationItemRendererDefinition;
  readonly surface: ExtensionSurfaceDefinition;
  readonly "settings-section": NativeSettingsControlsSectionDefinition;
}

export type UiListPointId = keyof UiListPointMap;
export type UiRenderPointId = keyof UiRenderPointMap;
export type UiDefinitionKind = keyof UiDefinitionMap;
export type UiContributionPointId = UiListPointId | UiRenderPointId;

export type UiPointItem<TPoint extends UiListPointId> =
  UiListPointMap[TPoint]["item"];
export type UiPointContext<TPoint extends UiListPointId> =
  UiListPointMap[TPoint]["context"];
export type UiRenderPointContext<TPoint extends UiRenderPointId> =
  UiRenderPointMap[TPoint]["context"];
export type UiRenderPointOptions<TPoint extends UiRenderPointId> =
  UiRenderPointMap[TPoint]["options"];
export type UiRenderContribution<TPoint extends UiRenderPointId> =
  UiRenderPointOptions<TPoint> & {
    readonly render: UiRenderProvider<UiRenderPointContext<TPoint>>;
  };
export type UiTransformResult<TPoint extends UiListPointId> =
  UiListPointMap[TPoint]["asynchronous"] extends true
    ? readonly UiPointItem<TPoint>[] | Promise<readonly UiPointItem<TPoint>[]>
    : readonly UiPointItem<TPoint>[];
export interface UiTransformEvaluation {
  readonly id: string;
  /** Aborts when this result can no longer be applied to its owner. */
  readonly signal: AbortSignal;
}
export type UiTransformer<TPoint extends UiListPointId> = (
  items: readonly UiPointItem<TPoint>[],
  context: UiPointContext<TPoint>,
  evaluation: UiTransformEvaluation,
) => UiTransformResult<TPoint>;

export interface UiDiscoveryOptions extends RequestOptions {
  /** Optional owner scope for account, window, or thread feature gates. */
  readonly scope?: CapabilityScope;
}

export type UiPointDescriptor<
  TPoint extends UiContributionPointId = UiContributionPointId,
> = TPoint extends UiListPointId
  ? {
      readonly id: TPoint;
      readonly operation: "transform";
      readonly asynchronous: UiListPointMap[TPoint]["asynchronous"];
      readonly capabilityId: `ui.point.${TPoint}`;
      readonly state: "available" | "unavailable";
      readonly unavailableReason?: CapabilityUnavailableReason;
      /** Stable semantic IDs in the initial app-owned list for this scope. */
      readonly builtInItemIds: readonly string[];
    }
  : TPoint extends UiRenderPointId
    ? {
        readonly id: TPoint;
        readonly operation: "render";
        readonly capabilityId: `ui.point.${TPoint}`;
        readonly state: "available" | "unavailable";
        readonly unavailableReason?: CapabilityUnavailableReason;
        readonly builtInItemIds: readonly [];
      }
    : never;

export type UiDefinitionDescriptor<
  TKind extends UiDefinitionKind = UiDefinitionKind,
> = TKind extends UiDefinitionKind
  ? {
      readonly kind: TKind;
      readonly capabilityId: `ui.definition.${TKind}`;
      readonly state: "available" | "unavailable";
      readonly unavailableReason?: CapabilityUnavailableReason;
    } & (TKind extends "settings-section"
      ? {
          /** Exact exported definition shapes accepted by this adapter. */
          readonly supportedDefinitionShapes: readonly SettingsSectionDefinitionShape[];
        }
      : {})
  : never;

export interface ContributionsApi {
  /** Lists every stable point and its state in the active exact-build adapter. */
  listPoints(options?: UiDiscoveryOptions): Promise<readonly UiPointDescriptor[]>;

  /** Lists addressable definition registries and their current state. */
  listDefinitionKinds(
    options?: UiDiscoveryOptions,
  ): Promise<readonly UiDefinitionDescriptor[]>;

  transform<TPoint extends UiListPointId>(
    point: TPoint,
    transformer: UiTransformer<TPoint>,
  ): UiRegistration;

  register<TKind extends UiDefinitionKind>(
    kind: TKind,
    definition: UiDefinitionMap[TKind],
  ): UiRegistration;

  render<TPoint extends UiRenderPointId>(
    point: TPoint,
    contribution: UiRenderContribution<TPoint>,
  ): UiRegistration;
}
