import type { ExtensionStorageApi, RequestOptions } from "@chatgptx/api";

interface CurrentRuntimeBridge {
  readonly document?: {
    readonly id: string;
    readonly windowId: string;
    readonly webContentsId: number;
    readonly url: string;
  } | null;
  request(method: string, parameters: Record<string, unknown>): Promise<unknown>;
  subscribe?(
    extensionId: string,
    event: string,
    listener: (payload: unknown) => void,
  ): () => void;
}

declare global {
  var __CGPTX_RUNTIME__: CurrentRuntimeBridge | undefined;
}

function bridge(): CurrentRuntimeBridge {
  const runtime = globalThis.__CGPTX_RUNTIME__;
  if (!runtime || typeof runtime.request !== "function") {
    throw new Error("ChatGPTX runtime is unavailable");
  }
  return runtime;
}

export function createExtensionStorage(extensionId: string): ExtensionStorageApi {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(extensionId)) {
    throw new TypeError("Invalid extension id");
  }

  const request = async (
    method: string,
    parameters: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<unknown> => {
    options?.signal?.throwIfAborted();
    const result = await bridge().request(method, { extensionId, ...parameters });
    options?.signal?.throwIfAborted();
    return result;
  };

  return Object.freeze({
    async listFiles(options?: RequestOptions) {
      const result = await request("extension-storage.list", {}, options);
      if (
        !Array.isArray(result) ||
        !result.every((entry) => typeof entry === "string")
      ) {
        throw new TypeError("Invalid extension storage listing");
      }
      return Object.freeze([...result]);
    },

    async readTextFile(file: string, options?: RequestOptions) {
      const result = await request(
        "extension-storage.read-text",
        { path: file },
        options,
      );
      if (result === null) return undefined;
      if (typeof result !== "string") {
        throw new TypeError("Invalid extension storage contents");
      }
      return result;
    },

    async writeTextFile(
      file: string,
      contents: string,
      options?: RequestOptions,
    ) {
      await request(
        "extension-storage.write-text",
        {
          path: file,
          contents,
        },
        options,
      );
    },

    async deleteFile(file: string, options?: RequestOptions) {
      await request("extension-storage.delete", { path: file }, options);
    },
  });
}
