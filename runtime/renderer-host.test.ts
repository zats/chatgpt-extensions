import assert from "node:assert/strict";
import test from "node:test";

import { createRendererHost, type RendererBindingAdapter } from "./renderer-host.ts";

const identity = Object.freeze({
  id: "renderer-host-test",
  version: "1.2.3",
  manifestDigest: "a".repeat(64),
});

function adapter(version: string, deactivations: string[] = []): RendererBindingAdapter {
  const value: RendererBindingAdapter = {
    version,
    activate(_hostApi, entryIdentity, module) {
      module.activate({ id: entryIdentity.id });
    },
    deactivate(extensionId, module) {
      module.deactivate?.();
      deactivations.push(extensionId);
    },
  };
  return Object.freeze(value);
}

test("renderer host factory registers renderer and settings entries", () => {
  const previous = globalThis.__CGPTX_HOST__;
  const calls: Array<{ id: string; phase: string; sectionId?: string }> = [];
  const entries: Array<{ activate(hostApi: unknown): void }> = [];
  globalThis.__CGPTX_HOST__ = {
    version: "26.825.51511",
    registerExtension(id, module) {
      calls.push({ id, phase: "renderer" });
      entries.push(module);
    },
    registerExtensionSettings(id, module, sectionId) {
      calls.push({ id, phase: "settings", sectionId });
      entries.push(module);
    },
  };
  const activations: string[] = [];
  const host = createRendererHost(adapter("26.825.51511"));
  const module = {
    activate(context: unknown) {
      activations.push((context as { id: string }).id);
    },
  };
  try {
    assert.equal(host.registerRendererEntry(identity, "renderer", module), true);
    assert.equal(
      host.registerRendererEntry(
        identity,
        "settings",
        module,
        "renderer-host-test.settings",
      ),
      true,
    );
    for (const entry of entries) entry.activate({});
    assert.deepEqual(calls, [
      { id: identity.id, phase: "renderer" },
      {
        id: identity.id,
        phase: "settings",
        sectionId: "renderer-host-test.settings",
      },
    ]);
    assert.deepEqual(activations, [identity.id, identity.id]);
    assert.deepEqual(host.registeredRendererEntries(), [
      "renderer-host-test:renderer",
      "renderer-host-test:settings",
    ]);
  } finally {
    globalThis.__CGPTX_HOST__ = previous;
  }
});

test("factories accept only their selected binding and keep separate state", () => {
  const previous = globalThis.__CGPTX_HOST__;
  const first = createRendererHost(adapter("26.825.51511"));
  const second = createRendererHost(adapter("26.900.1"));
  globalThis.__CGPTX_HOST__ = {
    version: "26.825.51511",
    registerExtension() {},
    registerExtensionSettings() {},
  };
  try {
    assert.equal(first.registerRendererEntry(identity, "renderer", { activate() {} }), true);
    assert.throws(
      () => second.registerRendererEntry(identity, "renderer", { activate() {} }),
      /26\.900\.1 binding host is unavailable/,
    );
    assert.deepEqual(first.registeredRendererEntries(), ["renderer-host-test:renderer"]);
    assert.deepEqual(second.registeredRendererEntries(), []);
  } finally {
    globalThis.__CGPTX_HOST__ = previous;
  }
});

test("renderer host deactivates registered bridge entries once in reverse order", () => {
  const previous = globalThis.__CGPTX_HOST__;
  const entries: Array<{ activate(hostApi: unknown): void; deactivate?(): void }> = [];
  const moduleDeactivations: string[] = [];
  const adapterDeactivations: string[] = [];
  globalThis.__CGPTX_HOST__ = {
    version: "26.825.51511",
    registerExtension(_id, module) {
      entries.push(module);
    },
    registerExtensionSettings() {},
  };
  const host = createRendererHost(adapter("26.825.51511", adapterDeactivations));
  try {
    for (const suffix of ["first", "second"]) {
      host.registerRendererEntry(
        { ...identity, id: `renderer-host-pagehide-${suffix}` },
        "renderer",
        {
          activate() {},
          deactivate() {
            moduleDeactivations.push(suffix);
          },
        },
      );
    }
    for (const entry of entries) entry.activate({});

    host.deactivateRendererEntries();
    host.deactivateRendererEntries();

    assert.deepEqual(moduleDeactivations, ["second", "first"]);
    assert.deepEqual(adapterDeactivations, [
      "renderer-host-pagehide-second",
      "renderer-host-pagehide-first",
    ]);
  } finally {
    globalThis.__CGPTX_HOST__ = previous;
  }
});
