import type { ThreadLocator } from "./identifiers.js";

/** Values that can cross a renderer-to-main process boundary. */
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** An ISO 8601 timestamp. */
export type Timestamp = string;
export type AccountId = string;
export type HostId = string;
export type CloudWorkspaceId = string;
export type WindowId = string;
export type Unsubscribe = () => void;

export interface Disposable {
  dispose(): void;
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly previousCursor?: string | null;
  readonly total?: number;
}

export type EventCursor = string;

export interface EventScope {
  readonly windowId?: WindowId;
  readonly hostId?: HostId;
  readonly accountId?: AccountId;
  readonly workspaceId?: CloudWorkspaceId;
}

export interface EventEnvelope<TEvent> {
  readonly id: string;
  readonly sequence: number;
  readonly occurredAt: Timestamp;
  readonly scope: EventScope;
  readonly event: TEvent;
}

export type EventStreamMessage<TEvent, TSnapshot> =
  | { readonly type: "snapshot"; readonly cursor: EventCursor; readonly value: TSnapshot }
  | { readonly type: "event"; readonly cursor: EventCursor; readonly value: EventEnvelope<TEvent> }
  | {
      readonly type: "reset";
      readonly cursor: EventCursor;
      readonly reason: "cursor-expired" | "sequence-gap" | "scope-changed";
    }
  | {
      readonly type: "closed";
      readonly reason:
        | "cancelled"
        | "extension-deactivated"
        | "host-disconnected"
        | "transport-failed";
    };

export interface EventSubscriptionOptions extends RequestOptions {
  readonly afterCursor?: EventCursor;
}

/**
 * A subscription sends an atomic snapshot first, unless it resumes from a
 * valid cursor. Listener failures are isolated by the runtime.
 */
export interface EventSource<TEvent, TSnapshot> {
  subscribe(
    listener: (message: EventStreamMessage<TEvent, TSnapshot>) => void,
    options?: EventSubscriptionOptions,
  ): Unsubscribe;
}

export type ApiErrorCode =
  | "binding-unavailable"
  | "cancelled"
  | "capability-unavailable"
  | "conflict"
  | "extension-deactivated"
  | "host-disconnected"
  | "internal"
  | "invalid-argument"
  | "not-found"
  | "rate-limited"
  | "timeout"
  | "unsupported";

export interface ChatGPTXApiError extends Error {
  readonly code: ApiErrorCode;
  /** Stable diagnostic data. Build-specific host objects are not included. */
  readonly details?: JsonObject;
  readonly retryable: boolean;
}

export type BuiltInCapabilityId =
  | "accounts.read"
  | "accounts.write"
  | "appearance.color-picker"
  | "appearance.read"
  | "appearance.write"
  | "apps.invoke"
  | "apps.read"
  | "artifacts.read"
  | "automations.read"
  | "automations.write"
  | "browser.control"
  | "browser.read"
  | "commands.execute"
  | "commands.read"
  | "composer.draft"
  | "composer.interrupt"
  | "composer.queue"
  | "composer.steer"
  | "composer.submit"
  | "files.read"
  | "files.write"
  | "goals.read"
  | "goals.write"
  | "mcp.invoke"
  | "mcp.read"
  | "messages.branch"
  | "messages.edit"
  | "messages.read"
  | "messages.regenerate"
  | "messages.stream"
  | "models.read"
  | "navigation.read"
  | "navigation.write"
  | "native.electron"
  | "native.macos"
  | "native.node"
  | "native.objc"
  | "notifications.hide"
  | "notifications.show"
  | "plugins.manage"
  | "plugins.read"
  | "projects.read"
  | "projects.write"
  | "pull-requests.read"
  | "pull-requests.write"
  | "review.read"
  | "review.write"
  | "runtime.info"
  | "settings.read"
  | "settings.write"
  | "selections.annotate"
  | "selections.read"
  | "sidebar.read"
  | "sidebar.write"
  | "skills.manage"
  | "skills.read"
  | "sources.read"
  | "subagents.read"
  | "summaries.read"
  | "summaries.write"
  | "surfaces.layout"
  | "surfaces.open"
  | "surfaces.read"
  | "terminal.read"
  | "terminal.use"
  | "threads.delete"
  | "threads.fork"
  | "threads.list"
  | "threads.pin"
  | "threads.read"
  | "threads.search"
  | "threads.write"
  | "toasts.close"
  | "toasts.show"
  | "ui.contribute"
  | "workspaces.read";

export type UiCapabilityId =
  | `ui.point.${string}`
  | `ui.definition.${string}`;
export type CapabilityId = BuiltInCapabilityId | UiCapabilityId | (string & {});
export type CapabilityOperationId = string;

export type CapabilityScope =
  | { readonly kind: "global" }
  | { readonly kind: "host"; readonly hostId: HostId }
  | { readonly kind: "account"; readonly accountId: AccountId }
  | { readonly kind: "window"; readonly windowId: WindowId }
  | {
      readonly kind: "thread";
      readonly thread: ThreadLocator;
      readonly windowId?: WindowId;
    }
  | {
      readonly kind: "cloud-workspace";
      readonly accountId: AccountId;
      readonly workspaceId: CloudWorkspaceId;
    };

export type CapabilityUnavailableReason =
  | "account-required"
  | "app-server-unsupported"
  | "binding-unavailable"
  | "extension-deactivated"
  | "feature-disabled"
  | "host-disconnected"
  | "renderer-unavailable"
  | "service-unavailable"
  | "unsupported-platform";

export interface CapabilityStatus {
  readonly id: CapabilityId;
  readonly scope: CapabilityScope;
  readonly state: "available" | "unavailable";
  readonly unavailableReason?: CapabilityUnavailableReason;
  readonly detail?: string;
  readonly operations: readonly CapabilityOperationId[];
}

export interface CapabilitySnapshot {
  readonly revision: number;
  readonly generatedAt: Timestamp;
  readonly scope: CapabilityScope;
  readonly statuses: readonly CapabilityStatus[];
}

export interface CapabilityOptions extends RequestOptions {
  readonly scope?: CapabilityScope;
}

export interface CapabilitiesApi {
  getSnapshot(options?: CapabilityOptions): Promise<CapabilitySnapshot>;
  get(id: CapabilityId, options?: CapabilityOptions): Promise<CapabilityStatus>;
  /** Checks current build, host, account, and feature availability. */
  require(id: CapabilityId, options?: CapabilityOptions): Promise<void>;
  readonly changed: EventSource<CapabilitySnapshot, CapabilitySnapshot>;
}

export interface ExtensionIdentity {
  readonly id: string;
  readonly instanceId: string;
  readonly version: string;
  readonly manifestDigest: string;
}

export interface HostRuntimeInfo {
  readonly id: HostId;
  readonly kind: "local" | "ssh" | "wsl" | "remote-control";
  readonly connected: boolean;
  readonly appServerVersion?: string;
}

export interface WindowRuntimeInfo {
  readonly id: WindowId;
  readonly kind: "primary" | "thread" | "quick-chat" | "control";
}

export interface BindingInfo {
  readonly adapterVersion: string;
  readonly targetAppVersion: string;
  readonly targetAppBuild: string;
  readonly adapterDigest: string;
  readonly publicApiDigest: string;
  readonly evidenceDigest: string;
}

export interface RuntimeInfo {
  readonly apiVersion: string;
  readonly appVersion: string;
  readonly appBuild: string;
  readonly electronVersion: string;
  readonly chromiumVersion: string;
  readonly nodeVersion: string;
  readonly nodeModuleAbi: string;
  readonly nodeApiVersion?: string;
  readonly objcJsVersion: string;
  readonly architecture: "arm64" | "x64";
  readonly platform: "macos";
  readonly binding: BindingInfo;
  readonly extension: ExtensionIdentity;
  readonly hosts: readonly HostRuntimeInfo[];
  readonly windows: readonly WindowRuntimeInfo[];
}

export interface RuntimeApi {
  getInfo(options?: RequestOptions): Promise<RuntimeInfo>;
  readonly capabilities: CapabilitiesApi;
}
