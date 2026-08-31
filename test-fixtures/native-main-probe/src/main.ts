import type { ChatGPTXMainExtension } from "@chatgptx/api/native";

import { activateNativeMainProbe } from "./native-main-probe.js";

const directElectron = require("electron/main") as typeof import("electron/main");

export const activate: ChatGPTXMainExtension["activate"] = async (
  context,
): Promise<void> => {
  await activateNativeMainProbe(context, directElectron);
};
