import type { ChatGPTXRendererExtension } from "@chatgptx/api";

import { activateNativeRendererProbe } from "./native-renderer-probe.js";

export const activate: ChatGPTXRendererExtension["activate"] = async (
  context,
): Promise<void> => {
  await activateNativeRendererProbe(context);
};
