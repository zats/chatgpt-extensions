import assert from "node:assert/strict";
import test from "node:test";
import type {
  EventStreamMessage,
  InstalledExtension,
  JsonObject,
  RendererExtensionContext,
  SettingChange,
  SettingsSectionDefinition,
  SettingsSnapshot,
  UiDefinitionKind,
  UiRegistration,
} from "@chatgptx/api";
import { enabledSettingKey } from "../src/constants.js";
import { activateExtensionManager } from "../src/manager.js";
import {
  activate as activateRenderer,
  deactivate as deactivateRenderer,
} from "../src/renderer.js";

type Definition = SettingsSectionDefinition;
type SettingsMessage = EventStreamMessage<SettingChange, SettingsSnapshot>;

interface RegistrationRecord {
  readonly kind: UiDefinitionKind;
  readonly definition: Definition;
  disposed: boolean;
}

function extension(
  id: string,
  enabled: boolean,
  required = false,
): InstalledExtension {
  return Object.freeze({
    id,
    name:
      id === "thread-colors"
        ? "Thread Colors"
        : id === "reactions"
          ? "Reactions"
          : "Extensions",
    description: `Description for ${id}.`,
    version: "1.2.3",
    enabled,
    required,
    ...(id === "thread-colors"
      ? { settingsSectionId: "thread-colors.settings" }
      : {}),
  });
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function createHarness(
  initial: readonly InstalledExtension[],
  setEnabled: (
    extensionId: string,
    enabled: boolean,
  ) => Promise<readonly InstalledExtension[]> = async () => initial,
) {
  const abort = new AbortController();
  const registrations: RegistrationRecord[] = [];
  const listeners = new Set<(message: SettingsMessage) => void>();
  const batches: JsonObject[] = [];
  const writes: Array<{ readonly key: string; readonly value: unknown }> = [];
  let selected = initial;
  let listCalls = 0;

  const context = {
    extension: {
      id: "extensions",
      instanceId: "extensions:test",
      version: "0.1.0",
      manifestDigest: "test",
    },
    lifetime: abort.signal,
    extensions: {
      async list() {
        listCalls += 1;
        return selected;
      },
      setEnabled,
    },
    api: {
      contributions: {
        register(kind: UiDefinitionKind, definition: Definition) {
          const record: RegistrationRecord = {
            kind,
            definition,
            disposed: false,
          };
          registrations.push(record);
          return {
            invalidate() {},
            dispose() {
              record.disposed = true;
            },
          } satisfies UiRegistration;
        },
      },
      settings: {
        async batch(values: JsonObject) {
          batches.push({ ...values });
        },
        async set(key: string, value: unknown) {
          writes.push({ key, value });
          emit(key, value);
        },
        events() {
          return {
            subscribe(listener: (message: SettingsMessage) => void) {
              listeners.add(listener);
              return () => listeners.delete(listener);
            },
          };
        },
      },
    },
  } as unknown as RendererExtensionContext;

  function emit(key: string, value: unknown): void {
    const message = {
      type: "event",
      cursor: "1",
      value: {
        id: "settings-1",
        sequence: 1,
        occurredAt: new Date(0).toISOString(),
        scope: {},
        event: {
          key,
          scope: { kind: "extension" },
          value,
        },
      },
    } as SettingsMessage;
    for (const listener of listeners) listener(message);
  }

  return {
    abort,
    batches,
    context,
    emit,
    listeners,
    registrations,
    setSelected(next: readonly InstalledExtension[]) {
      selected = next;
    },
    writes,
    get listCalls() {
      return listCalls;
    },
  };
}

function latestDefinition(
  records: readonly RegistrationRecord[],
  kind: "settings-section",
): SettingsSectionDefinition {
  const record = records.findLast((candidate) => candidate.kind === kind);
  assert.ok(record);
  return record.definition;
}

test("the native section lists selected extensions and disables required toggles", async () => {
  const harness = createHarness([
    extension("extensions", true, true),
    extension("thread-colors", true),
    extension("reactions", true, true),
  ]);
  const manager = await activateExtensionManager(harness.context);

  assert.deepEqual(harness.batches, [
    {
      [enabledSettingKey("thread-colors")]: true,
      [enabledSettingKey("reactions")]: true,
    },
  ]);
  const section = latestDefinition(harness.registrations, "settings-section");
  assert.equal(section.content, "controls");
  if (section.content !== "controls") return;

  const toggles = section.controls.filter((control) => control.type === "toggle");
  assert.deepEqual(
    toggles.map((control) => ({
      title: control.title,
      settingKey: control.settingKey,
      disabled: control.disabled,
      restartRequired: control.restartRequired,
      destination: control.destination,
    })),
    [
      {
        title: "Thread Colors",
        settingKey: enabledSettingKey("thread-colors"),
        disabled: false,
        restartRequired: true,
        destination: { sectionId: "thread-colors.settings" },
      },
      {
        title: "Reactions",
        settingKey: enabledSettingKey("reactions"),
        disabled: true,
        restartRequired: true,
        destination: undefined,
      },
    ],
  );
  assert.equal(
    section.controls.some((control) => control.title === "Extensions"),
    false,
  );
  manager.dispose();
});

test("a toggle change updates selected extension state through the public API", async () => {
  let resolveChanged!: () => void;
  const changed = new Promise<void>((resolve) => {
    resolveChanged = resolve;
  });
  const calls: Array<{ readonly id: string; readonly enabled: boolean }> = [];
  const updated = [
    extension("extensions", true, true),
    extension("thread-colors", false),
  ];
  const harness = createHarness(
    [extension("extensions", true, true), extension("thread-colors", true)],
    async (id, enabled) => {
      calls.push({ id, enabled });
      resolveChanged();
      return updated;
    },
  );
  const manager = await activateExtensionManager(harness.context);

  harness.emit(enabledSettingKey("thread-colors"), false);
  await changed;
  await nextTurn();

  assert.deepEqual(calls, [{ id: "thread-colors", enabled: false }]);
  assert.deepEqual(harness.batches.at(-1), {
    [enabledSettingKey("thread-colors")]: false,
  });
  manager.dispose();
});

test("a required extension rejects programmatic changes without a management call", async () => {
  let setEnabledCalls = 0;
  const harness = createHarness(
    [extension("extensions", true, true), extension("reactions", true, true)],
    async () => {
      setEnabledCalls += 1;
      return [];
    },
  );
  const manager = await activateExtensionManager(harness.context);

  harness.emit(enabledSettingKey("reactions"), false);
  await nextTurn();
  await nextTurn();

  assert.equal(setEnabledCalls, 0);
  assert.deepEqual(harness.writes, [
    { key: enabledSettingKey("reactions"), value: true },
  ]);
  manager.dispose();
});

test("window focus reloads the selected list and coalesces repeated focus events", async () => {
  const rendererWindow = new EventTarget();
  const harness = createHarness([
    extension("extensions", true, true),
    extension("thread-colors", true),
  ]);
  const manager = await activateExtensionManager(
    harness.context,
    rendererWindow,
  );
  const firstSection = harness.registrations.find(
    (record) => record.kind === "settings-section",
  );
  assert.ok(firstSection);

  harness.setSelected([
    extension("extensions", true, true),
    extension("thread-colors", true),
    extension("reactions", false),
  ]);
  rendererWindow.dispatchEvent(new Event("focus"));
  rendererWindow.dispatchEvent(new Event("focus"));
  await nextTurn();

  assert.equal(harness.listCalls, 2);
  assert.equal(firstSection.disposed, true);
  const section = latestDefinition(harness.registrations, "settings-section");
  assert.equal(section.content, "controls");
  if (section.content !== "controls") return;
  assert.deepEqual(
    section.controls
      .filter((control) => control.type === "toggle")
      .map((control) => control.title),
    ["Thread Colors", "Reactions"],
  );

  manager.dispose();
  rendererWindow.dispatchEvent(new Event("focus"));
  await nextTurn();
  assert.equal(harness.listCalls, 2);
});

test("lifetime abort removes settings behavior and native registrations", async () => {
  let setEnabledCalls = 0;
  const harness = createHarness(
    [extension("extensions", true, true), extension("thread-colors", true)],
    async () => {
      setEnabledCalls += 1;
      return [];
    },
  );
  await activateExtensionManager(harness.context);

  harness.abort.abort();
  harness.emit(enabledSettingKey("thread-colors"), false);
  await nextTurn();

  assert.equal(harness.listeners.size, 0);
  assert.equal(setEnabledCalls, 0);
  assert.equal(
    harness.registrations.every((registration) => registration.disposed),
    true,
  );
});

test("the required normal renderer owns manager activation and cleanup", async () => {
  const harness = createHarness([
    extension("extensions", true, true),
    extension("thread-colors", true),
  ]);

  await activateRenderer(harness.context);
  assert.deepEqual(
    harness.registrations.map((registration) => registration.kind),
    ["settings-section"],
  );

  await deactivateRenderer?.();
  assert.equal(
    harness.registrations.every((registration) => registration.disposed),
    true,
  );
  assert.equal(harness.listeners.size, 0);
});
