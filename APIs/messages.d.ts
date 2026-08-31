import type {
  EventSource,
  JsonObject,
  JsonValue,
  Page,
  RequestOptions,
  Timestamp,
  WindowId,
} from "./core.js";
import type {
  ConversationItemId,
  ThreadLocator,
  TurnId,
} from "./identifiers.js";
import type {
  OperationFailure,
  ThreadCreateInput,
  ThreadSummary,
} from "./threads.js";

export type MessageId = string;
export type AttachmentId = string;
export type ComposerId = string;

export interface TextPart {
  readonly type: "text";
  readonly text: string;
  readonly format?: "plain" | "markdown";
}

export interface CodePart {
  readonly type: "code";
  readonly code: string;
  readonly language?: string;
}

export interface ImagePart {
  readonly type: "image";
  readonly attachmentId?: AttachmentId;
  readonly url?: string;
  readonly alt?: string;
  readonly mediaType?: string;
}

export interface FilePart {
  readonly type: "file";
  readonly attachmentId: AttachmentId;
  readonly name: string;
  readonly mediaType?: string;
  readonly size?: number;
}

export interface CitationPart {
  readonly type: "citation";
  readonly title?: string;
  readonly url?: string;
  readonly sourceId?: string;
}

export interface AudioPart {
  readonly type: "audio";
  readonly attachmentId?: AttachmentId;
  readonly transcript?: string;
  readonly mediaType?: string;
}

export type MessagePart =
  | TextPart
  | CodePart
  | ImagePart
  | FilePart
  | CitationPart
  | AudioPart;

export interface BaseConversationItem {
  readonly id: ConversationItemId;
  readonly thread: ThreadLocator;
  /** Present when the backing conversation has an explicit turn model. */
  readonly turnId?: TurnId;
  readonly createdAt?: Timestamp;
  readonly status: "pending" | "running" | "complete" | "failed" | "cancelled";
}

export interface MessageItem extends BaseConversationItem {
  readonly kind: "message";
  readonly messageId: MessageId;
  readonly role: "user" | "assistant";
  readonly phase?: "commentary" | "final";
  readonly content: readonly MessagePart[];
}

export interface AssistantMessageItem extends MessageItem {
  readonly role: "assistant";
  readonly contentReferences?: readonly AssistantContentReference[];
}

/** A ChatGPT content reference carried by an assistant turn. */
export interface AssistantContentReference {
  readonly type: string;
  /** Immutable JSON snapshot of the complete host reference. */
  readonly data: JsonObject;
}

export interface UserMessageItem extends MessageItem {
  readonly role: "user";
}

export interface ReasoningItem extends BaseConversationItem {
  readonly kind: "reasoning";
  readonly summary?: string;
  readonly content?: string;
}

export interface ToolCallItem extends BaseConversationItem {
  readonly kind: "tool-call";
  readonly toolName: string;
  readonly serverId?: string;
  readonly arguments: JsonValue;
  readonly result?: JsonValue;
  readonly error?: string;
}

export interface CommandItem extends BaseConversationItem {
  readonly kind: "command";
  readonly command: string;
  readonly cwd?: string;
  readonly output?: string;
  readonly exitCode?: number;
  readonly durationMs?: number;
}

export interface FileChange {
  readonly path: string;
  readonly operation: "add" | "delete" | "modify" | "rename";
  readonly patch?: string;
  readonly previousPath?: string;
}

export interface FileChangeItem extends BaseConversationItem {
  readonly kind: "file-change";
  readonly changes: readonly FileChange[];
}

export interface PlanStep {
  readonly text: string;
  readonly status: "pending" | "in-progress" | "complete" | "blocked";
}

export interface PlanItem extends BaseConversationItem {
  readonly kind: "plan";
  readonly text: string;
}

export interface PlanUpdateItem extends BaseConversationItem {
  readonly kind: "plan-update";
  readonly steps: readonly PlanStep[];
}

export interface ApprovalRequestItem extends BaseConversationItem {
  readonly kind: "approval-request";
  readonly category: "command" | "file-change" | "tool" | "external-action";
  readonly title: string;
  readonly detail?: string;
  readonly requestId: string;
}

export interface UserInputRequestItem extends BaseConversationItem {
  readonly kind: "user-input-request";
  readonly requestId: string;
  readonly prompt: string;
  readonly choices?: readonly string[];
}

export interface ProgressItem extends BaseConversationItem {
  readonly kind: "progress";
  readonly title: string;
  readonly detail?: string;
  readonly progress?: number;
}

export interface OpaquePresentationAttribute {
  readonly label: string;
  readonly value: string;
}

/** Stable display data for a new host item type. */
export interface OpaqueConversationItem extends BaseConversationItem {
  readonly kind: "opaque";
  readonly sourceKind: string;
  /** Immutable JSON snapshot of the complete host item. */
  readonly data: JsonObject;
  readonly presentationVersion: number;
  readonly label: string;
  readonly text?: string;
  readonly attributes?: readonly OpaquePresentationAttribute[];
}

export type ConversationItem =
  | MessageItem
  | ReasoningItem
  | ToolCallItem
  | CommandItem
  | FileChangeItem
  | PlanItem
  | PlanUpdateItem
  | ApprovalRequestItem
  | UserInputRequestItem
  | ProgressItem
  | OpaqueConversationItem;

export interface Turn {
  readonly id: TurnId;
  readonly thread: ThreadLocator;
  readonly status: "pending" | "running" | "complete" | "failed" | "cancelled";
  readonly startedAt?: Timestamp;
  readonly completedAt?: Timestamp;
  readonly error?: OperationFailure;
  readonly interruptionReason?:
    | "user"
    | "steered"
    | "superseded"
    | "host-disconnected"
    | "other";
  readonly items: readonly ConversationItem[];
}

export interface HistoryListOptions extends RequestOptions {
  readonly cursor?: string;
  readonly limit?: number;
  readonly direction?: "older" | "newer";
  readonly detail?: "summary" | "full";
}

export type ConversationEvent =
  | { readonly type: "turn-started"; readonly turn: Turn }
  | { readonly type: "turn-completed"; readonly turn: Turn }
  | { readonly type: "item-started"; readonly item: ConversationItem }
  | { readonly type: "item-completed"; readonly item: ConversationItem }
  | {
      readonly type: "item-delta";
      readonly thread: ThreadLocator;
      readonly turnId?: TurnId;
      readonly itemId: ConversationItemId;
      readonly delta:
        | {
            readonly kind: "text";
            readonly operation: "append" | "replace";
            readonly text: string;
          }
        | {
            readonly kind: "reasoning";
            readonly operation: "append" | "replace";
            readonly text: string;
          }
        | {
            readonly kind: "transcript";
            readonly operation: "append" | "replace";
            readonly text: string;
          }
        | { readonly kind: "audio"; readonly data: string }
        | { readonly kind: "data"; readonly data: JsonValue };
    };

export interface ConversationSnapshot {
  readonly thread: ThreadLocator;
  readonly turns: readonly Turn[];
  readonly historyCursor?: string;
}

export type AssistantMessageEvent =
  | { readonly type: "started"; readonly message: AssistantMessageItem }
  | {
      readonly type: "updated";
      /** Complete current message state for both local and cloud backends. */
      readonly message: AssistantMessageItem;
      /** Present only when the adapter proves that text was appended. */
      readonly appendedText?: string;
    }
  | {
      readonly type: "finished";
      readonly message: AssistantMessageItem;
      readonly outcome: "complete" | "failed" | "cancelled";
      readonly failure?: OperationFailure;
    };

export type AssistantMessageEventScope =
  | { readonly kind: "window"; readonly windowId: WindowId }
  | { readonly kind: "thread"; readonly thread: ThreadLocator };

export interface AssistantMessageSnapshot {
  readonly scope: AssistantMessageEventScope;
  readonly active: readonly AssistantMessageItem[];
}

export interface MessagesApi {
  listTurns(thread: ThreadLocator, options?: HistoryListOptions): Promise<Page<Turn>>;
  listItems(thread: ThreadLocator, options?: HistoryListOptions): Promise<Page<ConversationItem>>;
  branch(
    thread: ThreadLocator,
    atItemId: ConversationItemId,
    options?: RequestOptions & { readonly open?: boolean },
  ): Promise<ThreadSummary>;
  editUserMessage(
    thread: ThreadLocator,
    messageId: MessageId,
    content: readonly MessagePart[],
    options?: RequestOptions,
  ): Promise<SubmissionResult>;
  regenerate(
    thread: ThreadLocator,
    messageId?: MessageId,
    options?: RequestOptions,
  ): Promise<SubmissionResult>;
  /** Full turn and item event stream. */
  events(thread: ThreadLocator): EventSource<ConversationEvent, ConversationSnapshot>;
  /**
   * Normalized assistant-message callbacks for both Codex app-server
   * notifications and ChatGPT cloud completion streams.
   */
  assistantEvents(
    scope: AssistantMessageEventScope,
  ): EventSource<AssistantMessageEvent, AssistantMessageSnapshot>;
}

export interface BaseAttachmentReference {
  readonly id: AttachmentId;
  readonly name?: string;
}

export type AttachmentReference =
  | (BaseAttachmentReference & {
      readonly kind: "file" | "image";
      /** An app attachment handle. Use Node for direct file-system access. */
      readonly fileId: string;
      readonly mediaType?: string;
      readonly size?: number;
    })
  | (BaseAttachmentReference & {
      readonly kind: "pasted-text" | "selected-text";
      readonly text: string;
      readonly sourceTitle?: string;
      readonly sourcePath?: string;
    })
  | (BaseAttachmentReference & {
      readonly kind: "comment";
      readonly text: string;
      readonly path?: string;
      readonly line?: number;
    })
  | (BaseAttachmentReference & {
      readonly kind: "appshot";
      readonly appshotId: string;
    })
  | (BaseAttachmentReference & {
      readonly kind: "browser-page";
      readonly url: string;
      readonly title?: string;
      readonly selection?: string;
    })
  | (BaseAttachmentReference & {
      readonly kind: "mcp-context";
      readonly serverId: string;
      readonly resourceUri?: string;
      readonly context: JsonObject;
    })
  | (BaseAttachmentReference & {
      readonly kind: "shared-thread";
      readonly thread: ThreadLocator;
    });

/** Draft content excludes attachments. Attachments use the separate array. */
export type DraftPart = TextPart | CodePart;

export interface ComposerDescriptor {
  readonly id: ComposerId;
  readonly kind: "main" | "quick-chat" | "side-chat";
  readonly thread?: ThreadLocator;
  readonly surfaceInstanceId?: string;
  readonly focused: boolean;
}

export interface ComposerState extends ComposerDescriptor {
  readonly content: readonly DraftPart[];
  readonly attachments: readonly AttachmentReference[];
  readonly modelId?: string;
  readonly reasoningEffort?: string;
  readonly planMode: boolean;
  readonly fastMode: boolean;
  readonly submitting: boolean;
}

export type SubmitTarget =
  | { readonly kind: "thread"; readonly thread: ThreadLocator }
  | {
      readonly kind: "new-thread";
      readonly create: Omit<ThreadCreateInput, "initialPrompt" | "signal">;
    };

export interface SubmitInput extends RequestOptions {
  readonly target: SubmitTarget;
  readonly content: readonly DraftPart[];
  readonly attachments?: readonly AttachmentReference[];
  readonly modelId?: string;
  readonly reasoningEffort?: string;
  readonly planMode?: boolean;
  readonly background?: boolean;
  readonly delivery?: "auto" | "steer" | "new-turn";
  readonly cwd?: string;
}

export interface SubmissionResult {
  readonly requestId: string;
  readonly clientUserMessageId: string;
  readonly thread: ThreadSummary | null;
  readonly turnId?: TurnId;
  readonly status: "accepted" | "rejected" | "outcome-unknown";
  readonly failure?: OperationFailure;
}

export interface QueuedMessage {
  readonly id: string;
  readonly target: SubmitTarget;
  readonly content: readonly DraftPart[];
  readonly attachments: readonly AttachmentReference[];
  readonly createdAt: Timestamp;
  readonly delivery: "auto" | "steer" | "new-turn";
  readonly cwd?: string;
  readonly pausedReason?: "active-turn" | "interrupted-steer" | "host-disconnected";
}

export interface RemovedQueuedMessage {
  readonly message: QueuedMessage;
  readonly restoreToken: string;
}

export interface ComposerSnapshot {
  readonly composers: readonly ComposerState[];
  readonly focusedComposerId: ComposerId | null;
}

export interface ComposerApi {
  list(options?: RequestOptions): Promise<readonly ComposerDescriptor[]>;
  getState(composerId: ComposerId, options?: RequestOptions): Promise<ComposerState>;
  setDraft(
    composerId: ComposerId,
    content: readonly DraftPart[],
    options?: RequestOptions,
  ): Promise<void>;
  clear(composerId: ComposerId, options?: RequestOptions): Promise<void>;
  addAttachments(
    composerId: ComposerId,
    attachments: readonly AttachmentReference[],
    options?: RequestOptions,
  ): Promise<void>;
  submit(input: SubmitInput): Promise<SubmissionResult>;
  queue(input: SubmitInput): Promise<QueuedMessage>;
  listQueue(thread: ThreadLocator, options?: RequestOptions): Promise<readonly QueuedMessage[]>;
  updateQueued(
    queuedMessageId: string,
    input: SubmitInput,
    options?: RequestOptions,
  ): Promise<QueuedMessage>;
  removeQueued(
    queuedMessageId: string,
    options?: RequestOptions,
  ): Promise<RemovedQueuedMessage>;
  restoreQueued(restoreToken: string, options?: RequestOptions): Promise<QueuedMessage>;
  reorderQueue(
    thread: ThreadLocator,
    queuedMessageIds: readonly string[],
    options?: RequestOptions,
  ): Promise<void>;
  sendQueuedNow(
    queuedMessageId: string,
    options?: RequestOptions,
  ): Promise<SubmissionResult>;
  resumeInterrupted(
    queuedMessageId: string,
    options?: RequestOptions,
  ): Promise<SubmissionResult>;
  steer(
    thread: ThreadLocator,
    content: readonly DraftPart[],
    options?: RequestOptions,
  ): Promise<SubmissionResult>;
  interrupt(
    thread: ThreadLocator,
    expectedTurnId?: TurnId,
    options?: RequestOptions,
  ): Promise<void>;
  readonly changed: EventSource<ComposerState, ComposerSnapshot>;
}
