import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = await readFile(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "download-chatgpt-version.sh"),
  "utf8",
);

test("download gate requires the exact OpenAI identity and Apple notarization", () => {
  assert.match(source, /BUNDLE_IDENTIFIER.*com\.openai\.codex/s);
  assert.match(source, /SIGNING_IDENTIFIER.*com\.openai\.codex/s);
  assert.match(source, /TEAM_IDENTIFIER.*2DC432GLL2/s);
  assert.match(source, /spctl --assess --type execute/);
  assert.match(source, /codesign --verify --deep --strict/);
});
