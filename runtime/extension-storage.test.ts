import assert from "node:assert/strict";
import test from "node:test";

import { createExtensionStorage } from "./extension-storage.ts";

test("storage scopes every runtime request to its extension", async () => {
  const previous = globalThis.__CGPTX_RUNTIME__;
  const requests: Array<{
    readonly method: string;
    readonly parameters: Record<string, unknown>;
  }> = [];
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      requests.push({ method, parameters });
      if (method === "extension-storage.list") return ["one.txt"];
      if (method === "extension-storage.read-text") return "value";
      return null;
    },
  };

  try {
    const storage = createExtensionStorage("example");
    assert.deepEqual(await storage.listFiles(), ["one.txt"]);
    assert.equal(await storage.readTextFile("one.txt"), "value");
    await storage.writeTextFile("two.txt", "next");
    await storage.deleteFile("one.txt");
    assert.deepEqual(requests, [
      {
        method: "extension-storage.list",
        parameters: { extensionId: "example" },
      },
      {
        method: "extension-storage.read-text",
        parameters: { extensionId: "example", path: "one.txt" },
      },
      {
        method: "extension-storage.write-text",
        parameters: {
          extensionId: "example",
          path: "two.txt",
          contents: "next",
        },
      },
      {
        method: "extension-storage.delete",
        parameters: { extensionId: "example", path: "one.txt" },
      },
    ]);
  } finally {
    globalThis.__CGPTX_RUNTIME__ = previous;
  }
});

test("storage rejects invalid extension identities", () => {
  assert.throws(() => createExtensionStorage("../escape"), /Invalid extension id/);
});

test("storage does not dispatch a pre-aborted request", async () => {
  const previous = globalThis.__CGPTX_RUNTIME__;
  let requests = 0;
  globalThis.__CGPTX_RUNTIME__ = {
    async request() {
      requests += 1;
      return [];
    },
  };

  try {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      createExtensionStorage("example").listFiles({
        signal: controller.signal,
      }),
      (error: unknown) => error === controller.signal.reason,
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.__CGPTX_RUNTIME__ = previous;
  }
});

test("storage rejects when a request aborts before its response", async () => {
  const previous = globalThis.__CGPTX_RUNTIME__;
  let resolveResponse!: (value: unknown) => void;
  let markRequestStarted!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  globalThis.__CGPTX_RUNTIME__ = {
    request() {
      markRequestStarted();
      return new Promise<unknown>((resolve) => {
        resolveResponse = resolve;
      });
    },
  };

  try {
    const controller = new AbortController();
    const read = createExtensionStorage("example").readTextFile("one.txt", {
      signal: controller.signal,
    });
    await requestStarted;
    controller.abort();
    resolveResponse("value");

    await assert.rejects(
      read,
      (error: unknown) => error === controller.signal.reason,
    );
  } finally {
    globalThis.__CGPTX_RUNTIME__ = previous;
  }
});
