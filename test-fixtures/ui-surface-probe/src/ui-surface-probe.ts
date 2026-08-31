import type {
  ComposerActionDefinition,
  ComposerActionPlacement,
  ComposerUtilityContext,
  ContributionsApi,
  Disposable,
  ExtensionStorageApi,
  HomeAnnouncementItem,
  HomeSuggestionItem,
  ProductModeMenuItem,
  SidebarDestinationItem,
  UiRegistration,
  UiRenderPointId,
  UiRenderProvider,
} from "@chatgptx/api";

export const PROBE_SUGGESTION_ID = "ui-surface-probe.suggestion";
export const PROBE_ANNOUNCEMENT_ID = "ui-surface-probe.announcement";
export const PROBE_SIDEBAR_ID = "ui-surface-probe.sidebar";
export const PROBE_PRODUCT_MENU_ID = "ui-surface-probe.product-menu";
export const PROBE_COMPOSER_ACTION_PLACEMENTS = Object.freeze([
  "composer.footer.leading",
  "composer.footer.trailing",
  "composer.action-bar.leading",
  "composer.action-bar.trailing",
  "composer.utility.leading",
  "composer.utility.trailing",
] as const satisfies readonly ComposerActionPlacement[]);
export const PROBE_COMPOSER_RENDER_POINTS = Object.freeze([
  ...PROBE_COMPOSER_ACTION_PLACEMENTS,
  "composer.attachments",
] as const satisfies readonly UiRenderPointId[]);

export function probeComposerActionId(
  placement: ComposerActionPlacement,
): string {
  return `ui-surface-probe.composer-action.${placement}`;
}

export type ProbeEventName =
  | "suggestion.activate"
  | "announcement.primary"
  | "announcement.dismiss"
  | "sidebar.select"
  | "product-menu.activate"
  | `composer-action.${ComposerActionPlacement}.activate`
  | `composer-render.${(typeof PROBE_COMPOSER_RENDER_POINTS)[number]}.${
      | "mount"
      | "invalidate"
      | "activate"
      | "dispose"}`;

export interface ProbeEvent {
  readonly sequence: number;
  readonly name: ProbeEventName;
}

export interface ProbeEventLog {
  readonly events: readonly ProbeEvent[];
}

export interface UiSurfaceProbeContext {
  readonly api: { readonly contributions: ContributionsApi };
  readonly storage: ExtensionStorageApi;
  readonly lifetime: AbortSignal;
  readonly document: { readonly id: string };
}

export function probeEventFileForDocument(documentId: string): string {
  const safeDocumentId = documentId.replace(/[^A-Za-z0-9_-]/g, "_");
  if (safeDocumentId.length === 0) {
    throw new TypeError("UI Surface Probe document ID is empty");
  }
  return `events-${safeDocumentId}.json`;
}

const EVENT_NAMES = new Set<ProbeEventName>([
  "suggestion.activate",
  "announcement.primary",
  "announcement.dismiss",
  "sidebar.select",
  "product-menu.activate",
  ...PROBE_COMPOSER_ACTION_PLACEMENTS.map(
    (placement) => `composer-action.${placement}.activate` as const,
  ),
  ...PROBE_COMPOSER_RENDER_POINTS.flatMap((point) =>
    (["mount", "invalidate", "activate", "dispose"] as const).map(
      (event) => `composer-render.${point}.${event}` as const,
    ),
  ),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseProbeEventLog(contents: string | undefined): ProbeEvent[] {
  if (contents === undefined) return [];
  const value: unknown = JSON.parse(contents);
  if (!isRecord(value) || !Array.isArray(value.events)) {
    throw new TypeError("UI Surface Probe storage is not an event log");
  }
  return value.events.map((event, index) => {
    if (
      !isRecord(event) ||
      event.sequence !== index + 1 ||
      typeof event.name !== "string" ||
      !EVENT_NAMES.has(event.name as ProbeEventName)
    ) {
      throw new TypeError("UI Surface Probe storage contains an invalid event");
    }
    return Object.freeze({
      sequence: event.sequence,
      name: event.name as ProbeEventName,
    });
  });
}

export function serializeProbeEventLog(events: readonly ProbeEvent[]): string {
  return `${JSON.stringify({ events }, null, 2)}\n`;
}

function countEvents(events: readonly ProbeEvent[], name: ProbeEventName): number {
  return events.reduce(
    (count, event) => count + (event.name === name ? 1 : 0),
    0,
  );
}

function withoutId<T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
): readonly T[] {
  return items.filter((item) => item.id !== id);
}

class UiSurfaceProbe implements Disposable {
  readonly #context: UiSurfaceProbeContext;
  readonly #eventFile: string;
  readonly #events: ProbeEvent[];
  readonly #registrations = new Set<UiRegistration>();
  readonly #registrationBySurface = new Map<string, UiRegistration>();
  #write: Promise<void> = Promise.resolve();
  #disposed = false;

  constructor(context: UiSurfaceProbeContext, events: readonly ProbeEvent[]) {
    this.#context = context;
    this.#eventFile = probeEventFileForDocument(context.document.id);
    this.#events = [...events];
  }

  install(): this {
    if (this.#context.lifetime.aborted) {
      this.#disposed = true;
      return this;
    }

    this.#addRegistration(
      "suggestion",
      this.#context.api.contributions.transform(
        "home.new-chat-suggestions",
        (items) => [this.#suggestion(), ...withoutId(items, PROBE_SUGGESTION_ID)],
      ),
    );
    this.#addRegistration(
      "announcement",
      this.#context.api.contributions.transform("home.announcements", (items) => [
        this.#announcement(),
        ...withoutId(items, PROBE_ANNOUNCEMENT_ID),
      ]),
    );
    this.#addRegistration(
      "sidebar",
      this.#context.api.contributions.transform("sidebar.destinations", (items) => [
        ...withoutId(items, PROBE_SIDEBAR_ID),
        this.#sidebarDestination(),
      ]),
    );
    this.#addRegistration(
      "product-menu",
      this.#context.api.contributions.transform(
        "sidebar.product-mode.menu",
        (items) => [
          ...withoutId(items, PROBE_PRODUCT_MENU_ID),
          this.#productModeMenuItem(),
        ],
      ),
    );
    for (const placement of PROBE_COMPOSER_ACTION_PLACEMENTS) {
      this.#installComposerAction(placement);
    }
    for (const point of PROBE_COMPOSER_RENDER_POINTS) {
      this.#addRegistration(
        `render:${point}`,
        this.#context.api.contributions.render(point, {
          render: this.#composerRender(point),
        }),
      );
    }
    this.#context.lifetime.addEventListener("abort", this.dispose, {
      once: true,
    });
    return this;
  }

  #addRegistration(surface: string, registration: UiRegistration): void {
    this.#registrations.add(registration);
    this.#registrationBySurface.set(surface, registration);
  }

  #installComposerAction(placement: ComposerActionPlacement): void {
    const surface = `action:${placement}`;
    this.#addRegistration(
      surface,
      this.#context.api.contributions.register(
        "composer-action",
        this.#composerAction(placement),
      ),
    );
  }

  #replaceComposerRegistration(placement: ComposerActionPlacement): void {
    const surface = `action:${placement}`;
    const previous = this.#registrationBySurface.get(surface);
    if (previous) {
      previous.dispose();
      this.#registrations.delete(previous);
    }
    this.#installComposerAction(placement);
  }

  #count(name: ProbeEventName): number {
    return countEvents(this.#events, name);
  }

  #append(name: ProbeEventName): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    this.#events.push(
      Object.freeze({ sequence: this.#events.length + 1, name }),
    );
    const contents = serializeProbeEventLog(this.#events);
    this.#write = this.#write.then(() =>
      this.#context.storage.writeTextFile(this.#eventFile, contents),
    );
    return this.#write;
  }

  async #record(name: ProbeEventName, surface: string): Promise<void> {
    const write = this.#append(name);
    this.#registrationBySurface.get(surface)?.invalidate();
    await write;
  }

  async #recordComposerAction(
    placement: ComposerActionPlacement,
  ): Promise<void> {
    const write = this.#append(`composer-action.${placement}.activate`);
    this.#replaceComposerRegistration(placement);
    await write;
  }

  #suggestion(): HomeSuggestionItem {
    const count = this.#count("suggestion.activate");
    return {
      kind: "action",
      id: PROBE_SUGGESTION_ID,
      label: `UI Probe suggestion (${count})`,
      description: "Verifies a native new-thread suggestion",
      icon: { kind: "app", name: "plus" },
      onActivate: () => this.#record("suggestion.activate", "suggestion"),
    };
  }

  #announcement(): HomeAnnouncementItem {
    const primary = this.#count("announcement.primary");
    const dismiss = this.#count("announcement.dismiss");
    return {
      kind: "announcement",
      id: PROBE_ANNOUNCEMENT_ID,
      isEligible: dismiss === 0,
      title: `UI Probe announcement · run ${primary} · dismiss ${dismiss}`,
      description: "Verifies the native home announcement owner",
      leadingVisual: { kind: "app", name: "plus" },
      primaryAction: {
        kind: "action",
        id: `${PROBE_ANNOUNCEMENT_ID}.primary`,
        label: `Run probe (${primary})`,
        onActivate: () =>
          this.#record("announcement.primary", "announcement"),
      },
      dismissAction: {
        kind: "action",
        id: `${PROBE_ANNOUNCEMENT_ID}.dismiss`,
        label: `Dismiss probe (${dismiss})`,
        onActivate: () =>
          this.#record("announcement.dismiss", "announcement"),
      },
    };
  }

  #sidebarDestination(): SidebarDestinationItem {
    const count = this.#count("sidebar.select");
    return {
      kind: "destination",
      id: PROBE_SIDEBAR_ID,
      label: `UI Probe page (${count})`,
      icon: { kind: "app", name: "plus" },
      customizable: false,
      defaultLocation: "sidebar",
      visibleByDefault: true,
      onSelect: () => this.#record("sidebar.select", "sidebar"),
    };
  }

  #productModeMenuItem(): ProductModeMenuItem {
    const count = this.#count("product-menu.activate");
    return {
      kind: "action",
      id: PROBE_PRODUCT_MENU_ID,
      label: `UI Probe menu (${count})`,
      icon: { kind: "app", name: "plus" },
      onActivate: () =>
        this.#record("product-menu.activate", "product-menu"),
    };
  }

  #composerAction(
    placement: ComposerActionPlacement,
  ): ComposerActionDefinition {
    const event = `composer-action.${placement}.activate` as const;
    const count = this.#count(event);
    return {
      kind: "action",
      id: probeComposerActionId(placement),
      placement,
      order: 100,
      label: `UI Probe ${placement} (${count})`,
      tooltip: `UI Probe ${placement} (${count})`,
      icon: { kind: "app", name: "plus" },
      onActivate: () => this.#recordComposerAction(placement),
    };
  }

  #composerRender(
    point: (typeof PROBE_COMPOSER_RENDER_POINTS)[number],
  ): UiRenderProvider<ComposerUtilityContext> {
    return (mount) => {
      if (mount.signal.aborted) return undefined;
      const eventPrefix = `composer-render.${point}` as const;
      const action = mount.container.ownerDocument.createElement("button");
      action.type = "button";
      action.setAttribute("data-ui-probe-render-point", point);
      action.setAttribute("data-ui-probe-render-control", "action");
      action.textContent = `UI Probe render ${point}`;
      action.addEventListener("click", () => {
        void this.#append(`${eventPrefix}.activate`);
      });
      const invalidate = mount.container.ownerDocument.createElement("button");
      invalidate.type = "button";
      invalidate.setAttribute("data-ui-probe-render-point", point);
      invalidate.setAttribute("data-ui-probe-render-control", "invalidate");
      invalidate.textContent = `Invalidate ${point}`;
      invalidate.addEventListener("click", () => {
        void this.#append(`${eventPrefix}.invalidate`);
        this.#registrationBySurface.get(`render:${point}`)?.invalidate(
          mount.ownerId,
        );
      });
      mount.container.append(action, invalidate);
      void this.#append(`${eventPrefix}.mount`);
      let disposed = false;
      return {
        dispose: () => {
          if (disposed) return;
          disposed = true;
          action.remove();
          invalidate.remove();
          void this.#append(`${eventPrefix}.dispose`);
        },
      };
    };
  }

  readonly dispose = (): void => {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#context.lifetime.removeEventListener("abort", this.dispose);
    for (const registration of [...this.#registrations].reverse()) {
      registration.dispose();
    }
    this.#registrations.clear();
    this.#registrationBySurface.clear();
  };
}

export async function activateUiSurfaceProbe(
  context: UiSurfaceProbeContext,
): Promise<Disposable> {
  const eventFile = probeEventFileForDocument(context.document.id);
  const contents = await context.storage.readTextFile(eventFile, {
    signal: context.lifetime,
  });
  return new UiSurfaceProbe(context, parseProbeEventLog(contents)).install();
}
