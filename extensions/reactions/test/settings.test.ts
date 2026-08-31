import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ChatGPTXApi,
  CommandDefinition,
  RendererExtensionContext,
} from "@chatgptx/api";
import {
  DEFAULT_REACTION_TEXT,
  SETTINGS_KEY,
} from "../src/constants.js";
import {
  activate,
  deactivate,
} from "../src/settings.js";
import {
  createMemorySettings,
  createMemoryStorage,
} from "./fixtures.js";

test("Reset stays active at the default so it can clear an invalid native draft", async () => {
  deactivate?.();
  const storage = createMemoryStorage();
  const nativeSettings = createMemorySettings({
    [SETTINGS_KEY]: DEFAULT_REACTION_TEXT,
  });
  const lifetime = new AbortController();
  let resetCommand: CommandDefinition | undefined;

  const api = {
    settings: nativeSettings.api,
    contributions: {
      register(kind: string, definition: unknown) {
        if (kind === "command") {
          resetCommand = definition as CommandDefinition;
        }
        return { dispose() {} };
      },
    },
  } as unknown as ChatGPTXApi;
  const context = {
    api,
    storage: storage.api,
    lifetime: lifetime.signal,
  } as unknown as RendererExtensionContext;

  try {
    await activate(context);
    assert.ok(resetCommand);
    assert.equal(resetCommand.isEnabled, undefined);

    // An invalid text edit remains only in the native control's draft. The
    // persisted setting is still the default, so Reset must remain callable.
    await resetCommand.handler({});
    assert.equal(nativeSettings.read(SETTINGS_KEY), undefined);
    assert.equal(storage.read(), undefined);
  } finally {
    lifetime.abort();
    deactivate?.();
  }
});
