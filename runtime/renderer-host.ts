interface RendererModule {
  activate(context: unknown): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface RendererEntryIdentity {
  readonly id: string;
  readonly version: string;
  readonly manifestDigest: string;
}

export type RendererEntryPhase = "renderer" | "settings";

interface ExactBuildHost {
  readonly version: string;
  registerExtension(id: string, module: RendererModule): void;
  registerExtensionSettings(
    id: string,
    module: RendererModule,
    sectionId: string,
  ): void;
}

export interface RendererBindingAdapter {
  readonly version: string;
  activate(
    hostApi: unknown,
    identity: RendererEntryIdentity,
    module: RendererModule,
    phase: RendererEntryPhase,
  ): void;
  deactivate(
    extensionId: string,
    module: RendererModule,
    phase: RendererEntryPhase,
  ): void;
}

export interface RendererHost {
  registerRendererEntry(
    identity: RendererEntryIdentity,
    phase: RendererEntryPhase,
    module: RendererModule,
    settingsSectionId?: string,
  ): true;
  registeredRendererEntries(): readonly string[];
  deactivateRendererEntries(): void;
}

declare global {
  var __CGPTX_HOST__: ExactBuildHost | undefined;
  var __CHATGPTX_V5_RENDERER_HOST__: RendererHost | undefined;
}

const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/;
const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const appVersionPattern = /^\d+(?:\.\d+)+$/;
const digestPattern = /^[a-f0-9]{64}$/;

function validateIdentity(value: RendererEntryIdentity): void {
  if (!value || typeof value !== "object") {
    throw new TypeError("A renderer extension identity is required");
  }
  if (!extensionIdPattern.test(value.id)) {
    throw new TypeError("Invalid renderer extension id");
  }
  if (!semanticVersionPattern.test(value.version)) {
    throw new TypeError("Invalid renderer extension version");
  }
  if (!digestPattern.test(value.manifestDigest)) {
    throw new TypeError("Invalid renderer extension manifest digest");
  }
}

function validateModule(value: RendererModule): void {
  if (!value || typeof value !== "object" || typeof value.activate !== "function") {
    throw new TypeError("The renderer bundle must export activate");
  }
  if (value.deactivate !== undefined && typeof value.deactivate !== "function") {
    throw new TypeError("The renderer bundle deactivate export must be a function");
  }
}

function validateAdapter(adapter: RendererBindingAdapter): void {
  if (
    !adapter ||
    typeof adapter !== "object" ||
    !appVersionPattern.test(adapter.version) ||
    typeof adapter.activate !== "function" ||
    typeof adapter.deactivate !== "function"
  ) {
    throw new TypeError("A valid renderer binding adapter is required");
  }
}

export function createRendererHost(adapter: RendererBindingAdapter): RendererHost {
  validateAdapter(adapter);
  const registered = new Map<string, RendererModule>();
  let deactivated = false;

  function bridge(
    identity: RendererEntryIdentity,
    module: RendererModule,
    phase: RendererEntryPhase,
  ): RendererModule {
    return Object.freeze({
      activate(hostApi: unknown) {
        adapter.activate(hostApi, identity, module, phase);
      },
      deactivate() {
        adapter.deactivate(identity.id, module, phase);
      },
    });
  }

  function registerRendererEntry(
    identity: RendererEntryIdentity,
    phase: RendererEntryPhase,
    module: RendererModule,
    settingsSectionId?: string,
  ): true {
    validateIdentity(identity);
    validateModule(module);
    if (phase !== "renderer" && phase !== "settings") {
      throw new TypeError("Invalid renderer extension phase");
    }
    const exactHost = globalThis.__CGPTX_HOST__;
    if (!exactHost || exactHost.version !== adapter.version) {
      throw new Error(`The ChatGPT ${adapter.version} binding host is unavailable`);
    }
    const key = `${identity.id}:${phase}`;
    if (deactivated) {
      throw new Error("The renderer document is inactive");
    }
    if (registered.has(key)) return true;

    const entry = bridge(identity, module, phase);
    if (phase === "settings") {
      if (
        typeof settingsSectionId !== "string" ||
        !settingsSectionId.startsWith(`${identity.id}.`) ||
        settingsSectionId.length <= identity.id.length + 1
      ) {
        throw new TypeError("Invalid renderer extension settings section id");
      }
      exactHost.registerExtensionSettings(identity.id, entry, settingsSectionId);
    } else {
      if (settingsSectionId !== undefined) {
        throw new TypeError("A renderer entry cannot declare a settings section id");
      }
      exactHost.registerExtension(identity.id, entry);
    }
    registered.set(key, entry);
    return true;
  }

  function registeredRendererEntries(): readonly string[] {
    return Object.freeze([...registered.keys()].sort());
  }

  function deactivateRendererEntries(): void {
    if (deactivated) return;
    deactivated = true;
    for (const entry of [...registered.values()].reverse()) {
      try {
        entry.deactivate?.();
      } catch (error) {
        console.error("Renderer entry deactivation failed", error);
      }
    }
  }

  const host = Object.freeze({
    registerRendererEntry,
    registeredRendererEntries,
    deactivateRendererEntries,
  });
  globalThis.addEventListener?.("pagehide", deactivateRendererEntries, {
    once: true,
  });
  return host;
}
