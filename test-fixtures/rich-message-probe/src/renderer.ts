import type {
  ChatGPTXRendererExtension,
  Disposable,
} from "@chatgptx/api";
import {
  activateRichMessageProbe,
  richProbeEventFile,
} from "./rich-message-probe.js";

let active: Disposable | undefined;

export const activate: ChatGPTXRendererExtension["activate"] = async (
  context,
): Promise<void> => {
  active?.dispose();
  active = await activateRichMessageProbe(
    context,
    richProbeEventFile(context.document.id),
  );
};

export const deactivate: ChatGPTXRendererExtension["deactivate"] = (): void => {
  active?.dispose();
  active = undefined;
};
