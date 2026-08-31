import type {
  ChatGPTXRendererExtension,
  RendererExtensionContext,
} from "@chatgptx/api";
import {
  activateThreadColors,
  deactivateThreadColors,
} from "./thread-colors.js";

export const activate: ChatGPTXRendererExtension["activate"] = (
  context: RendererExtensionContext,
) => activateThreadColors(context);

export const deactivate: ChatGPTXRendererExtension["deactivate"] = () => {
  deactivateThreadColors();
};
