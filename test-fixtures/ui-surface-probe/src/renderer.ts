import type {
  ChatGPTXRendererExtension,
  Disposable,
} from "@chatgptx/api";
import { activateUiSurfaceProbe } from "./ui-surface-probe.js";

let active: Disposable | undefined;

export const activate: ChatGPTXRendererExtension["activate"] = async (
  context,
): Promise<void> => {
  active?.dispose();
  active = await activateUiSurfaceProbe(context);
};

export const deactivate: ChatGPTXRendererExtension["deactivate"] = (): void => {
  active?.dispose();
  active = undefined;
};
