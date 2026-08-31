import type {
  Disposable,
  InstalledExtension,
  JsonObject,
  RendererExtensionContext,
  SettingChange,
  UiRegistration,
} from "@chatgptx/api";
import {
  ENABLED_SETTING_PREFIX,
  EXTENSION_ID,
  enabledSettingKey,
} from "./constants.js";
import {
  createExtensionsSettingsSection,
  managedExtensions,
} from "./settings-section.js";

const extensionSettingsScope = Object.freeze({
  kind: "extension" as const,
});

function installedById(
  extensions: readonly InstalledExtension[],
): ReadonlyMap<string, InstalledExtension> {
  return new Map(
    managedExtensions(extensions).map((extension) => [extension.id, extension]),
  );
}

function enabledValues(
  extensions: readonly InstalledExtension[],
): JsonObject {
  return Object.fromEntries(
    managedExtensions(extensions).map((extension) => [
      enabledSettingKey(extension.id),
      extension.enabled,
    ]),
  );
}

class ExtensionManager implements Disposable {
  readonly #context: RendererExtensionContext;
  readonly #rendererWindow: EventTarget | undefined;
  #installed = new Map<string, InstalledExtension>();
  #section: UiRegistration | undefined;
  #unsubscribe: (() => void) | undefined;
  #operations: Promise<void> = Promise.resolve();
  #pendingRefresh: Promise<void> | undefined;
  #disposed = false;

  constructor(
    context: RendererExtensionContext,
    rendererWindow: EventTarget | undefined,
  ) {
    this.#context = context;
    this.#rendererWindow = rendererWindow;
  }

  async start(): Promise<this> {
    if (this.#context.lifetime.aborted) {
      this.#disposed = true;
      return this;
    }

    try {
      await this.#replaceInstalled(await this.#context.extensions.list());
      if (this.#disposed || this.#context.lifetime.aborted) {
        this.dispose();
        return this;
      }

      this.#unsubscribe = this.#context.api.settings
        .events(extensionSettingsScope)
        .subscribe((message) => {
          if (message.type !== "event") return;
          this.#enqueue(() => this.#applySettingChange(message.value.event));
        });
      this.#rendererWindow?.addEventListener("focus", this.#focus);
      this.#context.lifetime.addEventListener("abort", this.#abort, {
        once: true,
      });
      return this;
    } catch (error: unknown) {
      this.dispose();
      throw error;
    }
  }

  refresh(): Promise<void> {
    if (this.#pendingRefresh) return this.#pendingRefresh;

    const pending = this.#enqueue(async () => {
      await this.#replaceInstalled(await this.#context.extensions.list());
    });
    this.#pendingRefresh = pending;
    void pending.then(
      () => this.#clearPendingRefresh(pending),
      () => this.#clearPendingRefresh(pending),
    );
    return pending;
  }

  #clearPendingRefresh(pending: Promise<void>): void {
    if (this.#pendingRefresh === pending) this.#pendingRefresh = undefined;
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.#operations.then(async () => {
      if (this.#disposed) return;
      await operation();
    });
    this.#operations = result.catch((error: unknown) => {
      console.error(`[${EXTENSION_ID}] operation failed`, error);
    });
    return result;
  }

  async #replaceInstalled(
    extensions: readonly InstalledExtension[],
  ): Promise<void> {
    if (this.#disposed) return;
    this.#installed = new Map(installedById(extensions));
    await this.#context.api.settings.batch(enabledValues(extensions), {
      scope: extensionSettingsScope,
    });
    if (this.#disposed) return;

    this.#section?.dispose();
    this.#section = this.#context.api.contributions.register(
      "settings-section",
      createExtensionsSettingsSection(extensions),
    );
  }

  async #applySettingChange(change: SettingChange): Promise<void> {
    if (
      !change.key.startsWith(ENABLED_SETTING_PREFIX) ||
      typeof change.value !== "boolean"
    ) {
      return;
    }

    const extensionId = change.key.slice(ENABLED_SETTING_PREFIX.length);
    const extension = this.#installed.get(extensionId);
    if (!extension) return;

    if (extension.required || extension.enabled === change.value) {
      if (extension.required && extension.enabled !== change.value) {
        await this.#context.api.settings.set(
          enabledSettingKey(extension.id),
          extension.enabled,
          { scope: extensionSettingsScope },
        );
      }
      return;
    }

    try {
      await this.#replaceInstalled(
        await this.#context.extensions.setEnabled(extensionId, change.value),
      );
    } catch (error: unknown) {
      try {
        await this.#replaceInstalled(await this.#context.extensions.list());
      } catch (refreshError: unknown) {
        console.error(
          `[${EXTENSION_ID}] state refresh after a failed change failed`,
          refreshError,
        );
      }
      throw error;
    }
  }

  readonly #abort = (): void => {
    this.dispose();
  };

  readonly #focus = (): void => {
    void this.refresh().catch(() => undefined);
  };

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#context.lifetime.removeEventListener("abort", this.#abort);
    this.#rendererWindow?.removeEventListener("focus", this.#focus);
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#section?.dispose();
    this.#section = undefined;
    this.#installed.clear();
  }
}

export async function activateExtensionManager(
  context: RendererExtensionContext,
  rendererWindow: EventTarget | undefined =
    typeof window === "undefined" ? undefined : window,
): Promise<Disposable> {
  return new ExtensionManager(context, rendererWindow).start();
}
