import type {
  EventSource,
  RequestOptions,
  Timestamp,
  WindowId,
} from "./core.js";
import type { ConversationItemId, ThreadLocator } from "./identifiers.js";
import type { MessageId } from "./messages.js";

export type AssistantTextSelectionId = string;

/** Viewport coordinates in CSS pixels. */
export interface ViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A semantic snapshot of selected text in one assistant message.
 *
 * The API does not expose a DOM Range. A Range belongs to one renderer
 * document and becomes stale when ChatGPT remounts or virtualizes a message.
 */
export interface AssistantTextSelection {
  readonly id: AssistantTextSelectionId;
  readonly windowId: WindowId;
  readonly thread: ThreadLocator;
  readonly itemId?: ConversationItemId;
  readonly messageId?: MessageId;
  readonly selectedText: string;
  readonly rects: readonly ViewportRect[];
  readonly startedAt: Timestamp;
}

export type AssistantTextSelectionEndReason =
  | "action"
  | "cleared"
  | "document-unloaded"
  | "message-unmounted"
  | "navigation"
  | "owner-changed";

export type AssistantTextSelectionEvent =
  | { readonly type: "started"; readonly selection: AssistantTextSelection }
  | { readonly type: "changed"; readonly selection: AssistantTextSelection }
  | {
      readonly type: "ended";
      readonly selection: AssistantTextSelection;
      readonly reason: AssistantTextSelectionEndReason;
    };

export interface AssistantTextSelectionSnapshot {
  readonly windowId: WindowId;
  readonly active: AssistantTextSelection | null;
}

export interface ResponseAnnotationOptions extends RequestOptions {
  /** Submit the complete composer after the annotation is added. */
  readonly submit?: boolean;
}

export interface AssistantSelectionsApi {
  getActive(
    windowId: WindowId,
    options?: RequestOptions,
  ): Promise<AssistantTextSelection | null>;

  /**
   * Add the same response annotation that ChatGPT's built-in selection action
   * adds. The call fails if the selection is no longer active or the current
   * backend does not support response annotations.
   */
  createResponseAnnotation(
    selectionId: AssistantTextSelectionId,
    annotation: string,
    options?: ResponseAnnotationOptions,
  ): Promise<void>;

  /**
   * `started` is the first non-empty assistant-message selection. `changed`
   * keeps the same ID while its text, range, or viewport geometry changes.
   * `ended` is sent exactly once. User-message and cross-message selections are
   * not exposed.
   */
  events(
    windowId: WindowId,
  ): EventSource<AssistantTextSelectionEvent, AssistantTextSelectionSnapshot>;
}
