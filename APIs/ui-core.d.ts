import type { Disposable, WindowId } from "./core.js";

export type UiItemId = string;
export type UiItemOrigin = "app" | `extension:${string}`;

export type UiIcon =
  | { readonly kind: "app"; readonly name: string }
  | { readonly kind: "system"; readonly name: string }
  | { readonly kind: "svg"; readonly source: string }
  | {
      readonly kind: "color";
      readonly light: string;
      readonly dark: string;
    };

export interface UiActivation {
  readonly source: "keyboard" | "pointer" | "programmatic" | "unknown";
  /** Present only when the host reports modifiers for this activation path. */
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly controlKey?: boolean;
}

export interface UiOwnerContext {
  /** Stable only for the lifetime of the current renderer document. */
  readonly ownerId: string;
  readonly windowId: WindowId;
}

export interface UiActionItem<TContext extends UiOwnerContext> {
  readonly kind: "action";
  readonly id: UiItemId;
  readonly label: string;
  readonly tooltip?: string;
  readonly icon?: UiIcon;
  readonly disabled?: boolean;
  readonly tone?: "default" | "destructive";
  readonly onActivate?: (
    context: TContext,
    activation: UiActivation,
  ) => void | Promise<void>;
  /** Set by the runtime. */
  readonly origin?: UiItemOrigin;
}

export interface UiMenuActionItem<TContext extends UiOwnerContext>
  extends UiActionItem<TContext> {
  readonly checked?: boolean;
  readonly keybinding?: string;
  readonly message?: string;
  readonly rightIcon?: UiIcon;
  readonly subText?: string;
  readonly href?: string;
  readonly items?: readonly UiMenuItem<TContext>[];
}

export interface UiSeparatorItem {
  readonly kind: "separator";
  readonly id: UiItemId;
  /** Set by the runtime. */
  readonly origin?: UiItemOrigin;
}

/** A host-owned item that can be kept, moved, or removed but not recreated. */
export interface UiOpaqueItem {
  readonly kind: "opaque";
  readonly id: UiItemId;
  readonly label?: string;
  readonly origin: "app";
}

export type UiMenuItem<TContext extends UiOwnerContext> =
  | UiMenuActionItem<TContext>
  | UiSeparatorItem
  | UiOpaqueItem;

/** Preserves a host descriptor that the active binding cannot recreate. */
export type UiListItem<TItem> = TItem | UiOpaqueItem;

export interface UiRegistration extends Disposable {
  /** Abort current work, then re-evaluate without changing identity or order. */
  invalidate(ownerId?: string): void;
}

export interface UiMount<TContext extends UiOwnerContext> {
  readonly id: string;
  readonly ownerId: string;
  readonly windowId: WindowId;
  readonly container: HTMLElement;
  readonly context: TContext;
  readonly signal: AbortSignal;
}

export type UiRenderProvider<TContext extends UiOwnerContext> = (
  mount: UiMount<TContext>,
) => void | Disposable;
