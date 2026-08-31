import type {
  AssistantSelectionActionContext,
  EventStreamMessage,
  ExtensionStorageApi,
  JsonObject,
  SettingChange,
  SettingsApi,
  SettingsScope,
  SettingsSnapshot,
  SettingValue,
} from "@chatgptx/api";

export interface MemoryStorage {
  readonly api: ExtensionStorageApi;
  readonly read: (path?: string) => string | undefined;
  readonly writes: readonly { path: string; contents: string }[];
  readonly deletes: readonly string[];
}

export interface MemorySettings {
  readonly api: SettingsApi;
  readonly read: (key: string) => SettingValue | undefined;
  readonly writes: readonly { key: string; value: SettingValue }[];
  set(key: string, value: SettingValue): Promise<void>;
  delete(key: string): Promise<void>;
}

const extensionScope = Object.freeze({
  kind: "extension" as const,
}) satisfies SettingsScope;

export function createMemorySettings(
  initial: JsonObject = {},
): MemorySettings {
  const values: Record<string, SettingValue> = { ...initial };
  const writes: { key: string; value: SettingValue }[] = [];
  const listeners = new Set<
    (
      message: EventStreamMessage<SettingChange, SettingsSnapshot>,
    ) => void
  >();
  let revision = 0;
  let sequence = 0;

  const emit = (key: string, value: SettingValue | undefined): void => {
    revision += 1;
    sequence += 1;
    for (const listener of listeners) {
      listener({
        type: "event",
        cursor: String(revision),
        value: {
          id: `setting-${sequence}`,
          sequence,
          occurredAt: "2026-08-30T12:00:00.000Z",
          scope: {},
          event: { key, scope: extensionScope, value },
        },
      });
    }
  };

  const api: SettingsApi = {
    async get<T extends SettingValue = SettingValue>(key: string) {
      return values[key] as T | undefined;
    },
    async set(key, value) {
      values[key] = value;
      writes.push({ key, value });
      emit(key, value);
    },
    async delete(key) {
      delete values[key];
      emit(key, undefined);
    },
    async batch(nextValues) {
      for (const [key, value] of Object.entries(nextValues)) {
        values[key] = value;
        writes.push({ key, value });
        emit(key, value);
      }
    },
    async listSections() {
      return [];
    },
    async open() {},
    events() {
      return {
        subscribe(listener) {
          listeners.add(listener);
          listener({
            type: "snapshot",
            cursor: String(revision),
            value: {
              revision,
              scope: extensionScope,
              values: { ...values },
            },
          });
          return () => listeners.delete(listener);
        },
      };
    },
  };

  return {
    api,
    read: (key) => values[key],
    writes,
    set: (key, value) => api.set(key, value, { scope: extensionScope }),
    delete: (key) => api.delete(key, { scope: extensionScope }),
  };
}

export function createMemoryStorage(initial?: string): MemoryStorage {
  const files = new Map<string, string>();
  if (initial !== undefined) files.set("settings.json", initial);
  const writes: { path: string; contents: string }[] = [];
  const deletes: string[] = [];

  return {
    api: {
      async listFiles() {
        return [...files.keys()].sort();
      },
      async readTextFile(path) {
        return files.get(path);
      },
      async writeTextFile(path, contents) {
        writes.push({ path, contents });
        files.set(path, contents);
      },
      async deleteFile(path) {
        deletes.push(path);
        files.delete(path);
      },
    },
    read: (path = "settings.json") => files.get(path),
    writes,
    deletes,
  };
}

export function createSelectionContext(
  createResponseAnnotation: AssistantSelectionActionContext["createResponseAnnotation"],
): AssistantSelectionActionContext {
  return Object.freeze({
    ownerId: "selection-owner",
    windowId: "window-1",
    id: "selection-1",
    thread: {
      scope: "execution" as const,
      hostId: "host-1",
      threadId: "thread-1",
    },
    selectedText: "The worktree is clean.",
    rects: Object.freeze([{ x: 10, y: 20, width: 80, height: 18 }]),
    startedAt: "2026-08-30T12:00:00.000Z",
    createResponseAnnotation,
  });
}
