import type { ChatGPTXApi } from "./api.js";
import type {
  CapabilityId,
  Disposable,
  ExtensionIdentity,
  JsonValue,
  RequestOptions,
  WindowId,
} from "./core.js";
import type { SettingsSectionId } from "./settings.js";

export interface ExtensionSettingsEntry {
  /**
   * Self-contained CommonJS browser bundle loaded in each eligible renderer,
   * including when the extension's normal entries are disabled.
   */
  readonly renderer: string;
  /** Extension-local settings-section ID. The runtime namespaces it. */
  readonly sectionId: string;
}

export interface ExtensionManifest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  /** Required extensions are always enabled and cannot be disabled. */
  readonly required?: boolean;
  readonly chatgptx: {
    readonly api: string;
    /** CommonJS file loaded once in the Electron main process. */
    readonly main?: string;
    /** Self-contained CommonJS browser bundle loaded for each renderer document. */
    readonly renderer?: string;
    /** Settings remain available so a disabled extension can be configured. */
    readonly settings?: ExtensionSettingsEntry;
    /**
     * Product and native capabilities used by this package. ChatGPTX-owned
     * services on BaseExtensionContext are not declared here.
     */
    readonly capabilities?: readonly CapabilityId[];
  };
}

/**
 * UTF-8 file storage owned by the calling extension. Paths are non-empty,
 * POSIX-relative, and cannot escape the extension's storage root.
 */
export interface ExtensionStorageApi {
  /** Recursively list regular files as sorted, POSIX-relative paths. */
  listFiles(options?: RequestOptions): Promise<readonly string[]>;
  /** Return `undefined` when the file does not exist. */
  readTextFile(
    path: string,
    options?: RequestOptions,
  ): Promise<string | undefined>;
  /** Atomically write a mode-0600 file and create missing parent directories. */
  writeTextFile(
    path: string,
    contents: string,
    options?: RequestOptions,
  ): Promise<void>;
  /** Deleting a missing file succeeds. */
  deleteFile(path: string, options?: RequestOptions): Promise<void>;
}

export interface InstalledExtension {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  /** Configured state for the next app start. */
  readonly enabled: boolean;
  readonly required: boolean;
  /** Final runtime-namespaced section ID. */
  readonly settingsSectionId?: SettingsSectionId;
}

/** ChatGPTX component-store state, not ChatGPT product state. */
export interface ExtensionsApi {
  /** Return every selected extension, including disabled entries, sorted by ID. */
  list(options?: RequestOptions): Promise<readonly InstalledExtension[]>;
  /**
   * Set next-start enablement and return the complete updated list. Unknown IDs
   * and attempts to disable a required extension fail.
   */
  setEnabled(
    extensionId: string,
    enabled: boolean,
    options?: RequestOptions,
  ): Promise<readonly InstalledExtension[]>;
}

export interface BaseExtensionContext {
  readonly extension: ExtensionIdentity;
  /** Automatically scoped to `extension.id`; no extension ID is accepted. */
  readonly storage: ExtensionStorageApi;
  readonly extensions: ExtensionsApi;
  /** Aborts on failed activation, app exit, or renderer document unload. */
  readonly lifetime: AbortSignal;
}

export type RendererDocumentId = string;

export interface RendererDocument {
  readonly id: RendererDocumentId;
  readonly windowId: WindowId;
  readonly webContentsId: number;
  readonly url: string;
}

/**
 * Transport values use Electron structured clone. This first contract keeps
 * the wire format to JSON so extension protocols remain inspectable.
 */
export type ExtensionMessage = JsonValue;

export interface MainCallContext {
  readonly renderer: RendererDocument;
  /** Aborts if the renderer disconnects or cancels the call. */
  readonly signal: AbortSignal;
}

export type MainCallHandler = (
  parameters: ExtensionMessage | undefined,
  context: MainCallContext,
) => ExtensionMessage | undefined | Promise<ExtensionMessage | undefined>;

export type RendererConnectionEvent =
  | { readonly type: "connected"; readonly renderer: RendererDocument }
  | { readonly type: "disconnected"; readonly renderer: RendererDocument };

/** The main side of one extension's private renderer channel. */
export interface MainExtensionChannel {
  /** Register one method name. A duplicate registration throws. */
  handle(method: string, handler: MainCallHandler): Disposable;
  send(
    rendererId: RendererDocumentId,
    event: string,
    payload?: ExtensionMessage,
  ): void;
  broadcast(event: string, payload?: ExtensionMessage): void;
  listRenderers(): readonly RendererDocument[];
  onRendererChange(listener: (event: RendererConnectionEvent) => void): Disposable;
}

/** The renderer side of the same extension's private main channel. */
export interface RendererMainChannel {
  /** Rejects when main has no handler, the call fails, or the signal aborts. */
  invoke<
    TResult extends ExtensionMessage | undefined = ExtensionMessage | undefined,
  >(
    method: string,
    parameters?: ExtensionMessage,
    options?: RequestOptions,
  ): Promise<TResult>;
  on(
    event: string,
    listener: (payload: ExtensionMessage | undefined) => void,
  ): Disposable;
}

export interface RendererExtensionContext extends BaseExtensionContext {
  /** Product and React-owned APIs are available only in the renderer entry. */
  readonly api: ChatGPTXApi;
  readonly document: RendererDocument;
  readonly main: RendererMainChannel;
}

export interface ChatGPTXRendererExtension {
  activate(context: RendererExtensionContext): void | Promise<void>;
  /** Best-effort cleanup after lifetime abort, including failed activation. */
  deactivate?(): void | Promise<void>;
}
