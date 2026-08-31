import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_REACTION_TEXT } from "../src/constants.js";
import {
  createReactionSettings,
  parseReactionText,
} from "../src/reaction-settings.js";
import { createMemoryStorage } from "./fixtures.js";

describe("reaction settings", () => {
  test("accepts complete RGI emoji sequences and rejects other text", () => {
    assert.deepEqual(parseReactionText(DEFAULT_REACTION_TEXT), [
      "👍",
      "👎",
      "🤔",
      "🤬",
    ]);
    assert.deepEqual(parseReactionText("👨‍👩‍👧‍👦🇺🇸👍🏽❤️"), [
      "👨‍👩‍👧‍👦",
      "🇺🇸",
      "👍🏽",
      "❤️",
    ]);
    assert.equal(parseReactionText(""), undefined);
    assert.equal(parseReactionText("👍 text"), undefined);
  });

  test("loads, persists, serializes, and resets extension-scoped storage", async () => {
    const memory = createMemoryStorage(JSON.stringify({ emojis: "🎉✅" }));
    const settings = createReactionSettings(memory.api);
    const changes: string[] = [];
    const subscription = settings.subscribe((text) => changes.push(text));

    await settings.load();
    assert.equal(settings.text, "🎉✅");
    assert.deepEqual(settings.emojis, ["🎉", "✅"]);

    await Promise.all([settings.setText("🔥"), settings.setText("🔥🚀")]);
    assert.deepEqual(JSON.parse(memory.read() ?? "null"), { emojis: "🔥🚀" });
    await assert.rejects(settings.setText("not emoji"), /RGI emoji/);

    await settings.reset();
    assert.equal(settings.text, DEFAULT_REACTION_TEXT);
    assert.equal(memory.read(), undefined);
    assert.deepEqual(changes, ["🎉✅", "🔥", "🔥🚀", DEFAULT_REACTION_TEXT]);
    assert.equal(memory.writes.length, 2);
    assert.deepEqual(memory.deletes, ["settings.json"]);
    subscription.dispose();
  });

  test("rejects a malformed stored settings file", async () => {
    const memory = createMemoryStorage(JSON.stringify({ emojis: "plain text" }));
    const settings = createReactionSettings(memory.api);
    await assert.rejects(settings.load(), /RGI emoji/);
    assert.equal(settings.text, DEFAULT_REACTION_TEXT);
  });
});
