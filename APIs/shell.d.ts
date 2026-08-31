import type {
  EventSource,
  JsonObject,
  RequestOptions,
  WindowId,
} from "./core.js";
import type { ProjectLocator, ThreadLocator } from "./identifiers.js";
import type { UiOwnerContext, UiRenderProvider } from "./ui-core.js";

export type CommandId = string;

export interface CommandDescriptor {
  readonly id: CommandId;
  readonly title: string;
  readonly description?: string;
  readonly group?: string;
  readonly keybindings: readonly string[];
  readonly menuTitle?: string;
  readonly requiredAccess?: string;
  readonly shortcutScope?: string;
  readonly enabled: boolean;
  readonly visible: boolean;
}

export interface CommandContext {
  readonly thread?: ThreadLocator;
  readonly project?: ProjectLocator;
  readonly surfaceId?: string;
  readonly arguments?: JsonObject;
}

export interface CommandDefinition {
  /** The runtime namespaces this ID to the calling extension. */
  readonly id: CommandId;
  readonly title: string;
  readonly description?: string;
  readonly group?: string;
  readonly defaultKeybindings?: readonly string[];
  readonly platformDefaultKeybindings?: Readonly<
    Partial<Record<"macos" | "windows" | "linux", readonly string[]>>
  >;
  readonly menuTitle?: string;
  readonly requiredAccess?: string;
  readonly shortcutScope?: string;
  readonly allowsBareModifiers?: boolean;
  readonly isOverridableByBrowserWebpage?: boolean;
  readonly isEnabled?: (context: CommandContext) => boolean;
  readonly isActive?: (context: CommandContext) => boolean;
  readonly priority?: number;
  readonly handler: (context: CommandContext) => void | Promise<void>;
}

export interface CommandMenuProviderContext extends UiOwnerContext {
  readonly query: string;
  close(): void;
  clearSearch(): void;
}

export interface CommandMenuProviderDefinition {
  /** The runtime namespaces this ID to the calling extension. */
  readonly id: string;
  readonly order?: number;
  readonly groupKey?: string;
  readonly exclusive?: boolean;
  readonly requiredAccess?: string;
  readonly feature?: string;
  readonly isEnabled?: (context: CommandMenuProviderContext) => boolean;
  readonly render: UiRenderProvider<CommandMenuProviderContext>;
}

export type CommandEvent =
  | { readonly type: "registered"; readonly command: CommandDescriptor }
  | { readonly type: "changed"; readonly command: CommandDescriptor }
  | { readonly type: "unregistered"; readonly commandId: CommandId };

export interface CommandSnapshot {
  readonly commands: readonly CommandDescriptor[];
}

export interface CommandsApi {
  list(options?: RequestOptions): Promise<readonly CommandDescriptor[]>;
  get(commandId: CommandId, options?: RequestOptions): Promise<CommandDescriptor | null>;
  execute(commandId: CommandId, context?: CommandContext & RequestOptions): Promise<void>;
  readonly events: EventSource<CommandEvent, CommandSnapshot>;
}

export type AppDestination =
  | { readonly kind: "home"; readonly mode?: "chatgpt" | "work" | "codex" }
  | { readonly kind: "thread"; readonly thread: ThreadLocator }
  | { readonly kind: "project"; readonly project?: ProjectLocator }
  | { readonly kind: "archive" }
  | { readonly kind: "automations"; readonly automationId?: string }
  | { readonly kind: "connections" }
  | { readonly kind: "debug" }
  | { readonly kind: "finance" }
  | { readonly kind: "global-search"; readonly query?: string }
  | { readonly kind: "library"; readonly itemId?: string }
  | { readonly kind: "plugins"; readonly pluginId?: string }
  | {
      readonly kind: "pull-request";
      readonly host?: string;
      readonly owner?: string;
      readonly repository?: string;
      readonly number?: number;
    }
  | { readonly kind: "quick-chat" }
  | { readonly kind: "security"; readonly findingId?: string }
  | { readonly kind: "settings"; readonly sectionId?: string }
  | { readonly kind: "sites"; readonly projectId?: string }
  | { readonly kind: "skills"; readonly skillId?: string }
  | { readonly kind: "extension"; readonly routeId: string; readonly props?: JsonObject };

export interface NavigationState {
  readonly windowId: WindowId;
  readonly destination: AppDestination;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

export interface NavigationApi {
  getCurrent(windowId: WindowId, options?: RequestOptions): Promise<NavigationState>;
  navigate(windowId: WindowId, destination: AppDestination, options?: RequestOptions): Promise<void>;
  back(windowId: WindowId, options?: RequestOptions): Promise<void>;
  forward(windowId: WindowId, options?: RequestOptions): Promise<void>;
  events(windowId: WindowId): EventSource<NavigationState, NavigationState>;
}

export type SidebarSectionId = string;
export type SidebarItemId = string;

export interface SidebarSection {
  readonly id: SidebarSectionId;
  readonly title: string;
  readonly custom: boolean;
  readonly collapsed: boolean;
  readonly order: number;
}

export type SidebarItem =
  | {
      readonly id: SidebarItemId;
      readonly kind: "thread";
      readonly thread: ThreadLocator;
      readonly sectionId?: SidebarSectionId;
      readonly title: string;
      readonly pinned: boolean;
    }
  | {
      readonly id: SidebarItemId;
      readonly kind: "project";
      readonly project: ProjectLocator;
      readonly sectionId?: SidebarSectionId;
      readonly title: string;
      readonly pinned: boolean;
    }
  | {
      readonly id: SidebarItemId;
      readonly kind: "destination";
      readonly destination: AppDestination;
      readonly title: string;
      readonly icon?: string;
    };

export interface SidebarSnapshot {
  readonly windowId: WindowId;
  readonly visible: boolean;
  readonly sections: readonly SidebarSection[];
  readonly items: readonly SidebarItem[];
  readonly selectedItemId: SidebarItemId | null;
}

export interface SidebarApi {
  getSnapshot(windowId: WindowId, options?: RequestOptions): Promise<SidebarSnapshot>;
  setVisible(windowId: WindowId, visible: boolean, options?: RequestOptions): Promise<void>;
  select(windowId: WindowId, itemId: SidebarItemId, options?: RequestOptions): Promise<void>;
  events(windowId: WindowId): EventSource<SidebarSnapshot, SidebarSnapshot>;
}
