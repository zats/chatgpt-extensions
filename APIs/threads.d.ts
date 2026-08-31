import type {
  AccountId,
  CloudWorkspaceId,
  EventSource,
  HostId,
  Page,
  RequestOptions,
  Timestamp,
  WindowId,
} from "./core.js";
import type {
  ConversationItemId,
  ProjectLocator,
  ThreadLocator,
  TurnId,
} from "./identifiers.js";

export type ThreadMode = "chatgpt" | "work" | "codex";
export type ThreadLocation = "cloud" | "local" | "remote" | "shared";

export type ThreadState =
  | "idle"
  | "queued"
  | "running"
  | "waiting-for-input"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type ThreadOperation =
  | "archive"
  | "delete"
  | "fork"
  | "interrupt"
  | "mark-read"
  | "move"
  | "pin"
  | "rename"
  | "send"
  | "share"
  | "steer";

export interface ThreadSummary {
  readonly ref: ThreadLocator;
  readonly title: string;
  readonly mode: ThreadMode;
  readonly location: ThreadLocation;
  readonly state: ThreadState;
  readonly project?: ProjectLocator;
  readonly currentTurnId?: TurnId;
  readonly createdAt?: Timestamp;
  readonly updatedAt?: Timestamp;
  readonly archived: boolean;
  readonly pinned: boolean;
  readonly unread: boolean;
  readonly temporary: boolean;
  readonly operations: readonly ThreadOperation[];
}

export interface ThreadGoal {
  readonly text: string;
  readonly status: "active" | "complete" | "blocked";
}

export interface ThreadUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number;
}

export interface ThreadExecutionContext {
  readonly cwd?: string;
  readonly repositoryRoot?: string;
  readonly branch?: string;
}

export interface Thread extends ThreadSummary {
  readonly goal?: ThreadGoal;
  readonly usage?: ThreadUsage;
  readonly execution?: ThreadExecutionContext;
  readonly labels: readonly string[];
}

export type ThreadCollectionScope =
  | { readonly kind: "all" }
  | { readonly kind: "host"; readonly hostId: HostId }
  | {
      readonly kind: "account";
      readonly accountId: AccountId;
      readonly workspaceId?: CloudWorkspaceId;
    };

export interface ThreadListOptions extends RequestOptions {
  readonly cursor?: string;
  readonly limit?: number;
  readonly scope?: ThreadCollectionScope;
  readonly modes?: readonly ThreadMode[];
  readonly locations?: readonly ThreadLocation[];
  readonly project?: ProjectLocator | null;
  readonly archived?: boolean;
  readonly pinned?: boolean;
  readonly unread?: boolean;
  readonly order?: "created-desc" | "updated-desc" | "title-asc";
}

export interface ThreadSearchOptions extends RequestOptions {
  readonly query: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly scope?: ThreadCollectionScope;
  readonly modes?: readonly ThreadMode[];
  readonly locations?: readonly ThreadLocation[];
  readonly archived?: boolean;
}

export interface ThreadSearchResult {
  readonly thread: ThreadSummary;
  readonly snippet?: string;
}

export type ThreadCreateTarget =
  | {
      readonly kind: "execution";
      readonly hostId: HostId;
      readonly location: "local" | "remote";
      readonly project?: Extract<ProjectLocator, { readonly scope: "execution" }>;
    }
  | {
      readonly kind: "cloud";
      readonly accountId: AccountId;
      readonly workspaceId?: CloudWorkspaceId;
      readonly project?: Extract<ProjectLocator, { readonly scope: "cloud" }>;
    };

export interface ThreadCreateInput extends RequestOptions {
  readonly mode: ThreadMode;
  readonly target: ThreadCreateTarget;
  readonly title?: string;
  readonly initialPrompt?: string;
  readonly temporary?: boolean;
  readonly open?: boolean;
}

export interface OperationFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ThreadCreateResult {
  readonly requestId: string;
  readonly clientUserMessageId?: string;
  readonly thread: ThreadSummary | null;
  readonly turnId?: TurnId;
  readonly threadStatus: "created" | "outcome-unknown" | "failed";
  readonly initialTurnStatus:
    | "not-requested"
    | "accepted"
    | "not-started"
    | "rejected"
    | "outcome-unknown";
  readonly failure?: OperationFailure;
}

export interface ThreadForkInput extends RequestOptions {
  readonly thread: ThreadLocator;
  readonly atItemId?: ConversationItemId;
  readonly target?: ThreadCreateTarget;
  readonly sameWorktree?: boolean;
  readonly open?: boolean;
}

export interface OpenThreadOptions extends RequestOptions {
  readonly focus?: boolean;
  readonly newWindow?: boolean;
}

export interface ThreadSectionLocator {
  readonly sectionId: string;
  readonly scope: Exclude<ThreadCollectionScope, { readonly kind: "all" }>;
}

export interface ThreadSection {
  readonly ref: ThreadSectionLocator;
  readonly title: string;
  readonly collapsed: boolean;
  readonly order: number;
}

export type ThreadEvent =
  | { readonly type: "created"; readonly thread: ThreadSummary }
  | { readonly type: "changed"; readonly thread: ThreadSummary }
  | { readonly type: "deleted"; readonly thread: ThreadLocator }
  | {
      readonly type: "selected";
      readonly windowId: WindowId;
      readonly thread: ThreadLocator | null;
    }
  | {
      readonly type: "state-changed";
      readonly thread: ThreadLocator;
      readonly state: ThreadState;
    }
  | { readonly type: "sections-changed"; readonly sections: readonly ThreadSection[] };

export interface ThreadEventSnapshot {
  readonly revision: number;
  readonly selectedByWindow: Readonly<
    Partial<Record<WindowId, ThreadLocator | null>>
  >;
  readonly sections: readonly ThreadSection[];
}

export interface ThreadsApi {
  list(options?: ThreadListOptions): Promise<Page<ThreadSummary>>;
  search(options: ThreadSearchOptions): Promise<Page<ThreadSearchResult>>;
  get(thread: ThreadLocator, options?: RequestOptions): Promise<Thread>;
  getCurrent(windowId: WindowId, options?: RequestOptions): Promise<ThreadSummary | null>;
  open(thread: ThreadLocator, options?: OpenThreadOptions): Promise<void>;
  create(input: ThreadCreateInput): Promise<ThreadCreateResult>;
  rename(thread: ThreadLocator, title: string, options?: RequestOptions): Promise<void>;
  setArchived(thread: ThreadLocator, archived: boolean, options?: RequestOptions): Promise<void>;
  setPinned(
    thread: ThreadLocator,
    pinned: boolean,
    options?: RequestOptions & { readonly beforeThread?: ThreadLocator },
  ): Promise<void>;
  markRead(thread: ThreadLocator, read: boolean, options?: RequestOptions): Promise<void>;
  /** Permanently deletes an archived thread. */
  delete(thread: ThreadLocator, options?: RequestOptions): Promise<void>;
  fork(input: ThreadForkInput): Promise<ThreadSummary>;
  listSections(
    scope: Exclude<ThreadCollectionScope, { readonly kind: "all" }>,
    options?: RequestOptions,
  ): Promise<readonly ThreadSection[]>;
  createSection(
    scope: Exclude<ThreadCollectionScope, { readonly kind: "all" }>,
    title: string,
    options?: RequestOptions,
  ): Promise<ThreadSection>;
  updateSection(
    section: ThreadSectionLocator,
    update: { readonly title?: string; readonly collapsed?: boolean },
    options?: RequestOptions,
  ): Promise<ThreadSection>;
  deleteSection(section: ThreadSectionLocator, options?: RequestOptions): Promise<void>;
  move(
    thread: ThreadLocator,
    target: {
      readonly section?: ThreadSectionLocator;
      readonly beforeThread?: ThreadLocator;
    },
    options?: RequestOptions,
  ): Promise<void>;
  readonly events: EventSource<ThreadEvent, ThreadEventSnapshot>;
}
