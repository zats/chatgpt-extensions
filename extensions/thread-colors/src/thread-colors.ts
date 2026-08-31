import type {
  AppearanceApi,
  AppearanceColorScheme,
  ColorPickerSession,
  Disposable,
  EventStreamMessage,
  HeaderCssProperties,
  HeaderCssPropertiesRegistration,
  HeaderThemeColor,
  RendererExtensionContext,
  ThreadEvent,
  ThreadEventSnapshot,
  ThreadLocator,
  UiMenuActionItem,
  UiMenuItem,
  UiOwnerContext,
  UiRenderContribution,
  UiRegistration,
} from "@chatgptx/api";

const EXTENSION_ID = "thread-colors";
const STORAGE_FILE = "settings.json";

export const COLOR_ITEM_ID = "color";
export const CUSTOM_COLOR_ITEM_ID = "custom";
export const PALETTE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-palette-icon lucide-palette"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/></svg>`;

export interface ThreadColorPreset {
  readonly id: string;
  readonly label: string;
  readonly icon: { readonly kind: "color"; readonly light: string; readonly dark: string };
  readonly properties: HeaderCssProperties;
}

type ThreadColorSelection =
  | { readonly kind: "preset"; readonly preset: string }
  | { readonly kind: "custom"; readonly colors: HeaderThemeColor };

interface StoredThreadColor {
  readonly thread: ThreadLocator;
  readonly selection: ThreadColorSelection;
}

interface ThreadColorState {
  readonly context: RendererExtensionContext;
  readonly generation: number;
  readonly appearance: AppearanceApi;
  readonly disposables: Disposable[];
  readonly onLifetimeAbort: () => void;
  selections: Map<string, StoredThreadColor>;
  currentThread: ThreadLocator | null;
  currentRequest: number;
  headerRegistration: HeaderCssPropertiesRegistration | undefined;
  rowRegistration: UiRegistration | undefined;
  picker:
    | {
        readonly threadKey: string;
        readonly session: ColorPickerSession;
      }
    | undefined;
  loaded: boolean;
  disposed: boolean;
  write: Promise<void>;
}

let activeState: ThreadColorState | undefined;
let activationGeneration = 0;

function channels(color: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) throw new TypeError(`Expected a six-digit hex color: ${color}`);
  const value = match[1];
  if (!value) throw new TypeError(`Expected a six-digit hex color: ${color}`);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function normalizedHexColor(color: string): `#${string}` {
  channels(color);
  return color.toUpperCase() as `#${string}`;
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const value =
    channel <= 0.0031308
      ? 12.92 * channel
      : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(value * 255);
}

interface OklchColor {
  readonly lightness: number;
  readonly chroma: number;
  readonly hue: number;
}

function hexToOklch(color: string): OklchColor {
  const [redChannel, greenChannel, blueChannel] = channels(color);
  const red = srgbToLinear(redChannel);
  const green = srgbToLinear(greenChannel);
  const blue = srgbToLinear(blueChannel);
  const long = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  );
  const medium = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  );
  const short = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  );
  const lightness =
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a =
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b =
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  return {
    lightness,
    chroma: Math.hypot(a, b),
    hue: Math.atan2(b, a),
  };
}

function oklchToHex(
  lightness: number,
  chroma: number,
  hue: number,
): `#${string}` | undefined {
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ] as const;
  if (linear.some((channel) => channel < 0 || channel > 1)) return undefined;
  return `#${linear
    .map((channel) => linearToSrgb(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase() as `#${string}`;
}

export function complementaryColor(
  color: string,
  targetScheme: AppearanceColorScheme,
): `#${string}` {
  const source = hexToOklch(color);
  const mirroredLightness = 1 - source.lightness;
  const lightness =
    targetScheme === "light"
      ? Math.max(mirroredLightness, 0.75)
      : Math.min(mirroredLightness, 0.35);
  let minimum = 0;
  let maximum = source.chroma;
  let result = oklchToHex(lightness, 0, source.hue)!;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const chroma = (minimum + maximum) / 2;
    const candidate = oklchToHex(lightness, chroma, source.hue);
    if (candidate) {
      minimum = chroma;
      result = candidate;
    } else {
      maximum = chroma;
    }
  }
  return result;
}

export function customThemeColors(
  color: string,
  scheme: AppearanceColorScheme,
): HeaderThemeColor {
  const selected = normalizedHexColor(color);
  const complementary = complementaryColor(
    selected,
    scheme === "light" ? "dark" : "light",
  );
  return scheme === "light"
    ? { light: selected, dark: complementary }
    : { light: complementary, dark: selected };
}

function apcaLuminance(color: string): number {
  const [redChannel, greenChannel, blueChannel] = channels(color);
  const red = (redChannel / 255) ** 2.4;
  const green = (greenChannel / 255) ** 2.4;
  const blue = (blueChannel / 255) ** 2.4;
  return 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
}

export function apcaContrast(foreground: string, background: string): number {
  const clampBlack = (luminance: number) =>
    luminance > 0.022
      ? luminance
      : luminance + (0.022 - luminance) ** 1.414;
  const foregroundLuminance = clampBlack(apcaLuminance(foreground));
  const backgroundLuminance = clampBlack(apcaLuminance(background));

  if (Math.abs(backgroundLuminance - foregroundLuminance) < 0.0005) return 0;
  if (backgroundLuminance > foregroundLuminance) {
    const contrast =
      (backgroundLuminance ** 0.56 - foregroundLuminance ** 0.57) * 1.14;
    return contrast < 0.1 ? 0 : (contrast - 0.027) * 100;
  }

  const contrast =
    (backgroundLuminance ** 0.65 - foregroundLuminance ** 0.62) * 1.14;
  return contrast > -0.1 ? 0 : (contrast + 0.027) * 100;
}

export function foregroundForBackground(
  background: string,
): "#000000" | "#FFFFFF" {
  return Math.abs(apcaContrast("#000000", background)) >=
    Math.abs(apcaContrast("#FFFFFF", background))
    ? "#000000"
    : "#FFFFFF";
}

function propertiesForBackground(background: HeaderThemeColor): HeaderCssProperties {
  return {
    "--header-background-color": background,
    "--header-foreground-color": {
      light: foregroundForBackground(background.light),
      dark: foregroundForBackground(background.dark),
    },
  };
}

function colorPreset(
  id: string,
  label: string,
  light: `#${string}`,
  dark: `#${string}` = light,
): ThreadColorPreset {
  const background = { light, dark };
  return {
    id,
    label,
    icon: { kind: "color", light, dark },
    properties: propertiesForBackground(background),
  };
}

export const THREAD_COLORS: readonly ThreadColorPreset[] = [
  {
    id: "default",
    label: "Default",
    icon: { kind: "color", light: "#9B9B9B", dark: "#9B9B9B" },
    properties: {},
  },
  colorPreset("blue", "Blue", "#3A83F7"),
  colorPreset("green", "Green", "#53B559"),
  colorPreset("yellow", "Yellow", "#F6C543"),
  colorPreset("pink", "Pink", "#F077AF"),
  colorPreset("orange", "Orange", "#EE7C37"),
  colorPreset("purple", "Purple", "#A67DE2"),
  colorPreset("black", "Black", "#000000"),
];

const COLORS_BY_ID = new Map(THREAD_COLORS.map((color) => [color.id, color]));
const OWN_COLOR_ITEMS = new WeakSet<object>();

function makeColorItem<TContext extends UiOwnerContext>(
  selectColor: (color: ThreadColorPreset) => void,
  selectCustomColor: () => void,
  customColor?: HeaderThemeColor,
): UiMenuActionItem<TContext> {
  const item: UiMenuActionItem<TContext> = {
    kind: "action",
    id: COLOR_ITEM_ID,
    label: "Color",
    icon: { kind: "svg", source: PALETTE_ICON_SVG },
    items: [
      ...THREAD_COLORS.map((color) => ({
        kind: "action" as const,
        id: color.id,
        label: color.label,
        icon: color.icon,
        onActivate: () => selectColor(color),
      })),
      {
        kind: "action",
        id: CUSTOM_COLOR_ITEM_ID,
        label: "Custom",
        icon: {
          kind: "color",
          light: customColor?.light ?? "#9B9B9B",
          dark: customColor?.dark ?? "#9B9B9B",
        },
        onActivate: selectCustomColor,
      },
    ],
  };
  OWN_COLOR_ITEMS.add(item);
  return item;
}

function isOwnColorItem<TContext extends UiOwnerContext>(
  item: UiMenuItem<TContext>,
): boolean {
  return (
    item.id === COLOR_ITEM_ID &&
    (OWN_COLOR_ITEMS.has(item) || item.origin === `extension:${EXTENSION_ID}`)
  );
}

export function transformThreadMenuItems<TContext extends UiOwnerContext>(
  items: readonly UiMenuItem<TContext>[],
  selectColor: (color: ThreadColorPreset) => void,
  selectCustomColor: () => void,
  customColor?: HeaderThemeColor,
): readonly UiMenuItem<TContext>[] {
  const withoutOwnColor = items.filter((item) => !isOwnColorItem(item));
  const separatorIndex = withoutOwnColor.findIndex(
    (item) => item.kind === "separator",
  );
  const insertionIndex =
    separatorIndex < 0 ? withoutOwnColor.length : separatorIndex;
  return [
    ...withoutOwnColor.slice(0, insertionIndex),
    makeColorItem(
      selectColor,
      selectCustomColor,
      customColor,
    ),
    ...withoutOwnColor.slice(insertionIndex),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseThreadLocator(value: unknown): ThreadLocator {
  if (!isRecord(value) || !nonEmptyString(value.threadId)) {
    throw new TypeError("thread color storage contains an invalid thread");
  }
  if (value.scope === "execution" && nonEmptyString(value.hostId)) {
    return { scope: "execution", hostId: value.hostId, threadId: value.threadId };
  }
  if (value.scope === "cloud" && nonEmptyString(value.accountId)) {
    if (value.workspaceId === undefined) {
      return { scope: "cloud", accountId: value.accountId, threadId: value.threadId };
    }
    if (nonEmptyString(value.workspaceId)) {
      return {
        scope: "cloud",
        accountId: value.accountId,
        workspaceId: value.workspaceId,
        threadId: value.threadId,
      };
    }
  }
  if (
    value.scope === "shared" &&
    nonEmptyString(value.shareId)
  ) {
    return { scope: "shared", shareId: value.shareId, threadId: value.threadId };
  }
  throw new TypeError("thread color storage contains an invalid thread");
}

function parseSelection(value: unknown): ThreadColorSelection {
  if (!isRecord(value)) {
    throw new TypeError("thread color storage contains an invalid selection");
  }
  if (
    value.type === "preset" &&
    typeof value.id === "string" &&
    value.id !== "default" &&
    COLORS_BY_ID.has(value.id)
  ) {
    return { kind: "preset", preset: value.id };
  }
  if (
    value.type === "custom" &&
    typeof value.light === "string" &&
    typeof value.dark === "string"
  ) {
    return {
      kind: "custom",
      colors: {
        light: normalizedHexColor(value.light),
        dark: normalizedHexColor(value.dark),
      },
    };
  }
  throw new TypeError("thread color storage contains an invalid selection");
}

export function threadKey(thread: ThreadLocator): string {
  switch (thread.scope) {
    case "execution":
      return JSON.stringify(["execution", thread.hostId, thread.threadId]);
    case "cloud":
      return JSON.stringify([
        "cloud",
        thread.accountId,
        thread.workspaceId ?? null,
        thread.threadId,
      ]);
    case "shared":
      return JSON.stringify(["shared", thread.shareId, thread.threadId]);
  }
}

export function parseStoredSelections(contents: string): Map<string, StoredThreadColor> {
  const parsed: unknown = JSON.parse(contents);
  if (!isRecord(parsed) || !Array.isArray(parsed.colors)) {
    throw new TypeError("thread color settings must contain a colors array");
  }

  const selections = new Map<string, StoredThreadColor>();
  for (const value of parsed.colors) {
    if (!isRecord(value)) {
      throw new TypeError("thread color storage contains an invalid entry");
    }
    const thread = parseThreadLocator(value.thread);
    const key = threadKey(thread);
    if (selections.has(key)) {
      throw new TypeError("thread color storage contains a duplicate thread");
    }
    selections.set(key, { thread, selection: parseSelection(value.selection) });
  }
  return selections;
}

export function serializeStoredSelections(
  selections: ReadonlyMap<string, StoredThreadColor>,
): string {
  return JSON.stringify({
    colors: [...selections.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => ({
        thread: value.thread,
        selection:
          value.selection.kind === "preset"
            ? { type: "preset", id: value.selection.preset }
            : { type: "custom", ...value.selection.colors },
      })),
  });
}

async function readSelections(
  context: RendererExtensionContext,
): Promise<Map<string, StoredThreadColor>> {
  const contents = await context.storage.readTextFile(STORAGE_FILE, {
    signal: context.lifetime,
  });
  return contents === undefined ? new Map() : parseStoredSelections(contents);
}

function propertiesForSelection(
  selection: ThreadColorSelection | undefined,
): HeaderCssProperties {
  if (!selection) return {};
  return selection.kind === "preset"
    ? COLORS_BY_ID.get(selection.preset)!.properties
    : propertiesForBackground(selection.colors);
}

function backgroundForSelection(
  selection: ThreadColorSelection | undefined,
): HeaderThemeColor | undefined {
  if (!selection) return undefined;
  return selection.kind === "preset"
    ? COLORS_BY_ID.get(selection.preset)?.properties["--header-background-color"]
    : selection.colors;
}

export function createThreadColorView(
  document: Document,
  colors: HeaderThemeColor,
): HTMLElement {
  const bar = document.createElement("span");
  bar.setAttribute("aria-hidden", "true");
  bar.style.display = "block";
  bar.style.width = "3px";
  bar.style.height = "100%";
  bar.style.flex = "none";
  bar.style.borderRadius = "9999px";
  bar.style.backgroundColor = colors.light;
  bar.style.backgroundColor = `light-dark(${colors.light}, ${colors.dark})`;
  return bar;
}

function isActive(state: ThreadColorState): boolean {
  return (
    activeState === state &&
    !state.disposed &&
    !state.context.lifetime.aborted &&
    state.generation === activationGeneration
  );
}

function applyCurrentThreadColor(state: ThreadColorState): void {
  if (!state.loaded || !state.headerRegistration) return;
  const key = state.currentThread ? threadKey(state.currentThread) : undefined;
  const selection = key ? state.selections.get(key)?.selection : undefined;
  state.headerRegistration.update(propertiesForSelection(selection));
}

function invalidateThreadRows(state: ThreadColorState): void {
  state.rowRegistration?.invalidate();
}

function persistSelections(state: ThreadColorState): void {
  const contents = serializeStoredSelections(state.selections);
  state.write = state.write
    .then(() =>
      state.context.storage.writeTextFile(STORAGE_FILE, contents),
    )
    .catch((error: unknown) => {
      if (!state.context.lifetime.aborted) {
        console.error(`[${EXTENSION_ID}] failed to save thread colors`, error);
      }
    });
}

function selectThreadColor(
  state: ThreadColorState,
  thread: ThreadLocator,
  color: ThreadColorPreset,
): void {
  if (!isActive(state)) return;
  const key = threadKey(thread);
  if (color.id === "default") state.selections.delete(key);
  else {
    state.selections.set(key, {
      thread,
      selection: { kind: "preset", preset: color.id },
    });
  }
  if (state.currentThread && threadKey(state.currentThread) === key) {
    applyCurrentThreadColor(state);
  }
  invalidateThreadRows(state);
  persistSelections(state);
}

function cancelPicker(state: ThreadColorState): void {
  const picker = state.picker;
  if (!picker) return;
  state.picker = undefined;
  picker.session.dispose();
}

function initialPickerColor(
  state: ThreadColorState,
  key: string,
  scheme: AppearanceColorScheme,
): `#${string}` {
  const selection = state.selections.get(key)?.selection;
  if (selection?.kind === "custom") {
    return normalizedHexColor(selection.colors[scheme]);
  }
  if (selection?.kind === "preset") {
    const background =
      COLORS_BY_ID.get(selection.preset)?.properties["--header-background-color"];
    if (background) return normalizedHexColor(background[scheme]);
  }
  return scheme === "light" ? "#FFFFFF" : "#000000";
}

async function selectCustomThreadColor(
  state: ThreadColorState,
  thread: ThreadLocator,
): Promise<void> {
  const appearance = state.appearance;
  const key = threadKey(thread);
  if (!isActive(state)) return;

  cancelPicker(state);
  const scheme = appearance.getColorScheme();
  const session = appearance.openColorPicker({
    initialColor: initialPickerColor(state, key, scheme),
    title: "Custom thread color",
    onChange(color) {
      if (
        isActive(state) &&
        state.currentThread &&
        threadKey(state.currentThread) === key
      ) {
        state.headerRegistration?.update(
          propertiesForBackground(customThemeColors(color, scheme)),
        );
      }
    },
  });
  state.picker = { threadKey: key, session };
  const confirmed = await session.result;
  if (!isActive(state) || state.picker?.session !== session) return;
  state.picker = undefined;
  if (confirmed === undefined) {
    if (state.currentThread && threadKey(state.currentThread) === key) {
      applyCurrentThreadColor(state);
    }
    return;
  }

  state.selections.set(key, {
    thread,
    selection: { kind: "custom", colors: customThemeColors(confirmed, scheme) },
  });
  if (state.currentThread && threadKey(state.currentThread) === key) {
    applyCurrentThreadColor(state);
  }
  invalidateThreadRows(state);
  persistSelections(state);
}

function setCurrentThread(
  state: ThreadColorState,
  thread: ThreadLocator | null,
): void {
  const previousKey = state.currentThread ? threadKey(state.currentThread) : null;
  const nextKey = thread ? threadKey(thread) : null;
  if (state.picker && state.picker.threadKey !== nextKey) cancelPicker(state);
  state.currentThread = thread;
  if (previousKey !== nextKey) applyCurrentThreadColor(state);
}

async function refreshCurrentThread(state: ThreadColorState): Promise<void> {
  const request = ++state.currentRequest;
  const thread = await state.context.api.threads.getCurrent(
    state.context.document.windowId,
    { signal: state.context.lifetime },
  );
  if (!isActive(state) || request !== state.currentRequest) return;
  setCurrentThread(state, thread?.ref ?? null);
}

function handleThreadEvent(
  state: ThreadColorState,
  message: EventStreamMessage<ThreadEvent, ThreadEventSnapshot>,
): void {
  if (!isActive(state)) return;
  if (message.type === "snapshot") {
    state.currentRequest += 1;
    setCurrentThread(
      state,
      message.value.selectedByWindow[state.context.document.windowId] ?? null,
    );
    return;
  }
  if (
    message.type === "event" &&
    message.value.event.type === "selected" &&
    message.value.event.windowId === state.context.document.windowId
  ) {
    state.currentRequest += 1;
    setCurrentThread(state, message.value.event.thread);
    return;
  }
  if (message.type === "reset") {
    void refreshCurrentThread(state).catch((error: unknown) => {
      if (isActive(state)) {
        console.error(`[${EXTENSION_ID}] failed to refresh the current thread`, error);
      }
    });
  }
}

function registerThreadRow(state: ThreadColorState): UiRegistration {
  const contribution: UiRenderContribution<
    "sidebar.thread-row.priority-indicator"
  > = {
    isVisible(context) {
      return state.selections.has(threadKey(context.thread.ref));
    },
    render(mount) {
      const key = threadKey(mount.context.thread.ref);
      const selection = state.selections.get(key)?.selection;
      const background = backgroundForSelection(selection);
      if (!background) return;
      const bar = createThreadColorView(
        mount.container.ownerDocument,
        background,
      );
      mount.container.append(bar);

      return {
        dispose() {
          bar.remove();
        },
      };
    },
  };
  const registration = state.context.api.contributions.render(
    "sidebar.thread-row.priority-indicator",
    contribution,
  );
  state.rowRegistration = registration;
  return registration;
}

function transformThreadColorMenu<TContext extends UiOwnerContext>(
  state: ThreadColorState,
  items: readonly UiMenuItem<TContext>[],
  thread: ThreadLocator,
): readonly UiMenuItem<TContext>[] {
  const selection = state.selections.get(threadKey(thread))?.selection;
  return transformThreadMenuItems(
    items,
    (color) => selectThreadColor(state, thread, color),
    () => {
      void selectCustomThreadColor(state, thread).catch((error: unknown) => {
        if (isActive(state)) {
          console.error(
            `[${EXTENSION_ID}] failed to select a custom color`,
            error,
          );
        }
      });
    },
    selection?.kind === "custom" ? selection.colors : undefined,
  );
}

function registerThreadMenus(state: ThreadColorState): readonly UiRegistration[] {
  const headerMenu = state.context.api.contributions.transform(
    "thread.header.menu",
    (items, header) => {
      if (!header.thread) return items;
      const thread = header.thread.ref;
      // The mounted header owner is the authoritative selected thread.
      setCurrentThread(state, thread);
      return transformThreadColorMenu(state, items, thread);
    },
  );
  const sidebarRowMenu = state.context.api.contributions.transform(
    "sidebar.thread-row.menu",
    (items, row) => transformThreadColorMenu(state, items, row.thread.ref),
  );
  return [headerMenu, sidebarRowMenu];
}

function disposeState(state: ThreadColorState): void {
  if (state.disposed) return;
  state.disposed = true;
  state.context.lifetime.removeEventListener("abort", state.onLifetimeAbort);
  cancelPicker(state);
  for (const disposable of [...state.disposables].reverse()) {
    try {
      disposable.dispose();
    } catch (error) {
      console.error(`[${EXTENSION_ID}] cleanup failed`, error);
    }
  }
  state.disposables.length = 0;
}

export async function activateThreadColors(
  context: RendererExtensionContext,
): Promise<void> {
  deactivateThreadColors();
  const generation = ++activationGeneration;
  let state!: ThreadColorState;
  const onLifetimeAbort = () => {
    if (activeState === state) activeState = undefined;
    disposeState(state);
  };
  state = {
    context,
    generation,
    appearance: context.api.appearance,
    disposables: [],
    onLifetimeAbort,
    selections: new Map(),
    currentThread: null,
    currentRequest: 0,
    headerRegistration: undefined,
    rowRegistration: undefined,
    picker: undefined,
    loaded: false,
    disposed: false,
    write: Promise.resolve(),
  };
  activeState = state;
  context.lifetime.addEventListener("abort", onLifetimeAbort, { once: true });
  if (context.lifetime.aborted) {
    onLifetimeAbort();
    return;
  }

  try {
    state.headerRegistration = state.appearance.header.registerProperties({});
    state.disposables.push(state.headerRegistration);
    const [selections, currentThread] = await Promise.all([
      readSelections(context),
      context.api.threads.getCurrent(context.document.windowId, {
        signal: context.lifetime,
      }),
    ]);
    if (!isActive(state)) return;

    state.selections = selections;
    state.currentThread = currentThread?.ref ?? null;
    state.loaded = true;
    state.disposables.push(registerThreadRow(state));
    state.disposables.push(...registerThreadMenus(state));
    const unsubscribe = context.api.threads.events.subscribe(
      (message) => handleThreadEvent(state, message),
      { signal: context.lifetime },
    );
    state.disposables.push({ dispose: unsubscribe });
    applyCurrentThreadColor(state);
  } catch (error) {
    if (activeState === state) activeState = undefined;
    disposeState(state);
    throw error;
  }
}

export function deactivateThreadColors(): void {
  activationGeneration += 1;
  const state = activeState;
  activeState = undefined;
  if (state) disposeState(state);
}

export type { StoredThreadColor, ThreadColorSelection };
