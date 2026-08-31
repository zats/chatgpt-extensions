import type {
  ChatGPTXRendererExtension,
  Disposable,
  RendererExtensionContext,
} from "@chatgptx/api";
import { activateExtensionManager } from "./manager.js";

let active: Disposable | undefined;

export const activate: ChatGPTXRendererExtension["activate"] = async (
  context: RendererExtensionContext,
): Promise<void> => {
  active?.dispose();
  active = undefined;
  active = await activateExtensionManager(context);
};

export const deactivate: ChatGPTXRendererExtension["deactivate"] = (): void => {
  active?.dispose();
  active = undefined;
};
