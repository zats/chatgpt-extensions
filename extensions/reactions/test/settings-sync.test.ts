import assert from "node:assert/strict";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import { describe, test } from "node:test";
import {
  DEFAULT_REACTION_TEXT,
  SETTINGS_KEY,
} from "../src/constants.js";
import { createReactionSettings } from "../src/reaction-settings.js";
import { installReactionSettingsSync } from "../src/settings-sync.js";
import {
  createMemorySettings,
  createMemoryStorage,
} from "./fixtures.js";

async function settleSettingsSync(): Promise<void> {
  await waitForImmediate();
  await waitForImmediate();
}

describe("reaction settings synchronization", () => {
  test("seeds the native control from extension storage", async () => {
    const storage = createMemoryStorage(JSON.stringify({ emojis: "🎉✅" }));
    const settings = createReactionSettings(storage.api);
    await settings.load();
    const nativeSettings = createMemorySettings();

    const synchronization = await installReactionSettingsSync(
      nativeSettings.api,
      settings,
    );

    assert.equal(nativeSettings.read(SETTINGS_KEY), "🎉✅");
    assert.equal(settings.text, "🎉✅");
    synchronization.dispose();
  });

  test("persists valid native changes and ignores invalid imperative values", async () => {
    const storage = createMemoryStorage();
    const settings = createReactionSettings(storage.api);
    await settings.load();
    const nativeSettings = createMemorySettings({ emojis: "🎉" });
    const synchronization = await installReactionSettingsSync(
      nativeSettings.api,
      settings,
    );

    await nativeSettings.set(SETTINGS_KEY, "🔥🚀");
    await settleSettingsSync();
    assert.equal(settings.text, "🔥🚀");
    assert.deepEqual(JSON.parse(storage.read() ?? "null"), {
      emojis: "🔥🚀",
    });

    await nativeSettings.set(SETTINGS_KEY, "not emoji");
    await settleSettingsSync();
    assert.equal(nativeSettings.read(SETTINGS_KEY), "not emoji");
    assert.equal(settings.text, "🔥🚀");

    await nativeSettings.delete(SETTINGS_KEY);
    await settleSettingsSync();
    assert.equal(settings.text, DEFAULT_REACTION_TEXT);
    assert.equal(storage.read(), undefined);
    synchronization.dispose();
  });
});
