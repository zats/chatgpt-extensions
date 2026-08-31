import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  AppearanceApi,
  AppearanceColorScheme,
  ChatGPTXApi,
  ColorPickerOptions,
  ColorPickerSession,
  EventStreamMessage,
  ExtensionStorageApi,
  HeaderCssProperties,
  RendererExtensionContext,
  SidebarThreadRowContext,
  ThreadEvent,
  ThreadEventSnapshot,
  ThreadHeaderContext,
  ThreadHeaderMenuActionItem,
  ThreadHeaderMenuItem,
  ThreadLocator,
  ThreadSummary,
  UiMount,
  UiMenuItem,
  UiRenderContribution,
  UiRegistration,
  UiTransformer,
} from "@chatgptx/api";
import {
  COLOR_ITEM_ID,
  CUSTOM_COLOR_ITEM_ID,
  PALETTE_ICON_SVG,
  THREAD_COLORS,
  activateThreadColors,
  apcaContrast,
  complementaryColor,
  createThreadColorView,
  customThemeColors,
  deactivateThreadColors,
  foregroundForBackground,
  parseStoredSelections,
  serializeStoredSelections,
  threadKey,
  transformThreadMenuItems,
  type StoredThreadColor,
} from "../src/thread-colors.js";

const WINDOW_ID = "window-1";

function executionThread(threadId: string, hostId = "host-1"): ThreadLocator {
  return { scope: "execution", hostId, threadId };
}

function cloudThread(threadId: string, accountId = "account-1"): ThreadLocator {
  return { scope: "cloud", accountId, threadId };
}

function threadSummary(ref: ThreadLocator, title = ref.threadId): ThreadSummary {
  return {
    ref,
    title,
    mode: ref.scope === "execution" ? "codex" : "chatgpt",
    location: ref.scope === "execution" ? "local" : "cloud",
    state: "idle",
    archived: false,
    pinned: false,
    unread: false,
    temporary: false,
    operations: [],
  };
}

function headerContext(thread: ThreadLocator): ThreadHeaderContext {
  return {
    ownerId: `header-${thread.threadId}`,
    windowId: WINDOW_ID,
    kind: "thread",
    thread: threadSummary(thread),
  };
}

function action(id: string, label: string): ThreadHeaderMenuActionItem {
  return { kind: "action", id, label, origin: "app" };
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly style: Record<string, string> = {};
  parent: FakeElement | undefined;

  constructor(readonly ownerDocument: FakeDocument) {}

  append(child: FakeElement): void {
    child.parent = this;
    this.children.push(child);
  }

  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = undefined;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement(this);
  }
}

interface PickerHarness {
  readonly options: ColorPickerOptions;
  readonly session: ColorPickerSession;
  readonly confirm: (color?: `#${string}`) => void;
  readonly disposed: () => boolean;
}

interface RuntimeHarness {
  readonly context: RendererExtensionContext;
  readonly abort: () => void;
  readonly writes: readonly { path: string; contents: string }[];
  readonly headerUpdates: readonly HeaderCssProperties[];
  readonly rowInvalidations: readonly {
    readonly point: "sidebar.thread-row.priority-indicator";
    readonly ownerId: string | undefined;
  }[];
  readonly menuInvalidations: readonly (string | undefined)[];
  readonly setColorScheme: (scheme: AppearanceColorScheme) => void;
  readonly emitThreadMessage: (
    message: EventStreamMessage<ThreadEvent, ThreadEventSnapshot>,
  ) => void;
  readonly headerMenuTransformer: () => UiTransformer<"thread.header.menu">;
  readonly sidebarMenuTransformer: () => UiTransformer<
    "sidebar.thread-row.menu"
  >;
  readonly priorityContribution: () => UiRenderContribution<
    "sidebar.thread-row.priority-indicator"
  >;
  readonly picker: () => PickerHarness;
  readonly disposed: () => {
    readonly header: boolean;
    readonly headerMenu: boolean;
    readonly sidebarMenu: boolean;
    readonly row: boolean;
    readonly events: boolean;
  };
}

function createRuntimeHarness(
  initialStorage: string | undefined,
  initialThread: ThreadLocator | null,
  options: {
    readonly writeGate?: Promise<void>;
    readonly onWriteStart?: () => void;
  } = {},
): RuntimeHarness {
  const abortController = new AbortController();
  const writes: { path: string; contents: string }[] = [];
  const files = new Map<string, string>();
  if (initialStorage !== undefined) files.set("settings.json", initialStorage);
  const storage: ExtensionStorageApi = {
    async listFiles() {
      return [...files.keys()].sort();
    },
    async readTextFile(path) {
      return files.get(path);
    },
    async writeTextFile(path, contents, requestOptions) {
      requestOptions?.signal?.throwIfAborted();
      options.onWriteStart?.();
      await options.writeGate;
      requestOptions?.signal?.throwIfAborted();
      files.set(path, contents);
      writes.push({ path, contents });
    },
    async deleteFile(path) {
      files.delete(path);
    },
  };

  const headerUpdates: HeaderCssProperties[] = [];
  let headerDisposed = false;
  let colorScheme: AppearanceColorScheme = "light";
  let latestPicker: PickerHarness | undefined;
  const appearance: AppearanceApi = {
    getColorScheme() {
      return colorScheme;
    },
    header: {
      registerProperties(properties) {
        headerUpdates.push(properties);
        return {
          update(nextProperties) {
            headerUpdates.push(nextProperties);
          },
          dispose() {
            headerDisposed = true;
          },
        };
      },
      getProperties() {
        return {};
      },
    },
    openColorPicker(options) {
      let resolveResult!: (color: `#${string}` | undefined) => void;
      let pickerDisposed = false;
      const result = new Promise<`#${string}` | undefined>((resolve) => {
        resolveResult = resolve;
      });
      const session: ColorPickerSession = {
        result,
        dispose() {
          pickerDisposed = true;
          resolveResult(undefined);
        },
      };
      latestPicker = {
        options,
        session,
        confirm: resolveResult,
        disposed: () => pickerDisposed,
      };
      return session;
    },
  };

  let headerMenuTransform: UiTransformer<"thread.header.menu"> | undefined;
  let sidebarMenuTransform:
    | UiTransformer<"sidebar.thread-row.menu">
    | undefined;
  let priorityContribution:
    | UiRenderContribution<"sidebar.thread-row.priority-indicator">
    | undefined;
  const rowInvalidations: {
    point: "sidebar.thread-row.priority-indicator";
    ownerId: string | undefined;
  }[] = [];
  const menuInvalidations: (string | undefined)[] = [];
  let headerMenuDisposed = false;
  let sidebarMenuDisposed = false;
  const rowDisposed = new Set<string>();
  const headerMenuRegistration: UiRegistration = {
    invalidate(ownerId) {
      menuInvalidations.push(ownerId);
    },
    dispose() {
      headerMenuDisposed = true;
    },
  };
  const sidebarMenuRegistration: UiRegistration = {
    invalidate(ownerId) {
      menuInvalidations.push(ownerId);
    },
    dispose() {
      sidebarMenuDisposed = true;
    },
  };
  const rowRegistration = (
    point: "sidebar.thread-row.priority-indicator",
  ): UiRegistration => ({
    invalidate(ownerId) {
      rowInvalidations.push({ point, ownerId });
    },
    dispose() {
      rowDisposed.add(point);
    },
  });

  let threadListener:
    | ((message: EventStreamMessage<ThreadEvent, ThreadEventSnapshot>) => void)
    | undefined;
  let eventDisposed = false;
  const api = {
    appearance,
    contributions: {
      transform(point: string, transformer: unknown) {
        if (point === "thread.header.menu") {
          headerMenuTransform = transformer as UiTransformer<"thread.header.menu">;
          return headerMenuRegistration;
        }
        if (point === "sidebar.thread-row.menu") {
          sidebarMenuTransform = transformer as UiTransformer<
            "sidebar.thread-row.menu"
          >;
          return sidebarMenuRegistration;
        }
        assert.fail(`Unexpected transform point: ${point}`);
      },
      render(point: string, contribution: unknown) {
        if (point === "sidebar.thread-row.priority-indicator") {
          priorityContribution = contribution as UiRenderContribution<
            "sidebar.thread-row.priority-indicator"
          >;
          return rowRegistration(point);
        }
        assert.fail(`Unexpected render point: ${point}`);
      },
    },
    threads: {
      async getCurrent() {
        return initialThread ? threadSummary(initialThread) : null;
      },
      events: {
        subscribe(listener: unknown) {
          threadListener = listener as typeof threadListener;
          return () => {
            eventDisposed = true;
            threadListener = undefined;
          };
        },
      },
    },
  } as unknown as ChatGPTXApi;

  const context = {
    api,
    storage,
    lifetime: abortController.signal,
    document: {
      id: "renderer-1",
      windowId: WINDOW_ID,
      webContentsId: 7,
      url: "app://chatgpt.com/",
    },
    extension: {
      id: "thread-colors",
      instanceId: "instance-1",
      version: "0.1.0",
      manifestDigest: "test",
    },
  } as unknown as RendererExtensionContext;

  return {
    context,
    abort: () => abortController.abort(),
    writes,
    headerUpdates,
    rowInvalidations,
    menuInvalidations,
    setColorScheme: (scheme) => {
      colorScheme = scheme;
    },
    emitThreadMessage: (message) => threadListener?.(message),
    headerMenuTransformer: () => {
      assert.ok(headerMenuTransform);
      return headerMenuTransform;
    },
    sidebarMenuTransformer: () => {
      assert.ok(sidebarMenuTransform);
      return sidebarMenuTransform;
    },
    priorityContribution: () => {
      assert.ok(priorityContribution);
      return priorityContribution;
    },
    picker: () => {
      assert.ok(latestPicker);
      return latestPicker;
    },
    disposed: () => ({
      header: headerDisposed,
      headerMenu: headerMenuDisposed,
      sidebarMenu: sidebarMenuDisposed,
      row: rowDisposed.size === 1,
      events: eventDisposed,
    }),
  };
}

function rowMount(
  thread: ThreadLocator,
  ownerId: string,
): { readonly mount: UiMount<SidebarThreadRowContext>; readonly container: FakeElement } {
  const document = new FakeDocument();
  const container = document.createElement();
  return {
    mount: {
      id: `mount-${ownerId}`,
      ownerId,
      windowId: WINDOW_ID,
      container: container as unknown as HTMLElement,
      context: {
        ownerId,
        windowId: WINDOW_ID,
        thread: threadSummary(thread),
        selected: false,
      },
      signal: new AbortController().signal,
    },
    container,
  };
}

function sidebarRowContext(
  thread: ThreadLocator,
  ownerId = `sidebar-${thread.threadId}`,
): SidebarThreadRowContext {
  return {
    ownerId,
    windowId: WINDOW_ID,
    thread: threadSummary(thread),
    selected: false,
  };
}

function evaluation() {
  return { id: "evaluation-1", signal: new AbortController().signal };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail("Timed out while waiting for Thread Colors");
}

describe("Thread Colors values and menu", () => {
  test("keeps the v4 presets, APCA foregrounds, and OKLCH custom pair", () => {
    const expected = [
      ["blue", "#3A83F7", "#FFFFFF"],
      ["green", "#53B559", "#FFFFFF"],
      ["yellow", "#F6C543", "#000000"],
      ["pink", "#F077AF", "#FFFFFF"],
      ["orange", "#EE7C37", "#FFFFFF"],
      ["purple", "#A67DE2", "#FFFFFF"],
      ["black", "#000000", "#FFFFFF"],
    ];
    assert.deepEqual(
      THREAD_COLORS.slice(1).map((preset) => [
        preset.id,
        preset.properties["--header-background-color"]?.light,
        preset.properties["--header-foreground-color"]?.light,
      ]),
      expected,
    );
    for (const preset of THREAD_COLORS) {
      const background = preset.properties["--header-background-color"];
      const foreground = preset.properties["--header-foreground-color"];
      if (!background || !foreground) continue;
      for (const scheme of ["light", "dark"] as const) {
        assert.equal(
          foreground[scheme],
          foregroundForBackground(background[scheme]),
        );
        assert.ok(
          Math.abs(apcaContrast(foreground[scheme], background[scheme])) >= 45,
        );
      }
    }
    assert.deepEqual(customThemeColors("#336699", "light"), {
      light: "#336699",
      dark: "#023C6B",
    });
    assert.deepEqual(customThemeColors("#336699", "dark"), {
      light: "#7DB3EA",
      dark: "#336699",
    });
    assert.equal(complementaryColor("#FFFFFF", "dark"), "#000000");
    assert.equal(complementaryColor("#000000", "light"), "#FFFFFF");
  });

  test("inserts the native Color submenu before the first separator", async () => {
    const selected: string[] = [];
    let custom = 0;
    const builtIns: readonly ThreadHeaderMenuItem[] = [
      action("app.pin", "Pin"),
      action("app.rename", "Rename"),
      { kind: "separator", id: "app.separator", origin: "app" },
      action("app.share", "Share"),
    ];
    const items = transformThreadMenuItems(
      builtIns,
      (color) => selected.push(color.id),
      () => {
        custom += 1;
      },
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["app.pin", "app.rename", COLOR_ITEM_ID, "app.separator", "app.share"],
    );
    const parent = items[2];
    assert.equal(parent?.kind, "action");
    if (parent?.kind !== "action") return;
    assert.deepEqual(parent.icon, { kind: "svg", source: PALETTE_ICON_SVG });
    assert.deepEqual(parent.items?.map((item) => item.id), [
      "default",
      "blue",
      "green",
      "yellow",
      "pink",
      "orange",
      "purple",
      "black",
      CUSTOM_COLOR_ITEM_ID,
    ]);
    const purple = parent.items?.find((item) => item.id === "purple");
    const customItem = parent.items?.find(
      (item) => item.id === CUSTOM_COLOR_ITEM_ID,
    );
    assert.equal(purple?.kind, "action");
    assert.equal(customItem?.kind, "action");
    if (purple?.kind !== "action" || customItem?.kind !== "action") return;
    const context = headerContext(executionThread("thread-1"));
    await purple.onActivate?.(context, { source: "pointer" });
    await customItem.onActivate?.(context, { source: "pointer" });
    assert.deepEqual(selected, ["purple"]);
    assert.equal(custom, 1);

    assert.equal(
      transformThreadMenuItems([action("app.rename", "Rename")], () => {}, () => {})
        .at(-1)?.id,
      COLOR_ITEM_ID,
    );
  });

  test("replaces only its own Color item when a menu owner is re-evaluated", () => {
    const foreignColor = action(COLOR_ITEM_ID, "App Color");
    const first = transformThreadMenuItems(
      [foreignColor],
      () => {},
      () => {},
    );
    const ownColor = first.find(
      (item) => item.kind === "action" && item.label === "Color",
    );
    assert.ok(ownColor);
    assert.equal(ownColor.kind, "action");
    if (ownColor.kind !== "action") return;
    const stampedOwnColor: ThreadHeaderMenuActionItem = {
      ...ownColor,
      origin: "extension:thread-colors",
    };
    const stampedFirst: readonly ThreadHeaderMenuItem[] = first.map((item) =>
      item === ownColor
        ? stampedOwnColor
        : item,
    );
    const second = transformThreadMenuItems(stampedFirst, () => {}, () => {});

    assert.equal(second.filter((item) => item.id === COLOR_ITEM_ID).length, 2);
    assert.equal(
      second.filter(
        (item) => item.kind !== "separator" && item.label === "App Color",
      ).length,
      1,
    );
    assert.equal(
      second.filter(
        (item) => item.kind !== "separator" && item.label === "Color",
      ).length,
      1,
    );
  });

  test("stores scoped thread locators without bare-ID collisions", () => {
    const contents = JSON.stringify({
      colors: [
        {
          thread: executionThread("same", "host-1"),
          selection: { type: "preset", id: "blue" },
        },
        {
          thread: executionThread("same", "host-2"),
          selection: { type: "custom", light: "#336699", dark: "#023c6b" },
        },
      ],
    });
    const parsed = parseStoredSelections(contents);
    assert.equal(parsed.size, 2);
    assert.notEqual(
      threadKey(executionThread("same", "host-1")),
      threadKey(executionThread("same", "host-2")),
    );
    const reparsed = parseStoredSelections(serializeStoredSelections(parsed));
    assert.deepEqual(reparsed, parsed);
    assert.throws(
      () =>
        parseStoredSelections(
          JSON.stringify({
            colors: [
              {
                thread: executionThread("thread-1"),
                selection: { type: "preset", id: "default" },
              },
            ],
          }),
        ),
      /invalid selection/,
    );
  });

  test("creates the requested 3 px full-height bar", () => {
    const document = new FakeDocument();
    const bar = createThreadColorView(document as unknown as Document, {
      light: "#3A83F7",
      dark: "#000000",
    }) as unknown as FakeElement;
    assert.equal(bar.style.width, "3px");
    assert.equal(bar.style.height, "100%");
    assert.equal(bar.style.flex, "none");
    assert.equal(
      bar.style.backgroundColor,
      "light-dark(#3A83F7, #000000)",
    );
  });
});

describe("Thread Colors renderer lifecycle", () => {
  test("rejects uncolored rows before the host creates a container", async () => {
    deactivateThreadColors();
    const thread = executionThread("thread-without-color");
    const harness = createRuntimeHarness(undefined, thread);
    await activateThreadColors(harness.context);

    const row = rowMount(thread, "row-without-color");
    const contribution = harness.priorityContribution();
    assert.equal(contribution.isVisible?.(row.mount.context), false);
    assert.equal(row.container.children.length, 0);

    harness.abort();
    deactivateThreadColors();
  });

  test("uses the native priority-indicator owner for execution and cloud rows", async () => {
    deactivateThreadColors();
    const execution = executionThread("local-thread");
    const cloud = cloudThread("cloud-thread");
    const stored = new Map<string, StoredThreadColor>([
      [
        threadKey(execution),
        { thread: execution, selection: { kind: "preset", preset: "blue" } },
      ],
      [
        threadKey(cloud),
        { thread: cloud, selection: { kind: "preset", preset: "purple" } },
      ],
    ]);
    const harness = createRuntimeHarness(
      serializeStoredSelections(stored),
      execution,
    );
    await activateThreadColors(harness.context);

    const prefix = harness.priorityContribution();
    const executionMount = rowMount(execution, "local-row");
    const cloudMount = rowMount(cloud, "cloud-row");
    assert.equal(prefix.isVisible?.(executionMount.mount.context), true);
    assert.equal(prefix.isVisible?.(cloudMount.mount.context), true);

    const executionView = prefix.render(executionMount.mount);
    const cloudView = prefix.render(cloudMount.mount);
    assert.equal(executionMount.container.children.length, 1);
    assert.equal(cloudMount.container.children.length, 1);
    assert.equal(
      cloudMount.container.children[0]?.style.backgroundColor,
      "light-dark(#A67DE2, #A67DE2)",
    );

    executionView?.dispose();
    cloudView?.dispose();
    harness.abort();
    deactivateThreadColors();
  });

  test("uses the header and sidebar menu owners without crossing thread state", async () => {
    deactivateThreadColors();
    const selectedThread = executionThread("selected-thread");
    const rowThread = executionThread("row-thread");
    const stored = new Map<string, StoredThreadColor>([
      [
        threadKey(selectedThread),
        {
          thread: selectedThread,
          selection: { kind: "preset", preset: "blue" },
        },
      ],
    ]);
    const harness = createRuntimeHarness(
      serializeStoredSelections(stored),
      selectedThread,
    );
    await activateThreadColors(harness.context);

    const pendingItems: readonly ThreadHeaderMenuItem[] = [
      action("app.rename", "Rename"),
    ];
    const pendingResult = harness.headerMenuTransformer()(
      pendingItems,
      {
        ownerId: "pending-header",
        windowId: WINDOW_ID,
        kind: "pending-thread",
        thread: null,
      },
      evaluation(),
    );
    assert.equal(pendingResult, pendingItems);

    const selectedHeader = await Promise.resolve(
      harness.headerMenuTransformer()(
        pendingItems,
        headerContext(selectedThread),
        evaluation(),
      ),
    );
    assert.equal(
      selectedHeader.filter(
        (item) => item.kind === "action" && item.label === "Color",
      ).length,
      1,
    );

    const rowItems: readonly UiMenuItem<SidebarThreadRowContext>[] = [
      {
        kind: "action",
        id: "app.rename",
        label: "Rename",
        origin: "app",
      },
    ];
    const transformedRow = await Promise.resolve(
      harness.sidebarMenuTransformer()(
        rowItems,
        sidebarRowContext(rowThread),
        evaluation(),
      ),
    );
    const rowColor = transformedRow.find(
      (item) => item.kind === "action" && item.label === "Color",
    );
    assert.equal(rowColor?.kind, "action");
    if (rowColor?.kind !== "action") return;
    const purple = rowColor.items?.find((item) => item.id === "purple");
    assert.equal(purple?.kind, "action");
    if (purple?.kind !== "action") return;
    await purple.onActivate?.(sidebarRowContext(rowThread), {
      source: "pointer",
    });
    await waitFor(() => harness.writes.length === 1);

    assert.deepEqual(harness.headerUpdates.at(-1), THREAD_COLORS[1]?.properties);
    assert.deepEqual(
      parseStoredSelections(harness.writes[0]?.contents ?? "").get(
        threadKey(rowThread),
      ),
      {
        thread: rowThread,
        selection: { kind: "preset", preset: "purple" },
      },
    );

    const rowMenuWithCustom = await Promise.resolve(
      harness.sidebarMenuTransformer()(
        rowItems,
        sidebarRowContext(rowThread),
        evaluation(),
      ),
    );
    const rowColorWithCustom = rowMenuWithCustom.find(
      (item) => item.kind === "action" && item.label === "Color",
    );
    assert.equal(rowColorWithCustom?.kind, "action");
    if (rowColorWithCustom?.kind !== "action") return;
    const custom = rowColorWithCustom.items?.find(
      (item) => item.id === CUSTOM_COLOR_ITEM_ID,
    );
    assert.equal(custom?.kind, "action");
    if (custom?.kind !== "action") return;
    await custom.onActivate?.(sidebarRowContext(rowThread), {
      source: "pointer",
    });
    const picker = harness.picker();
    assert.equal(picker.options.initialColor, "#A67DE2");
    picker.confirm("#336699");
    await waitFor(() => harness.writes.length === 2);
    assert.deepEqual(harness.headerUpdates.at(-1), THREAD_COLORS[1]?.properties);
    assert.deepEqual(
      parseStoredSelections(harness.writes[1]?.contents ?? "").get(
        threadKey(rowThread),
      ),
      {
        thread: rowThread,
        selection: {
          kind: "custom",
          colors: { light: "#336699", dark: "#023C6B" },
        },
      },
    );

    harness.abort();
    assert.deepEqual(harness.disposed(), {
      header: true,
      headerMenu: true,
      sidebarMenu: true,
      row: true,
      events: true,
    });
    deactivateThreadColors();
  });

  test("finishes an accepted color write after renderer teardown", async () => {
    deactivateThreadColors();
    const thread = executionThread("write-through-teardown");
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    let writeStarted = false;
    const harness = createRuntimeHarness(undefined, thread, {
      writeGate,
      onWriteStart() {
        writeStarted = true;
      },
    });
    await activateThreadColors(harness.context);

    const transformed = await Promise.resolve(
      harness.headerMenuTransformer()([], headerContext(thread), evaluation()),
    );
    const colorParent = transformed.find((item) => item.id === COLOR_ITEM_ID);
    assert.equal(colorParent?.kind, "action");
    if (colorParent?.kind !== "action") return;
    const blue = colorParent.items?.find((item) => item.id === "blue");
    assert.equal(blue?.kind, "action");
    if (blue?.kind !== "action") return;
    await blue.onActivate?.(headerContext(thread), { source: "pointer" });
    await waitFor(() => writeStarted);

    harness.abort();
    deactivateThreadColors();
    releaseWrite();
    await waitFor(() => harness.writes.length === 1);
    assert.match(harness.writes[0]?.contents ?? "", /write-through-teardown/);
  });

  test("loads, remounts, persists, previews, cancels, and cleans up", async () => {
    deactivateThreadColors();
    const thread1 = executionThread("thread-1");
    const thread2 = executionThread("thread-2");
    const thread3 = executionThread("thread-3");
    const stored = new Map<string, StoredThreadColor>([
      [
        threadKey(thread1),
        { thread: thread1, selection: { kind: "preset", preset: "blue" } },
      ],
      [
        threadKey(thread2),
        { thread: thread2, selection: { kind: "preset", preset: "black" } },
      ],
    ]);
    const harness = createRuntimeHarness(
      serializeStoredSelections(stored),
      thread1,
    );
    await activateThreadColors(harness.context);

    assert.deepEqual(harness.headerUpdates.at(-1), THREAD_COLORS[1]?.properties);
    const rowContribution = harness.priorityContribution();
    const thread1Mount = rowMount(thread1, "row-1");
    assert.equal(rowContribution.isVisible?.(thread1Mount.mount.context), true);
    const disposeThread1 = rowContribution.render(thread1Mount.mount);
    assert.equal(thread1Mount.container.children.length, 1);
    assert.equal(thread1Mount.container.children[0]?.style.width, "3px");

    const thread3Mount = rowMount(thread3, "row-3");
    assert.equal(rowContribution.isVisible?.(thread3Mount.mount.context), false);
    assert.equal(thread3Mount.container.children.length, 0);

    const transformed = await Promise.resolve(
      harness.headerMenuTransformer()([], headerContext(thread3), evaluation()),
    );
    assert.deepEqual(harness.headerUpdates.at(-1), {});
    const colorParent = transformed.find((item) => item.id === COLOR_ITEM_ID);
    assert.equal(colorParent?.kind, "action");
    if (colorParent?.kind !== "action") return;
    const purple = colorParent.items?.find((item) => item.id === "purple");
    assert.equal(purple?.kind, "action");
    if (purple?.kind !== "action") return;
    await purple.onActivate?.(headerContext(thread3), { source: "pointer" });
    assert.deepEqual(harness.rowInvalidations, [
      {
        point: "sidebar.thread-row.priority-indicator",
        ownerId: undefined,
      },
    ]);
    assert.equal(rowContribution.isVisible?.(thread3Mount.mount.context), true);
    assert.deepEqual(harness.headerUpdates.at(-1), THREAD_COLORS[6]?.properties);
    await waitFor(() => harness.writes.length === 1);

    const remountedThread3 = rowMount(thread3, "row-3");
    const disposeThread3 = rowContribution.render(remountedThread3.mount);
    assert.equal(remountedThread3.container.children.length, 1);
    assert.equal(
      remountedThread3.container.children[0]?.style.backgroundColor,
      "light-dark(#A67DE2, #A67DE2)",
    );

    harness.emitThreadMessage({
      type: "event",
      cursor: "cursor-1",
      value: {
        id: "event-1",
        sequence: 1,
        occurredAt: "2026-08-30T12:00:00.000Z",
        scope: { windowId: WINDOW_ID },
        event: { type: "selected", windowId: WINDOW_ID, thread: thread3 },
      },
    });
    assert.deepEqual(harness.headerUpdates.at(-1), THREAD_COLORS[6]?.properties);

    const currentMenu = await Promise.resolve(
      harness.headerMenuTransformer()([], headerContext(thread3), evaluation()),
    );
    const currentParent = currentMenu.find((item) => item.id === COLOR_ITEM_ID);
    assert.equal(currentParent?.kind, "action");
    if (currentParent?.kind !== "action") return;
    const defaultItem = currentParent.items?.find((item) => item.id === "default");
    assert.equal(defaultItem?.kind, "action");
    if (defaultItem?.kind !== "action") return;
    await defaultItem.onActivate?.(headerContext(thread3), { source: "pointer" });
    assert.deepEqual(harness.headerUpdates.at(-1), {});
    assert.equal(
      rowContribution.isVisible?.(remountedThread3.mount.context),
      false,
    );
    await waitFor(() => harness.writes.length === 2);

    const customItem = currentParent.items?.find(
      (item) => item.id === CUSTOM_COLOR_ITEM_ID,
    );
    assert.equal(customItem?.kind, "action");
    if (customItem?.kind !== "action") return;
    harness.setColorScheme("light");
    await customItem.onActivate?.(headerContext(thread3), { source: "pointer" });
    const picker = harness.picker();
    assert.equal(picker.options.initialColor, "#FFFFFF");
    picker.options.onChange("#336699");
    assert.deepEqual(harness.headerUpdates.at(-1), {
      "--header-background-color": { light: "#336699", dark: "#023C6B" },
      "--header-foreground-color": { light: "#FFFFFF", dark: "#FFFFFF" },
    });
    picker.confirm("#336699");
    await waitFor(() => harness.writes.length === 3);
    assert.deepEqual(
      parseStoredSelections(harness.writes.at(-1)?.contents ?? "").get(
        threadKey(thread3),
      ),
      {
        thread: thread3,
        selection: {
          kind: "custom",
          colors: { light: "#336699", dark: "#023C6B" },
        },
      },
    );

    const customMenu = await Promise.resolve(
      harness.headerMenuTransformer()([], headerContext(thread3), evaluation()),
    );
    const customParent = customMenu.find((item) => item.id === COLOR_ITEM_ID);
    assert.equal(customParent?.kind, "action");
    if (customParent?.kind !== "action") return;
    const nextCustom = customParent.items?.find(
      (item) => item.id === CUSTOM_COLOR_ITEM_ID,
    );
    assert.equal(nextCustom?.kind, "action");
    if (nextCustom?.kind !== "action") return;
    assert.deepEqual(nextCustom.icon, {
      kind: "color",
      light: "#336699",
      dark: "#023C6B",
    });
    await nextCustom.onActivate?.(headerContext(thread3), { source: "pointer" });
    const cancelledPicker = harness.picker();
    cancelledPicker.options.onChange("#FF0000");
    cancelledPicker.confirm(undefined);
    await waitFor(
      () =>
        harness.headerUpdates.at(-1)?.["--header-background-color"]?.light ===
        "#336699",
    );
    assert.equal(harness.writes.length, 3);

    await nextCustom.onActivate?.(headerContext(thread3), { source: "pointer" });
    const switchedPicker = harness.picker();
    harness.emitThreadMessage({
      type: "event",
      cursor: "cursor-2",
      value: {
        id: "event-2",
        sequence: 2,
        occurredAt: "2026-08-30T12:01:00.000Z",
        scope: { windowId: WINDOW_ID },
        event: { type: "selected", windowId: WINDOW_ID, thread: thread1 },
      },
    });
    assert.equal(switchedPicker.disposed(), true);
    assert.deepEqual(harness.headerUpdates.at(-1), THREAD_COLORS[1]?.properties);

    disposeThread1?.dispose();
    disposeThread3?.dispose();
    harness.abort();
    assert.deepEqual(harness.disposed(), {
      header: true,
      headerMenu: true,
      sidebarMenu: true,
      row: true,
      events: true,
    });
    deactivateThreadColors();
  });
});
