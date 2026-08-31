import assert from "node:assert/strict";
import test from "node:test";

import type {
  HeaderCssProperties,
  RendererExtensionContext,
  ThreadLocator,
} from "@chatgptx/api";

import * as threadColorsRenderer from "../../../extensions/thread-colors/src/renderer.ts";
import {
  serializeStoredSelections,
  threadKey,
  THREAD_COLORS,
  type StoredThreadColor,
} from "../../../extensions/thread-colors/src/thread-colors.ts";
import {
  activateExactBuildRendererExtension,
  deactivateExactBuildRendererExtension,
} from "./renderer-adapter.ts";

interface LegacyThread {
  readonly scope?: "execution" | "cloud";
  readonly hostId?: string;
  readonly accountId?: string;
  readonly threadId: string;
  readonly title: string;
}

const stateKey = Symbol.for(
  "chatgptx.v5.exact-build-adapter.26.825.51511",
);

function resetAdapterState(): void {
  const root = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  const state = root[stateKey] as
    | { settings?: Map<string, { channel?: BroadcastChannel }> }
    | undefined;
  for (const hub of state?.settings?.values() ?? []) hub.channel?.close();
  delete root[stateKey];
}

function storedColors(...threads: readonly ThreadLocator[]): string {
  const presets = ["blue", "purple", "purple"] as const;
  const values = new Map<string, StoredThreadColor>(
    threads.map((thread, index) => [
      threadKey(thread),
      {
        thread,
        selection: { kind: "preset", preset: presets[index] ?? "blue" },
      },
    ]),
  );
  return serializeStoredSelections(values);
}

test("Thread Colors keeps the bootstrap window identity across adapter callbacks", async () => {
  resetAdapterState();
  threadColorsRenderer.deactivate?.();
  const previousRuntime = globalThis.__CGPTX_RUNTIME__;
  const runtimeDocument = Object.freeze({
    id: "document:44:1",
    windowId: "window:44",
    webContentsId: 44,
    url: "app://-/index.html",
  });
  const hostId = "host-local";
  const firstThread: LegacyThread = {
    hostId,
    threadId: "thread-1",
    title: "First",
  };
  const secondThread: LegacyThread = {
    hostId,
    threadId: "thread-2",
    title: "Second",
  };
  const firstLocator: ThreadLocator = {
    scope: "execution",
    hostId,
    threadId: firstThread.threadId,
  };
  const secondLocator: ThreadLocator = {
    scope: "execution",
    hostId,
    threadId: secondThread.threadId,
  };
  const cloudThread: LegacyThread = {
    scope: "cloud",
    accountId: "account-1",
    threadId: "cloud-thread",
    title: "Cloud thread",
  };
  const cloudLocator: ThreadLocator = {
    scope: "cloud",
    accountId: "account-1",
    threadId: cloudThread.threadId,
  };
  const stored = storedColors(firstLocator, secondLocator, cloudLocator);
  const threadListeners = new Set<
    (thread: LegacyThread | undefined) => void
  >();
  const threadTransforms = new Set<
    (
      items: readonly unknown[],
      thread: LegacyThread,
    ) => readonly unknown[]
  >();
  const rowProviders = new Set<{
    readonly provider: (thread: LegacyThread) => unknown;
    readonly slot: string;
  }>();
  const rowSlots: string[] = [];
  const callbackWindowIds: string[] = [];
  let currentThread: LegacyThread | undefined = firstThread;
  let appliedHeader: HeaderCssProperties = {};
  let activeContext: RendererExtensionContext | undefined;
  let finishActivationReport!: (value: Record<string, unknown>) => void;
  let activationReport = new Promise<Record<string, unknown>>((resolve) => {
    finishActivationReport = resolve;
  });

  const disposable = (cleanup: () => void) => {
    let disposed = false;
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        cleanup();
      },
    };
  };

  const legacyHost = {
    appearance: {
      header: {
        registerProperties(properties: HeaderCssProperties) {
          appliedHeader = properties;
          return {
            update(next: HeaderCssProperties) {
              appliedHeader = next;
            },
            dispose() {
              appliedHeader = {};
            },
          };
        },
        getProperties() {
          return appliedHeader;
        },
      },
      getColorScheme() {
        return "light" as const;
      },
      openColorPicker() {
        throw new Error("The integration test does not open the color picker");
      },
    },
    menus: {
      thread: {
        transformItems(
          transform: (
            items: readonly unknown[],
            thread: LegacyThread,
          ) => readonly unknown[],
        ) {
          threadTransforms.add(transform);
          return disposable(() => threadTransforms.delete(transform));
        },
      },
    },
    threads: {
      list: {
        registerItem(
          provider: (thread: LegacyThread) => unknown,
          options?: { readonly slot?: string },
        ) {
          const slot = options?.slot ?? "title-prefix";
          const registration = { provider, slot };
          rowProviders.add(registration);
          rowSlots.push(slot);
          return {
            invalidate() {},
            dispose() {
              rowProviders.delete(registration);
            },
          };
        },
      },
      getCurrent() {
        return currentThread;
      },
      subscribe(listener: (thread: LegacyThread | undefined) => void) {
        threadListeners.add(listener);
        listener(currentThread);
        return disposable(() => threadListeners.delete(listener));
      },
    },
  };

  let probeUnsubscribe: (() => void) | undefined;
  const integrationModule = {
    async activate(context: RendererExtensionContext) {
      activeContext = context;
      probeUnsubscribe = context.api.threads.events.subscribe((message) => {
        if (message.type === "snapshot") {
          callbackWindowIds.push(...Object.keys(message.value.selectedByWindow));
        } else if (message.type === "event") {
          if (message.value.scope.windowId) {
            callbackWindowIds.push(message.value.scope.windowId);
          }
          if (message.value.event.type === "selected") {
            callbackWindowIds.push(message.value.event.windowId);
          }
        }
      });
      context.api.contributions.transform(
        "thread.header.menu",
        (items, header) => {
          callbackWindowIds.push(header.windowId);
          return items;
        },
      );
      context.api.contributions.render("sidebar.thread-row.title-prefix", {
        isVisible(row) {
          callbackWindowIds.push(row.windowId);
          return false;
        },
        render() {},
      });
      await threadColorsRenderer.activate(context);
    },
    deactivate() {
      probeUnsubscribe?.();
      probeUnsubscribe = undefined;
      threadColorsRenderer.deactivate?.();
    },
  };

  globalThis.__CGPTX_RUNTIME__ = {
    document: runtimeDocument,
    async request(method, parameters) {
      if (method === "extension-storage.read-text") return stored;
      if (method === "extension-storage.write-text") return null;
      if (method === "renderer-entry.report") {
        finishActivationReport(parameters);
        return null;
      }
      throw new Error(`Unexpected runtime request: ${method}`);
    },
  };

  const identity = {
    id: "thread-colors",
    version: "0.1.0",
    manifestDigest: "integration-test",
  };

  try {
    activateExactBuildRendererExtension(
      legacyHost,
      identity,
      integrationModule,
      "renderer",
    );
    assert.deepEqual(await activationReport, {
      extensionId: "thread-colors",
      phase: "renderer",
      status: "activated",
    });
    assert.ok(activeContext);
    assert.deepEqual([...new Set(rowSlots)], [
      "title-prefix",
      "priority-indicator",
    ]);
    assert.equal(activeContext.document.windowId, runtimeDocument.windowId);
    assert.deepEqual(
      appliedHeader,
      THREAD_COLORS.find((color) => color.id === "blue")?.properties,
    );

    currentThread = secondThread;
    for (const listener of [...threadListeners]) listener(currentThread);
    assert.deepEqual(
      appliedHeader,
      THREAD_COLORS.find((color) => color.id === "purple")?.properties,
    );

    const nativeMenu = [
      {
        kind: "action",
        id: "threadHeader.simplified.archive",
        label: "Archive",
      },
      { kind: "separator", id: "native.separator" },
      { kind: "action", id: "native.trailing", label: "Trailing" },
    ];
    const transformedMenus = [...threadTransforms].map((transform) =>
      transform(nativeMenu, secondThread) as readonly {
        readonly id?: string;
        readonly kind?: string;
      }[]
    );
    const coloredMenu = transformedMenus.find((items) =>
      items.some((item) => item.id === "thread-colors.color")
    );
    assert.ok(coloredMenu);
    assert.deepEqual(
      coloredMenu.map((item) => ({ kind: item.kind, id: item.id })),
      [
        { kind: "action", id: "threadHeader.simplified.archive" },
        { kind: "action", id: "thread-colors.color" },
        { kind: "separator", id: "native.separator" },
        { kind: "action", id: "native.trailing" },
      ],
    );
    const localRows = [...rowProviders]
      .filter(({ provider }) => provider(secondThread) !== undefined)
      .map(({ slot }) => slot);
    const cloudRows = [...rowProviders]
      .filter(({ provider }) => provider(cloudThread) !== undefined)
      .map(({ slot }) => slot);
    assert.deepEqual(localRows, ["priority-indicator"]);
    assert.deepEqual(cloudRows, ["priority-indicator"]);
    assert.ok(callbackWindowIds.length >= 5);
    assert.deepEqual(
      [...new Set(callbackWindowIds)],
      [activeContext.document.windowId],
    );

    deactivateExactBuildRendererExtension(
      identity.id,
      integrationModule,
      "renderer",
    );
    resetAdapterState();
    currentThread = firstThread;
    appliedHeader = {};
    activeContext = undefined;
    callbackWindowIds.length = 0;
    const secondDocument = Object.freeze({
      ...runtimeDocument,
      id: "document:44:2",
    });
    activationReport = new Promise<Record<string, unknown>>((resolve) => {
      finishActivationReport = resolve;
    });
    globalThis.__CGPTX_RUNTIME__ = {
      document: secondDocument,
      async request(method, parameters) {
        if (method === "extension-storage.read-text") return stored;
        if (method === "extension-storage.write-text") return null;
        if (method === "renderer-entry.report") {
          finishActivationReport(parameters);
          return null;
        }
        throw new Error(`Unexpected runtime request: ${method}`);
      },
    };
    activateExactBuildRendererExtension(
      legacyHost,
      identity,
      integrationModule,
      "renderer",
    );
    assert.equal(
      (await activationReport).status,
      "activated",
    );
    const secondContext = activeContext as RendererExtensionContext | undefined;
    assert.ok(secondContext);
    assert.equal(secondContext.document.id, secondDocument.id);
    assert.deepEqual(
      appliedHeader,
      THREAD_COLORS.find((color) => color.id === "blue")?.properties,
    );
    assert.equal(JSON.parse(stored).colors.length, 3);
  } finally {
    deactivateExactBuildRendererExtension(
      identity.id,
      integrationModule,
      "renderer",
    );
    threadColorsRenderer.deactivate?.();
    globalThis.__CGPTX_RUNTIME__ = previousRuntime;
    resetAdapterState();
  }
});
