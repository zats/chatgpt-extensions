import type {
  Disposable,
  HostId,
} from "./core.js";
import type { ThreadLocator } from "./identifiers.js";
import type { AppDestination } from "./shell.js";
import type {
  UiIcon,
  UiOwnerContext,
  UiRenderProvider,
} from "./ui-core.js";

export type ToastId = string;
export type ToastKind = "info" | "success" | "warning" | "danger";

export interface ToastContext extends UiOwnerContext {
  readonly toastId?: ToastId;
  readonly kind: ToastKind;
  close(): void;
}

/** Exact standard-action shape used by the first-party toast view. */
export interface ToastAction {
  readonly label: string;
  readonly loading?: boolean;
  readonly onClick: () => void | Promise<void>;
}

export interface ToastLifetimeOptions {
  readonly id?: ToastId;
  readonly hasCloseButton?: boolean;
  /** Uses the first-party service's seconds unit. Zero keeps the toast open. */
  readonly durationSeconds?: number;
  /** Called once when this concrete toast leaves its renderer toaster. */
  readonly onRemove?: () => void;
}

export interface ToastOptions extends ToastLifetimeOptions {
  readonly description?: string;
  readonly leading?: UiIcon;
  readonly primaryAction?: ToastAction;
  readonly secondaryAction?: ToastAction;
}

export interface CustomToastOptions extends ToastLifetimeOptions {
  readonly kind?: ToastKind;
  readonly render: UiRenderProvider<ToastContext>;
}

export interface ToastHandle extends Disposable {
  /** Equivalent to dispose(). Both operations are idempotent. */
  close(): void;
}

/** Direct adapter for the current first-party renderer toast service. */
export interface ToastsApi {
  info(title: string, options?: ToastOptions): ToastHandle;
  success(title: string, options?: ToastOptions): ToastHandle;
  warning(title: string, options?: ToastOptions): ToastHandle;
  danger(title: string, options?: ToastOptions): ToastHandle;
  custom(options: CustomToastOptions): ToastHandle;
  /** Closes only toasts in the calling renderer's first-party toaster. */
  closeAll(): void;
}

export type DesktopNotificationActionType =
  | "open"
  | "reply"
  | "approve"
  | "approve-for-session"
  | "decline"
  | (string & {});

export interface DesktopNotificationAction {
  readonly id: string;
  readonly title: string;
  /** Maps to the AppHost actionType field. */
  readonly type: DesktopNotificationActionType;
}

export type DesktopNotificationActions =
  | readonly []
  | readonly [DesktopNotificationAction]
  | readonly [DesktopNotificationAction, DesktopNotificationAction]
  | readonly [
      DesktopNotificationAction,
      DesktopNotificationAction,
      DesktopNotificationAction,
    ]
  | readonly [
      DesktopNotificationAction,
      DesktopNotificationAction,
      DesktopNotificationAction,
      DesktopNotificationAction,
    ];

export interface DesktopNotificationDescriptorBase {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly hostId?: HostId;
  readonly thread?: ThreadLocator;
  readonly navigation?: AppDestination;
  readonly requestId?: string;
  /** Electron keeps at most four native notification actions. */
  readonly actions?: DesktopNotificationActions;
}

export interface ReplyDesktopNotificationDescriptor
  extends DesktopNotificationDescriptorBase {
  readonly kind: "turn-complete";
  readonly replyPlaceholder?: string;
}

export interface StandardDesktopNotificationDescriptor
  extends DesktopNotificationDescriptorBase {
  readonly kind: "permission" | "question";
  readonly replyPlaceholder?: never;
}

export type DesktopNotificationDescriptor =
  | ReplyDesktopNotificationDescriptor
  | StandardDesktopNotificationDescriptor;

export interface DesktopNotificationResult {
  readonly type: DesktopNotificationActionType;
  readonly actionId?: string;
  readonly reply?: string;
}

export type DesktopNotificationMatch =
  | {
      readonly id: string;
      readonly thread?: never;
      readonly navigation?: never;
    }
  | {
      readonly id?: never;
      readonly thread: ThreadLocator;
      readonly navigation?: AppDestination;
    }
  | {
      readonly id?: never;
      readonly thread?: ThreadLocator;
      readonly navigation: AppDestination;
    };

/** Stable adapter for ChatGPT's current AppHost notification service. */
export interface DesktopNotificationsApi {
  /** The returned disposable detaches the listener. It does not hide the notification. */
  show(
    descriptor: DesktopNotificationDescriptor,
    listener?: (result: DesktopNotificationResult) => void,
  ): Disposable;
  /** Hides all notifications matched by ID, thread, or navigation destination. */
  hide(match: DesktopNotificationMatch): void;
}
