import type {
  ChatGPTXRendererExtension,
  Disposable,
  RendererExtensionContext,
} from "@chatgptx/api";
import { bindToLifetime, combineDisposables } from "./lifetime.js";
import {
  RESET_COMMAND_ID,
  SETTINGS_KEY,
} from "./constants.js";
import { sharedReactionSettings } from "./reaction-settings.js";
import { createReactionSettingsSection } from "./settings-section.js";
import { installReactionSettingsSync } from "./settings-sync.js";

let active: Disposable | undefined;

export const activate: ChatGPTXRendererExtension["activate"] = async (
  context: RendererExtensionContext,
): Promise<void> => {
  active?.dispose();
  active = undefined;

  const settings = sharedReactionSettings(context.storage);
  try {
    await settings.load();
  } catch (error: unknown) {
    console.error("[reactions] Settings load failed", error);
  }

  if (context.lifetime.aborted) return;
  const synchronization = await installReactionSettingsSync(
    context.api.settings,
    settings,
  );
  if (context.lifetime.aborted) {
    synchronization.dispose();
    return;
  }

  const resetCommand = context.api.contributions.register("command", {
    id: RESET_COMMAND_ID,
    title: "Reset reactions",
    description: "Restore the default reaction emoji.",
    async handler() {
      await settings.reset();
      await context.api.settings.delete(SETTINGS_KEY, {
        scope: { kind: "extension" },
      });
    },
  });
  const registration = context.api.contributions.register(
    "settings-section",
    createReactionSettingsSection(),
  );
  active = bindToLifetime(
    context.lifetime,
    combineDisposables(synchronization, resetCommand, registration),
  );
};

export const deactivate: ChatGPTXRendererExtension["deactivate"] = (): void => {
  active?.dispose();
  active = undefined;
};
