import type { ThreadSummary } from "./threads.js";
import type {
  UiMenuActionItem,
  UiMenuItem,
  UiOwnerContext,
} from "./ui-core.js";
import type {
  AssistantTextSelection,
  ResponseAnnotationOptions,
} from "./selections.js";

export type BuiltInAssistantSelectionActionId =
  | "app.add-to-chat"
  | "app.ask-in-side-chat"
  | "app.more-details";

export interface AssistantSelectionActionContext
  extends UiOwnerContext,
    AssistantTextSelection {
  createResponseAnnotation(
    annotation: string,
    options?: ResponseAnnotationOptions,
  ): Promise<void>;
}

export interface AssistantSelectionActionItem
  extends UiMenuActionItem<AssistantSelectionActionContext> {
  readonly id: BuiltInAssistantSelectionActionId | (string & {});
  readonly placement?: "above" | "below";
  readonly labelScale?: 1 | 2;
  readonly verticalPadding?: 0 | 4;
  /** One nested replacement page is supported. */
  readonly items?: readonly AssistantSelectionActionItem[];
}

export type BuiltInThreadHeaderMenuItemId =
  | "app.archive"
  | "app.copy-deep-link"
  | "app.copy-markdown"
  | "app.copy-working-directory"
  | "app.delete"
  | "app.fork-local"
  | "app.fork-worktree"
  | "app.handoff"
  | "app.move-to-project"
  | "app.new-chat-in-worktree"
  | "app.open-in-chatgpt"
  | "app.open-in-new-window"
  | "app.open-in-quick-chat"
  | "app.open-side-chat"
  | "app.pin"
  | "app.rename"
  | "app.schedule"
  | "app.share"
  | "app.unpin";

export interface ThreadHeaderContext extends UiOwnerContext {
  readonly kind: "thread" | "pending-thread";
  /** `null` while a local worktree thread has not received a durable ID. */
  readonly thread: ThreadSummary | null;
}

export interface ThreadHeaderMenuActionItem
  extends UiMenuActionItem<ThreadHeaderContext> {
  readonly id: BuiltInThreadHeaderMenuItemId | (string & {});
}

export type ThreadHeaderMenuItem =
  | ThreadHeaderMenuActionItem
  | Exclude<UiMenuItem<ThreadHeaderContext>, UiMenuActionItem<ThreadHeaderContext>>;
