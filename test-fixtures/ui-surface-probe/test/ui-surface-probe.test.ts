import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  ComposerActionDefinition,
  ComposerUtilityContext,
  ContributionsApi,
  ExtensionStorageApi,
  HomeAnnouncementContext,
  HomeSuggestionContext,
  ProductModeMenuContext,
  SidebarDestinationContext,
  UiRegistration,
  UiRenderProvider,
  UiTransformer,
} from "@chatgptx/api";
import {
  PROBE_ANNOUNCEMENT_ID,
  PROBE_COMPOSER_ACTION_PLACEMENTS,
  PROBE_COMPOSER_RENDER_POINTS,
  PROBE_PRODUCT_MENU_ID,
  PROBE_SIDEBAR_ID,
  PROBE_SUGGESTION_ID,
  activateUiSurfaceProbe,
  parseProbeEventLog,
  probeEventFileForDocument,
  probeComposerActionId,
  serializeProbeEventLog,
} from "../src/ui-surface-probe.js";

type CapturedTransformer = (
  items: readonly unknown[],
  context: unknown,
  evaluation: unknown,
) => unknown;

class FakeElement {
  readonly ownerDocument: FakeDocument;
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, () => void>();
  type = "";
  textContent = "";
  removed = false;

  constructor(ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  append(...elements: FakeElement[]): void {
    this.children.push(...elements);
  }

  remove(): void {
    this.removed = true;
  }

  click(): void {
    this.listeners.get("click")?.();
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement(this);
  }
}

interface Harness {
  readonly contributions: ContributionsApi;
  readonly storage: ExtensionStorageApi;
  readonly transforms: Map<string, CapturedTransformer>;
  readonly definitions: Map<string, ComposerActionDefinition>;
  readonly renders: Map<string, UiRenderProvider<ComposerUtilityContext>>;
  readonly writes: string[];
  readonly invalidations: Map<string, number>;
  readonly disposals: Map<string, number>;
}

const PROBE_DOCUMENT_ID = "document:test-renderer";
const PROBE_EVENT_FILE = probeEventFileForDocument(PROBE_DOCUMENT_ID);

function createHarness(initialStorage?: string): Harness {
  const transforms = new Map<string, CapturedTransformer>();
  const definitions = new Map<string, ComposerActionDefinition>();
  const renders = new Map<string, UiRenderProvider<ComposerUtilityContext>>();
  const writes: string[] = [];
  const invalidations = new Map<string, number>();
  const disposals = new Map<string, number>();
  let contents = initialStorage;

  const registration = (key: string): UiRegistration => ({
    invalidate() {
      invalidations.set(key, (invalidations.get(key) ?? 0) + 1);
    },
    dispose() {
      disposals.set(key, (disposals.get(key) ?? 0) + 1);
    },
  });

  const contributions: ContributionsApi = {
    async listPoints() {
      return [];
    },
    async listDefinitionKinds() {
      return [];
    },
    transform(point, transformer) {
      transforms.set(point, transformer as unknown as CapturedTransformer);
      return registration(`transform:${point}`);
    },
    register(kind, definition) {
      assert.equal(kind, "composer-action");
      const composerAction = definition as ComposerActionDefinition;
      definitions.set(composerAction.id, composerAction);
      return registration(`definition:${composerAction.id}`);
    },
    render(point, contribution) {
      renders.set(
        point,
        contribution.render as UiRenderProvider<ComposerUtilityContext>,
      );
      return registration(`render:${point}`);
    },
  };
  const storage: ExtensionStorageApi = {
    async listFiles() {
      return contents === undefined ? [] : [PROBE_EVENT_FILE];
    },
    async readTextFile(path) {
      assert.equal(path, PROBE_EVENT_FILE);
      return contents;
    },
    async writeTextFile(path, nextContents) {
      assert.equal(path, PROBE_EVENT_FILE);
      contents = nextContents;
      writes.push(nextContents);
    },
    async deleteFile() {
      contents = undefined;
    },
  };

  return {
    contributions,
    storage,
    transforms,
    definitions,
    renders,
    writes,
    invalidations,
    disposals,
  };
}

const activation = Object.freeze({ source: "pointer" as const });
const composer = Object.freeze({
  id: "composer-1",
  kind: "main" as const,
  focused: true,
  content: [],
  attachments: [],
  planMode: false,
  fastMode: false,
  submitting: false,
});
const suggestionContext: HomeSuggestionContext = Object.freeze({
  ownerId: "suggestions-owner",
  windowId: "window-1",
  composer,
  composerMode: "work",
  layout: "cards",
  hostId: "host-1",
  plan: false,
});
const announcementContext: HomeAnnouncementContext = Object.freeze({
  ownerId: "announcement-owner",
  windowId: "window-1",
  composer,
  entryPoint: "home",
  homeComposerMode: "work",
  isLocalModeRemote: false,
  onboardingPromosHidden: false,
});
const sidebarContext: SidebarDestinationContext = Object.freeze({
  ownerId: "sidebar-owner",
  windowId: "window-1",
  mode: "codex",
  selectedDestination: { kind: "home" as const, mode: "codex" as const },
});
const productModeContext: ProductModeMenuContext = Object.freeze({
  ownerId: "product-mode-owner",
  windowId: "window-1",
  mode: "codex",
  workModeAccess: "chatgpt_work",
  disabled: false,
});
const composerContext: ComposerUtilityContext = Object.freeze({
  ownerId: "composer-owner",
  windowId: "window-1",
  composer,
});
const evaluation = Object.freeze({
  id: "evaluation-1",
  signal: new AbortController().signal,
});

async function settleWrites(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("UI Surface Probe", () => {
  test("parses and serializes the deterministic event log", () => {
    assert.equal(
      probeEventFileForDocument("document:renderer/one"),
      "events-document_renderer_one.json",
    );
    assert.notEqual(
      probeEventFileForDocument("document:renderer-one"),
      probeEventFileForDocument("document:renderer-two"),
    );
    assert.throws(() => probeEventFileForDocument(""), /document ID is empty/);
    const action =
      "composer-action.composer.action-bar.leading.activate" as const;
    const contents = serializeProbeEventLog([
      { sequence: 1, name: "suggestion.activate" },
      { sequence: 2, name: action },
    ]);
    assert.deepEqual(parseProbeEventLog(contents), [
      { sequence: 1, name: "suggestion.activate" },
      { sequence: 2, name: action },
    ]);
    assert.throws(
      () =>
        parseProbeEventLog(
          `{"events":[{"sequence":2,"name":"${action}"}]}`,
        ),
      /invalid event/,
    );
  });

  test("recovers the full event snapshot after one rejected write", async () => {
    const harness = createHarness();
    let attempts = 0;
    const storage: ExtensionStorageApi = {
      ...harness.storage,
      async writeTextFile(path, contents, options) {
        attempts += 1;
        if (attempts === 1) throw new Error("transient probe write failure");
        await harness.storage.writeTextFile(path, contents, options);
      },
    };
    const errors: unknown[][] = [];
    const previousError = console.error;
    console.error = (...arguments_: unknown[]) => {
      errors.push(arguments_);
    };
    try {
      await activateUiSurfaceProbe({
        api: { contributions: harness.contributions },
        storage,
        lifetime: new AbortController().signal,
        document: { id: PROBE_DOCUMENT_ID },
      });
      const suggestionTransform = harness.transforms.get(
        "home.new-chat-suggestions",
      ) as UiTransformer<"home.new-chat-suggestions">;
      const suggestions = suggestionTransform([], suggestionContext, evaluation);
      assert.ok(!(suggestions instanceof Promise));
      const suggestion = suggestions[0];
      assert.ok(suggestion?.kind === "action");
      await assert.rejects(
        async () => {
          await suggestion.onActivate(suggestionContext, activation);
        },
        /transient probe write failure/,
      );

      const sidebarTransform = harness.transforms.get(
        "sidebar.destinations",
      ) as UiTransformer<"sidebar.destinations">;
      const destinations = sidebarTransform([], sidebarContext, evaluation);
      assert.ok(!(destinations instanceof Promise));
      const destination = destinations.at(-1);
      assert.ok(destination?.kind === "destination");
      assert.ok(destination.onSelect);
      await destination.onSelect(sidebarContext, activation);
    } finally {
      console.error = previousError;
    }

    assert.equal(attempts, 2);
    assert.deepEqual(
      parseProbeEventLog(harness.writes.at(-1)).map((event) => event.name),
      ["suggestion.activate", "sidebar.select"],
    );
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.[0], "[ui-surface-probe] failed to save event evidence");
  });

  test("installs and exercises every native peer and composer slot", async () => {
    const abortController = new AbortController();
    const harness = createHarness();
    await activateUiSurfaceProbe({
      api: { contributions: harness.contributions },
      storage: harness.storage,
      lifetime: abortController.signal,
      document: { id: PROBE_DOCUMENT_ID },
    });

    const suggestionTransform = harness.transforms.get(
      "home.new-chat-suggestions",
    ) as UiTransformer<"home.new-chat-suggestions">;
    const announcementTransform = harness.transforms.get(
      "home.announcements",
    ) as UiTransformer<"home.announcements">;
    const sidebarTransform = harness.transforms.get(
      "sidebar.destinations",
    ) as UiTransformer<"sidebar.destinations">;
    const productTransform = harness.transforms.get(
      "sidebar.product-mode.menu",
    ) as UiTransformer<"sidebar.product-mode.menu">;

    const suggestions = suggestionTransform([], suggestionContext, evaluation);
    assert.ok(!(suggestions instanceof Promise));
    const suggestion = suggestions[0];
    assert.ok(suggestion?.kind === "action");
    assert.equal(suggestion.id, PROBE_SUGGESTION_ID);
    await suggestion.onActivate(suggestionContext, activation);

    const announcements = announcementTransform([], announcementContext, evaluation);
    assert.ok(!(announcements instanceof Promise));
    const announcement = announcements[0];
    assert.ok(announcement?.kind === "announcement");
    assert.equal(announcement.id, PROBE_ANNOUNCEMENT_ID);
    assert.ok(announcement.primaryAction?.onActivate);
    await announcement.primaryAction.onActivate(announcementContext, activation);
    const nextAnnouncements = announcementTransform([], announcementContext, evaluation);
    assert.ok(!(nextAnnouncements instanceof Promise));
    const nextAnnouncement = nextAnnouncements[0];
    assert.ok(nextAnnouncement?.kind === "announcement");
    assert.equal(nextAnnouncement.isEligible, true);
    assert.ok(nextAnnouncement.dismissAction?.onActivate);
    await nextAnnouncement.dismissAction.onActivate(announcementContext, activation);

    const sidebarItems = sidebarTransform([], sidebarContext, evaluation);
    assert.ok(!(sidebarItems instanceof Promise));
    const sidebar = sidebarItems.at(-1);
    assert.ok(sidebar?.kind === "destination");
    assert.equal(sidebar.id, PROBE_SIDEBAR_ID);
    assert.ok(sidebar.onSelect);
    await sidebar.onSelect(sidebarContext, activation);

    const productItems = productTransform([], productModeContext, evaluation);
    assert.ok(!(productItems instanceof Promise));
    const product = productItems.at(-1);
    assert.ok(product?.kind === "action");
    assert.equal(product.id, PROBE_PRODUCT_MENU_ID);
    assert.ok(product.onActivate);
    await product.onActivate(productModeContext, activation);

    for (const placement of PROBE_COMPOSER_ACTION_PLACEMENTS) {
      const id = probeComposerActionId(placement);
      const action = harness.definitions.get(id);
      assert.ok(action);
      assert.equal(action.placement, placement);
      await action.onActivate(composerContext, activation);
      const replacement = harness.definitions.get(id);
      assert.equal(replacement?.label, `UI Probe ${placement} (1)`);
      assert.equal(harness.disposals.get(`definition:${id}`), 1);
    }

    const renderDisposers: Array<{ dispose(): void }> = [];
    const ownerDocument = new FakeDocument();
    for (const point of PROBE_COMPOSER_RENDER_POINTS) {
      const provider = harness.renders.get(point);
      assert.ok(provider);
      const container = new FakeElement(ownerDocument);
      const first = provider({
        id: `${point}:first`,
        ownerId: composerContext.ownerId,
        windowId: composerContext.windowId,
        container: container as unknown as HTMLElement,
        context: composerContext,
        signal: new AbortController().signal,
      });
      assert.ok(first);
      const invalidate = container.children.find(
        (element) => element.attributes.get("data-ui-probe-render-control") === "invalidate",
      );
      assert.ok(invalidate);
      invalidate.click();
      first.dispose();

      const replacementContainer = new FakeElement(ownerDocument);
      const replacement = provider({
        id: `${point}:replacement`,
        ownerId: composerContext.ownerId,
        windowId: composerContext.windowId,
        container: replacementContainer as unknown as HTMLElement,
        context: composerContext,
        signal: new AbortController().signal,
      });
      assert.ok(replacement);
      const action = replacementContainer.children.find(
        (element) => element.attributes.get("data-ui-probe-render-control") === "action",
      );
      assert.ok(action);
      action.click();
      renderDisposers.push(replacement);
      assert.equal(harness.invalidations.get(`render:${point}`), 1);
    }
    await settleWrites();

    const names = parseProbeEventLog(harness.writes.at(-1)).map((event) => event.name);
    for (const expected of [
      "suggestion.activate",
      "announcement.primary",
      "announcement.dismiss",
      "sidebar.select",
      "product-menu.activate",
    ] as const) assert.ok(names.includes(expected), expected);
    for (const placement of PROBE_COMPOSER_ACTION_PLACEMENTS) {
      assert.ok(names.includes(`composer-action.${placement}.activate`), placement);
    }
    for (const point of PROBE_COMPOSER_RENDER_POINTS) {
      for (const event of ["mount", "invalidate", "dispose", "activate"] as const) {
        assert.ok(names.includes(`composer-render.${point}.${event}`), `${point}.${event}`);
      }
    }

    for (const disposer of renderDisposers) disposer.dispose();
    abortController.abort();
    for (const point of PROBE_COMPOSER_RENDER_POINTS) {
      assert.equal(harness.disposals.get(`render:${point}`), 1);
    }
  });

  test("restores one composer placement count from extension storage", async () => {
    const placement = "composer.action-bar.leading" as const;
    const name = `composer-action.${placement}.activate` as const;
    const harness = createHarness(
      serializeProbeEventLog([
        { sequence: 1, name },
        { sequence: 2, name },
        { sequence: 3, name: "sidebar.select" },
      ]),
    );
    await activateUiSurfaceProbe({
      api: { contributions: harness.contributions },
      storage: harness.storage,
      lifetime: new AbortController().signal,
      document: { id: PROBE_DOCUMENT_ID },
    });
    const action = harness.definitions.get(probeComposerActionId(placement));
    assert.equal(action?.label, `UI Probe ${placement} (2)`);
    const sidebarTransform = harness.transforms.get(
      "sidebar.destinations",
    ) as UiTransformer<"sidebar.destinations">;
    const items = sidebarTransform([], sidebarContext, evaluation);
    assert.ok(!(items instanceof Promise));
    assert.equal(
      items[0]?.kind === "destination" ? items[0].label : "",
      "UI Probe page (1)",
    );
  });
});
