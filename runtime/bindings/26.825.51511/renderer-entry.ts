import { createRendererHost } from "../../renderer-host.ts";
import {
  activateExactBuildRendererExtension,
  deactivateExactBuildRendererExtension,
} from "./renderer-adapter.ts";

globalThis.__CHATGPTX_V5_RENDERER_HOST__ = createRendererHost({
  version: "26.825.51511",
  activate: activateExactBuildRendererExtension,
  deactivate: deactivateExactBuildRendererExtension,
});
