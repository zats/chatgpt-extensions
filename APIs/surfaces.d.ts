import type {
  EventSource,
  HostId,
  JsonObject,
  RequestOptions,
  WindowId,
} from "./core.js";
import type { ThreadLocator } from "./identifiers.js";
import type {
  UiIcon,
  UiMenuItem,
  UiOwnerContext,
  UiRenderProvider,
} from "./ui-core.js";

export type SurfaceId = string;
export type SurfaceInstanceId = string;
export type TabId = string;

/** Current movable panel drop destinations. */
export type SurfacePlacement = "right-panel" | "bottom-panel";
export type ThreadPanelPlacement = SurfacePlacement;
export type SurfaceRegion =
  | "thread-chat"
  | "thread-summary"
  | ThreadPanelPlacement;

export type BuiltInSurfaceKind =
  | "thread"
  | "thread-summary"
  | "detail"
  | "browser"
  | "files"
  | "file-editor"
  | "review"
  | "terminal"
  | "side-chat"
  | "artifact"
  | "plan"
  | "goal"
  | "sources"
  | "subagents"
  | "automation"
  | "pull-request"
  | "mcp-app"
  | "mcp-extension"
  | "mcp-file"
  | "entity";

export interface SurfaceDescriptor {
  readonly id: SurfaceId;
  readonly kind: BuiltInSurfaceKind | "extension";
  readonly title: string;
  readonly icon?: UiIcon;
  readonly dropDestinations: readonly ThreadPanelPlacement[];
  readonly threadScoped: boolean;
  readonly closable: boolean;
  readonly movable: boolean;
}

export interface SurfaceInstance {
  readonly id: SurfaceInstanceId;
  readonly windowId: WindowId;
  /** Summary and chat regions are not movable tabs. */
  readonly tabId?: TabId;
  readonly descriptor: SurfaceDescriptor;
  readonly region: SurfaceRegion;
  readonly thread?: ThreadLocator;
  readonly visible: boolean;
  readonly activeInRegion: boolean;
  readonly focused: boolean;
  readonly title: string;
  readonly props?: JsonObject;
  readonly state?: JsonObject;
}

export interface BrowserSurfaceInput {
  readonly kind: "browser";
  readonly url?: string;
}

export interface FilesSurfaceInput {
  readonly kind: "files";
  readonly path?: string;
}

export interface FileEditorSurfaceInput {
  readonly kind: "file-editor";
  readonly path: string;
  readonly line?: number;
}

export interface ReviewSurfaceInput {
  readonly kind: "review";
  readonly source?:
    | { readonly kind: "last-turn" }
    | { readonly kind: "branch"; readonly baseBranch?: string }
    | { readonly kind: "uncommitted" }
    | { readonly kind: "unstaged" }
    | { readonly kind: "staged" }
    | { readonly kind: "commit"; readonly revision: string };
}

export interface TerminalSurfaceInput {
  readonly kind: "terminal";
  readonly cwd?: string;
}

export interface ThreadSurfaceInput {
  readonly kind: "thread" | "side-chat";
  readonly thread: ThreadLocator;
}

export type ArtifactReference =
  | { readonly kind: "external-resource"; readonly url: string; readonly title?: string }
  | { readonly kind: "file"; readonly path: string; readonly title?: string }
  | { readonly kind: "generated-image"; readonly path: string; readonly title?: string }
  | { readonly kind: "google-drive"; readonly url: string; readonly title?: string }
  | { readonly kind: "appgen-app"; readonly projectId: string; readonly title?: string }
  | { readonly kind: "website"; readonly url: string; readonly title?: string };

export interface ArtifactSurfaceInput {
  readonly kind: "artifact";
  readonly artifact: ArtifactReference;
}

export interface ThreadDetailSurfaceInput {
  readonly kind:
    | "thread-summary"
    | "detail"
    | "plan"
    | "goal"
    | "sources"
    | "subagents";
  readonly thread: ThreadLocator;
}

export interface AutomationSurfaceInput {
  readonly kind: "automation";
  readonly automationId?: string;
  readonly mode?: "view" | "create" | "edit";
}

export interface PullRequestSurfaceInput {
  readonly kind: "pull-request";
  readonly url?: string;
  readonly owner?: string;
  readonly repository?: string;
  readonly number?: number;
}

export type McpSurfaceInput =
  | {
      readonly kind: "mcp-app";
      readonly hostId: HostId;
      readonly serverId: string;
      readonly resourceUri: string;
      readonly toolName?: string;
    }
  | {
      readonly kind: "mcp-extension";
      readonly hostId: HostId;
      readonly serverId: string;
      readonly extensionId: string;
    }
  | {
      readonly kind: "mcp-file";
      readonly hostId: HostId;
      readonly serverId: string;
      readonly path: string;
    };

export interface EntitySurfaceInput {
  readonly kind: "entity";
  readonly entityId: string;
  readonly entityType: string;
}

export interface ExtensionSurfaceInput {
  readonly kind: "extension";
  readonly surfaceId: SurfaceId;
  readonly props?: JsonObject;
}

export type OpenSurfaceInput =
  | BrowserSurfaceInput
  | FilesSurfaceInput
  | FileEditorSurfaceInput
  | ReviewSurfaceInput
  | TerminalSurfaceInput
  | ThreadSurfaceInput
  | ArtifactSurfaceInput
  | ThreadDetailSurfaceInput
  | AutomationSurfaceInput
  | PullRequestSurfaceInput
  | McpSurfaceInput
  | EntitySurfaceInput
  | ExtensionSurfaceInput;

export interface OpenSurfaceOptions extends RequestOptions {
  readonly windowId: WindowId;
  readonly target?: SurfacePlacement;
  readonly thread?: ThreadLocator;
  readonly id?: SurfaceInstanceId;
  readonly title?: string;
  readonly icon?: UiIcon;
  readonly contextMenuItems?: readonly UiMenuItem<SurfaceActionContext>[];
  readonly insert?:
    | "start"
    | "end"
    | { readonly beforeTabId: TabId }
    | { readonly afterTabId: TabId };
  readonly replaceTabId?: TabId;
  readonly activate?: boolean;
  readonly preview?: boolean;
  /** Instance-scoped until close or the calling renderer lifetime aborts. */
  readonly trailingContent?: UiRenderProvider<SurfaceActionContext>;
  /** Called at most once while the calling renderer activation remains live. */
  readonly onClose?: (surface: SurfaceInstance) => void;
  /** Called for first-party moves while the calling renderer activation remains live. */
  readonly onMove?: (
    surface: SurfaceInstance,
    destination: ThreadPanelPlacement,
  ) => void;
}

export interface SurfaceDefinitionContext extends UiOwnerContext {
  readonly input: ExtensionSurfaceInput;
  readonly thread?: ThreadLocator;
  readonly target: ThreadPanelPlacement;
}

export interface SurfaceDurableRoute {
  readonly version: number;
  serialize(value: {
    readonly props: JsonObject;
    readonly state: JsonObject;
  }): JsonObject;
  restore(route: JsonObject): {
    readonly props: JsonObject;
    readonly state: JsonObject;
  } | null;
}

export interface ExtensionSurfaceDefinition {
  /** This is the app registry `kind`; the runtime namespaces it. */
  readonly id: SurfaceId;
  /** Mirrors the app panel registry's supported drop destinations. */
  readonly dropDestinations: readonly ThreadPanelPlacement[];
  readonly isAvailable?: (context: SurfaceDefinitionContext) => boolean;
  readonly getId?: (context: SurfaceDefinitionContext) => SurfaceInstanceId;
  readonly getTitle: (context: SurfaceDefinitionContext) => string;
  readonly getIcon?: (context: SurfaceDefinitionContext) => UiIcon | undefined;
  readonly getContextMenuItems?: (
    context: SurfaceDefinitionContext,
  ) =>
    | readonly UiMenuItem<SurfaceDefinitionContext>[]
    | Promise<readonly UiMenuItem<SurfaceDefinitionContext>[]>;
  readonly defaultState?: JsonObject;
  readonly durableRoute?: SurfaceDurableRoute;
  /** Mirrors the app registry's optional lazy preparation hook. */
  readonly load?: (signal: AbortSignal) => void | Promise<void>;
  readonly render: UiRenderProvider<ExtensionSurfaceRenderContext>;
}

export interface MainRouteContext extends UiOwnerContext {
  readonly routeId: string;
  readonly pathname: string;
  readonly props: JsonObject;
}

export interface MainRouteDurableRoute {
  readonly version: number;
  serialize(props: JsonObject): JsonObject;
  restore(route: JsonObject): JsonObject | null;
}

/** A definition served by the binding's one static extension-host route. */
export interface MainRouteDefinition {
  /** The runtime namespaces this ID to the calling extension. */
  readonly id: string;
  /** Static relative segment under `/extensions/<extension-id>/`; defaults to `id`. */
  readonly path?: string;
  readonly layout?: "product-shell" | "bare";
  readonly isAvailable?: (context: MainRouteContext) => boolean;
  readonly load?: (signal: AbortSignal) => void | Promise<void>;
  readonly durableRoute?: MainRouteDurableRoute;
  readonly render: UiRenderProvider<MainRouteContext>;
}

export interface ExtensionSurfaceRenderContext extends UiOwnerContext {
  readonly surface: SurfaceInstance;
  readonly tabId: TabId;
  readonly isActive: boolean;
  readonly props: JsonObject;
  readonly state: JsonObject;
  setState(state: JsonObject): void;
  close(): void;
  move(destination: ThreadPanelPlacement): void;
}

export interface SurfaceActionContext extends UiOwnerContext {
  readonly surface: SurfaceInstance;
}

export interface ThreadWorkspaceLayout {
  readonly mode: "full" | "split";
  readonly contentSide: "left" | "right";
  readonly sidePanelOpen: boolean;
  readonly bottomPanelOpen: boolean;
  readonly maximizedSurfaceId?: SurfaceInstanceId;
}

export type SurfaceEvent =
  | { readonly type: "opened"; readonly surface: SurfaceInstance }
  | { readonly type: "closed"; readonly surfaceId: SurfaceInstanceId }
  | { readonly type: "changed"; readonly surface: SurfaceInstance }
  | { readonly type: "focused"; readonly surfaceId: SurfaceInstanceId | null }
  | {
      readonly type: "layout-changed";
      readonly thread: ThreadLocator;
      readonly layout: ThreadWorkspaceLayout;
    };

export interface SurfaceSnapshot {
  readonly windowId: WindowId;
  readonly open: readonly SurfaceInstance[];
  readonly workspaces: readonly ThreadSurfaceState[];
  readonly focusedSurfaceId: SurfaceInstanceId | null;
}

export interface ThreadSurfaceState {
  readonly thread: ThreadLocator;
  readonly activeByPlacement: Readonly<
    Partial<Record<ThreadPanelPlacement, SurfaceInstanceId>>
  >;
  readonly summaryVisible: boolean;
  readonly layout: ThreadWorkspaceLayout;
}

export interface SurfacesApi {
  listBuiltIns(options?: RequestOptions): Promise<readonly SurfaceDescriptor[]>;
  listOpen(windowId: WindowId, options?: RequestOptions): Promise<readonly SurfaceInstance[]>;
  getFocused(windowId: WindowId, options?: RequestOptions): Promise<SurfaceInstance | null>;
  getActive(
    windowId: WindowId,
    thread: ThreadLocator,
    placement: ThreadPanelPlacement,
    options?: RequestOptions,
  ): Promise<SurfaceInstance | null>;
  open(input: OpenSurfaceInput, options: OpenSurfaceOptions): Promise<SurfaceInstance>;
  close(surfaceId: SurfaceInstanceId, options?: RequestOptions): Promise<void>;
  activate(surfaceId: SurfaceInstanceId, options?: RequestOptions): Promise<void>;
  move(
    surfaceId: SurfaceInstanceId,
    placement: ThreadPanelPlacement,
    options?: RequestOptions,
  ): Promise<void>;
  getThreadLayout(
    windowId: WindowId,
    thread: ThreadLocator,
    options?: RequestOptions,
  ): Promise<ThreadWorkspaceLayout>;
  setThreadLayout(
    windowId: WindowId,
    thread: ThreadLocator,
    layout: Partial<ThreadWorkspaceLayout>,
    options?: RequestOptions,
  ): Promise<void>;
  events(windowId: WindowId): EventSource<SurfaceEvent, SurfaceSnapshot>;
}
