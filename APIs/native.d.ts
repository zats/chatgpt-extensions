/** Load Electron's declaration file, which declares its process subpaths. */
import type {} from "electron";
import type { NativeImage } from "electron/common";
import type { BrowserWindow, Menu, WebContents } from "electron/main";
import type { Disposable, RuntimeApi, WindowId } from "./core.js";
import type {
  BaseExtensionContext,
  MainExtensionChannel,
} from "./extensions.js";

export type PowerSaveBlockerType =
  | "prevent-app-suspension"
  | "prevent-display-sleep";

export interface OwnedNativeResource extends Disposable {
  readonly released: boolean;
}

export interface OwnedGlobalShortcut extends OwnedNativeResource {
  readonly accelerator: string;
}

export interface OwnedPowerSaveBlocker extends OwnedNativeResource {
  readonly id: number;
  readonly type: PowerSaveBlockerType;
}

/** App-global state that the host restores when its lease is released. */
export interface OwnedNativeResources {
  applicationMenu(menu: Menu | null): OwnedNativeResource;
  dockBadge(text: string): OwnedNativeResource;
  dockIcon(image: NativeImage | string): OwnedNativeResource;
  dockMenu(menu: Menu): OwnedNativeResource;
  globalShortcut(
    accelerator: string,
    callback: () => void,
  ): OwnedGlobalShortcut | null;
  powerSaveBlocker(type: PowerSaveBlockerType): OwnedPowerSaveBlocker;
}

/** Cleanup for direct Electron and Node resources that do not have a lease. */
export interface NativeDisposables {
  own<T extends Disposable>(resource: T): T;
  defer(cleanup: () => void): Disposable;
}

/** Live main-process objects for one public app window. */
export interface NativeOwnerContext {
  readonly windowId: WindowId;
  getWindow(): BrowserWindow | null;
  getWebContents(): WebContents | null;
}

/** An unsafe Objective-C method. The bridge cannot infer application types. */
export interface NativeObjcMethod {
  (...args: any[]): any;
}

/** A dynamic Objective-C object. `$` in a key represents `:` in a selector. */
export interface NativeObjcObject {
  readonly [selector: string]: NativeObjcMethod;
}

export interface NativeObjcTypedBlockOptions {
  readonly returns: string;
  readonly args?: readonly string[];
  readonly types?: string;
}

/** The 64-bit pointer buffer returned by objc-js on the current arm64 host. */
export interface NativePointerBuffer extends Uint8Array {
  readBigUInt64LE(offset?: number): bigint;
}

export interface NativeObjcMethodDefinition {
  readonly types: string;
  readonly implementation: (
    self: NativeObjcObject,
    ...args: any[]
  ) => any;
}

export interface NativeObjcClassDefinition {
  readonly name: string;
  readonly superclass: string | NativeObjcObject;
  readonly protocols?: readonly string[];
  readonly methods?: Readonly<Record<string, NativeObjcMethodDefinition>>;
  readonly classMethods?: Readonly<Record<string, NativeObjcMethodDefinition>>;
}

/**
 * The public shape of the host's objc-js 1.5.0 module.
 *
 * The declarations are intentionally dynamic because Objective-C selectors,
 * C signatures, pointers, and private framework types are runtime values.
 */
export interface NativeObjcRuntime {
  readonly NobjcLibrary: new (library: string) => NativeObjcObject;
  readonly NobjcObject: new (object: unknown) => NativeObjcObject;
  readonly NobjcMethod: (
    object: NativeObjcObject,
    methodName: string,
  ) => NativeObjcMethod;
  readonly NobjcProtocol: {
    implement(
      protocolName: string,
      methods: Readonly<Record<string, (...args: any[]) => any>>,
    ): NativeObjcObject;
  };
  readonly NobjcClass: {
    define(definition: NativeObjcClassDefinition): NativeObjcObject;
    super(
      self: NativeObjcObject,
      selector: string,
      ...args: any[]
    ): any;
  };
  typedBlock<T extends (...args: any[]) => any>(
    signature: string | NativeObjcTypedBlockOptions,
    callback: T,
  ): T;
  readonly RunLoop: {
    pump(timeout?: number): boolean;
    run(intervalMs?: number): () => void;
    stop(): void;
  };
  getPointer(object: NativeObjcObject): NativePointerBuffer;
  fromPointer(pointer: NativePointerBuffer | bigint): NativeObjcObject;
  callFunction(name: string, ...args: any[]): any;
  callVariadicFunction(name: string, ...args: any[]): any;
}

/** Activation context for a fully trusted macOS Electron-main extension. */
export interface MainExtensionContext extends BaseExtensionContext {
  /** Build, host, window, and native capability information available in main. */
  readonly runtime: RuntimeApi;
  /** The Electron main namespace that ChatGPT already loaded. */
  readonly electron: typeof import("electron/main");
  /** The host-provided objc-js module. Wrong native declarations can crash ChatGPT. */
  readonly objc: NativeObjcRuntime;
  /** The private data channel to this extension's renderer activations. */
  readonly renderers: MainExtensionChannel;
  readonly owned: OwnedNativeResources;
  readonly disposables: NativeDisposables;
  getOwner(windowId: WindowId): NativeOwnerContext | null;
}

export interface ChatGPTXMainExtension {
  activate(context: MainExtensionContext): void | Promise<void>;
  /** Best-effort cleanup after lifetime abort. Host-owned resources release first. */
  deactivate?(): void | Promise<void>;
}
