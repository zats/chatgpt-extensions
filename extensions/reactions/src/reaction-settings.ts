import type { Disposable, ExtensionStorageApi } from "@chatgptx/api";
import {
  DEFAULT_REACTION_TEXT,
  SETTINGS_FILE,
} from "./constants.js";

const SHARED_SETTINGS_KEY = Symbol.for(
  "chatgptx.extension.reactions.settings.v5",
);
const rgiEmojiPattern = new RegExp("\\p{RGI_Emoji}", "gv");

export interface ReactionSettings {
  readonly text: string;
  readonly emojis: readonly string[];
  load(): Promise<void>;
  setText(text: string): Promise<void>;
  reset(): Promise<void>;
  subscribe(listener: (text: string) => void): Disposable;
}

export function parseReactionText(text: string): readonly string[] | undefined {
  if (typeof text !== "string" || text.length === 0) return undefined;
  const emojis = text.match(rgiEmojiPattern);
  if (!emojis || emojis.join("") !== text) return undefined;
  return Object.freeze(emojis);
}

export function createReactionSettings(
  storage: ExtensionStorageApi,
): ReactionSettings {
  let text = DEFAULT_REACTION_TEXT;
  let emojis = parseReactionText(text) ?? Object.freeze([]);
  let operations: Promise<void> = Promise.resolve();
  let loadOperation: Promise<void> | undefined;
  const listeners = new Set<(text: string) => void>();

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener(text);
      } catch (error: unknown) {
        console.error("[reactions] Settings listener failed", error);
      }
    }
  };

  const apply = (nextText: string): void => {
    const nextEmojis = parseReactionText(nextText);
    if (!nextEmojis) {
      throw new TypeError("Reaction settings must contain only RGI emoji");
    }
    if (text === nextText) return;
    text = nextText;
    emojis = nextEmojis;
    notify();
  };

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = operations.then(operation);
    operations = result.catch(() => undefined);
    return result;
  };

  return Object.freeze({
    get text() {
      return text;
    },
    get emojis() {
      return emojis;
    },
    load(): Promise<void> {
      loadOperation ??= enqueue(async () => {
        const contents = await storage.readTextFile(SETTINGS_FILE);
        if (contents === undefined) return;

        const parsed: unknown = JSON.parse(contents);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          !("emojis" in parsed) ||
          typeof parsed.emojis !== "string"
        ) {
          throw new TypeError("Invalid reaction settings file");
        }

        apply(parsed.emojis);
      });
      return loadOperation;
    },
    setText(nextText: string): Promise<void> {
      if (!parseReactionText(nextText)) {
        return Promise.reject(
          new TypeError("Reaction settings must contain only RGI emoji"),
        );
      }

      return enqueue(async () => {
        if (nextText === text) return;
        await storage.writeTextFile(
          SETTINGS_FILE,
          `${JSON.stringify({ emojis: nextText }, null, 2)}\n`,
        );
        apply(nextText);
      });
    },
    reset(): Promise<void> {
      return enqueue(async () => {
        await storage.deleteFile(SETTINGS_FILE);
        apply(DEFAULT_REACTION_TEXT);
      });
    },
    subscribe(listener: (text: string) => void): Disposable {
      if (typeof listener !== "function") {
        throw new TypeError("Reaction settings listener must be a function");
      }

      listeners.add(listener);
      let disposed = false;
      return Object.freeze({
        dispose(): void {
          if (disposed) return;
          disposed = true;
          listeners.delete(listener);
        },
      });
    },
  });
}

export function sharedReactionSettings(
  storage: ExtensionStorageApi,
): ReactionSettings {
  const sharedGlobal = globalThis as typeof globalThis & {
    [SHARED_SETTINGS_KEY]?: ReactionSettings;
  };
  sharedGlobal[SHARED_SETTINGS_KEY] ??= createReactionSettings(storage);
  return sharedGlobal[SHARED_SETTINGS_KEY];
}
