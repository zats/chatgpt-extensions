import type {
  Disposable,
  SettingsApi,
  SettingsScope,
  SettingValue,
} from "@chatgptx/api";
import { SETTINGS_KEY } from "./constants.js";
import {
  parseReactionText,
  type ReactionSettings,
} from "./reaction-settings.js";

const EXTENSION_SCOPE = Object.freeze({
  kind: "extension" as const,
}) satisfies SettingsScope;

function isReactionText(value: SettingValue | undefined): value is string {
  return typeof value === "string" && parseReactionText(value) !== undefined;
}

/**
 * Keep the native setting control and the extension-owned settings file in
 * sync. The settings API supplies cross-renderer events; ExtensionStorageApi
 * supplies the extension-owned durable file used by the action transform.
 */
export async function installReactionSettingsSync(
  api: SettingsApi,
  settings: ReactionSettings,
): Promise<Disposable> {
  let disposed = false;
  let operations: Promise<void> = Promise.resolve();

  const setNativeValue = (value: string): Promise<void> =>
    api.set(SETTINGS_KEY, value, { scope: EXTENSION_SCOPE });

  const applyEventValue = async (
    value: SettingValue | undefined,
  ): Promise<void> => {
    if (value === undefined) {
      await settings.reset();
      return;
    }
    if (isReactionText(value)) {
      await settings.setText(value);
      return;
    }

    // The text control keeps incomplete edits as local drafts. Ignore an
    // invalid imperative value instead of replacing text while the user edits.
  };

  const schedule = (operation: () => Promise<void>): void => {
    const result = operations.then(async () => {
      if (!disposed) await operation();
    });
    operations = result.catch((error: unknown) => {
      console.error("[reactions] Settings synchronization failed", error);
    });
  };

  const initialValue = await api.get(SETTINGS_KEY, {
    scope: EXTENSION_SCOPE,
  });
  if (isReactionText(initialValue)) {
    await settings.setText(initialValue);
  } else {
    await setNativeValue(settings.text);
  }

  const unsubscribe = api.events(EXTENSION_SCOPE).subscribe((message) => {
    switch (message.type) {
      case "snapshot":
        schedule(() => applyEventValue(message.value.values[SETTINGS_KEY]));
        break;
      case "event":
        if (message.value.event.key === SETTINGS_KEY) {
          schedule(() => applyEventValue(message.value.event.value));
        }
        break;
      case "reset":
        schedule(async () => {
          const value = await api.get(SETTINGS_KEY, {
            scope: EXTENSION_SCOPE,
          });
          await applyEventValue(value);
        });
        break;
      case "closed":
        break;
    }
  });

  return Object.freeze({
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe();
    },
  });
}
