import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { RICH_CONTENT_BINDING } from "./rich-content-binding-verifier.mjs";

const bindingDirectory = new URL("./", import.meta.url);

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1;
}

test("maps the exact first-party Remote Codex task row", async () => {
  const patch = await readFile(
    new URL("host-source-patch.cjs", bindingDirectory),
    "utf8",
  );
  for (const mapping of [
    "RemoteSidebarThreadRow: appInitialModule.Fc",
    "RemoteSidebarThreadBoundary",
    "threadContextForRemoteSidebarProps",
    "data-cgptx-settings-page-owner",
  ]) {
    assert.ok(patch.includes(mapping), mapping);
  }
});

const researchTree = process.env.CHATGPT_APP_RESEARCH_TREE;
test(
  "pins the Remote Codex task owner in ChatGPT 26.825.51511",
  { skip: researchTree ? false : "CHATGPT_APP_RESEARCH_TREE is not set" },
  async () => {
    const asset = RICH_CONTENT_BINDING.assets.find(
      ({ path }) => path.endsWith("/app-initial-B6Gk5KCN.js"),
    );
    assert.ok(asset);
    const source = await readFile(join(researchTree, asset.path), "utf8");
    for (const locator of [
      "function URc(e){let t=(0,GRc.c)(80),{task:n,titlePrefix:r,titleSuffix:i,secondaryContent:a",
      "transformContextMenuItems:F,variant:I,onArchiveStart:L,onArchiveSuccess:R,onArchiveError:z,dataAttributes:B}=e",
      "task:e.task",
      "URc as Fc",
    ]) {
      assert.equal(occurrenceCount(source, locator), 1, locator);
    }
  },
);
