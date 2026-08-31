import type {
  ChatGPTXRendererExtension,
  Disposable,
  RendererExtensionContext,
} from "@chatgptx/api";
import { bindToLifetime, combineDisposables } from "./lifetime.js";
import { sharedReactionSettings } from "./reaction-settings.js";
import { installReactionActions } from "./reactions.js";
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
  active = bindToLifetime(
    context.lifetime,
    combineDisposables(
      synchronization,
      installReactionActions(context.api, settings),
    ),
  );
};

export const deactivate: ChatGPTXRendererExtension["deactivate"] = (): void => {
  active?.dispose();
  active = undefined;
};
