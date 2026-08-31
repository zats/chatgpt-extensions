import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { createReactionSettingsSection } from "../src/settings-section.js";

describe("reactions settings entry", () => {
  test("declares the manifest settings renderer and matching section", async () => {
    const packageContents = await readFile(
      new URL("../package.json", import.meta.url),
      "utf8",
    );
    const manifest = JSON.parse(packageContents) as {
      name?: string;
      chatgptx: {
        renderer?: string;
        settings?: { renderer: string; sectionId: string };
        capabilities?: readonly string[];
      };
    };
    assert.equal(manifest.name, "@chatgptx/extension-reactions");
    assert.equal(manifest.chatgptx.renderer, "dist/renderer.cjs");
    assert.deepEqual(manifest.chatgptx.settings, {
      renderer: "dist/settings.cjs",
      sectionId: "settings",
    });
    assert.ok(
      manifest.chatgptx.capabilities?.includes(
        "ui.point.assistant-selection.actions",
      ),
    );
    assert.ok(
      manifest.chatgptx.capabilities?.includes(
        "ui.definition.command",
      ),
    );
    assert.ok(
      manifest.chatgptx.capabilities?.includes(
        "ui.definition.settings-section",
      ),
    );

    const definition = createReactionSettingsSection();
    assert.equal(definition.id, "settings");
    assert.equal(definition.title, "Reactions");
    assert.equal(definition.group, "integrations");
    assert.equal(definition.content, "controls");
    const [emojiControl, resetControl] = definition.controls;
    assert.ok(emojiControl?.type === "text");
    assert.deepEqual(
      { ...emojiControl, validate: undefined },
      {
        id: "emojis",
        type: "text",
        title: "Emojis",
        description: "Enter one or more emoji.",
        settingKey: "emojis",
        placeholder: "👍👎🤔🤬",
        defaultValue: "👍👎🤔🤬",
        validate: undefined,
      },
    );
    assert.equal(emojiControl.validate?.(""), "Enter emoji only.");
    assert.equal(emojiControl.validate?.("👍text"), "Enter emoji only.");
    assert.equal(emojiControl.validate?.("🔥🚀"), undefined);
    assert.deepEqual(resetControl, {
        id: "reset",
        type: "button",
        title: "Reset",
        description: "Restore the default reactions.",
        commandId: "reset",
    });
    assert.ok(definition.searchEntries?.[0]?.keywords?.includes("emoji"));
  });
});
