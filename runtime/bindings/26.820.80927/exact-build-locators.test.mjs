import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  RICH_CONTENT_BINDING,
  verifyRichContentAssetSource,
} from "./rich-content-binding-verifier.mjs";

const bindingDirectory = new URL("./", import.meta.url);

const runtimeModules = Object.freeze({
  APP_INITIAL_MODULE: "./assets/app-initial-CpK4W6kT.js",
  PLUS_ICON_MODULE: "./assets/plus-BgCJgEEs-DfzxPQNa.js",
  PALETTE_ICON_MODULE: "./assets/palette-lzFbWMQk-D-MoTDe_.js",
  THREAD_MENU_MODULE: "./assets/thread-overflow-menu-CNwvn1sZ.js",
  AUTH_MODULE: "./assets/chatgpt-desktop-auth-url-BcNqVSej.js",
  SETTINGS_VISIBILITY_MODULE:
    "./assets/use-visible-settings-sections-BmMdRqG0.js",
  SETTINGS_LOADING_MODULE: "./assets/settings-loading-row-DeWwhCfK.js",
  TOOLBAR_BREADCRUMB_MODULE: "./assets/toolbar-breadcrumb-D6g0pyfy.js",
});

const patchedModules = Object.freeze({
  COMPOSER_UTILITY_BAR_MODULE:
    "./assets/composer-utility-bar-BApXxy3L.js",
  CHATGPT_THREAD_VISIBILITY_MODULE:
    "./assets/chatgpt-thread-visibility-p3PeKx_R.js",
  LOCAL_CONVERSATION_ITEM_MODULE:
    "./assets/subagent-activity-chip-group-DZBSwHRQ.js",
  CHATGPT_CODE_BLOCK_MODULE: "./assets/chatgpt-code-block-C_pK8Bfv.js",
});

const researchAssets = Object.freeze({
  ".vite/build/main-Chzli0KN.js":
    "db89fc7fad3198c13dcefdc914d2beb9ffd194877bfe2fcd163022d9198725a4",
  "webview/assets/composer-utility-bar-BApXxy3L.js":
    "5374c42903d688dd5f8fd7d0b2f515059036e5c3359f41008e59fa47bb79d7b4",
  "webview/assets/plus-BgCJgEEs-DfzxPQNa.js":
    "a850400152063478e9205ca7e45192e2efce940659289b691a4ca720e7950004",
  "webview/assets/palette-lzFbWMQk-D-MoTDe_.js":
    "36587f5fdddb499106ece609a317f30262194c3ef278738f7f7715637275dc08",
  "webview/assets/thread-overflow-menu-CNwvn1sZ.js":
    "f514d3aea30429512f8820294b07dba54914d9992ad43f40b7c6db31eb2a1dd4",
  "webview/assets/chatgpt-desktop-auth-url-BcNqVSej.js":
    "f928ecf76c015c107b3bbb118a24a1e1f56ad24eb04806ea2d5d13f813995158",
  "webview/assets/use-visible-settings-sections-BmMdRqG0.js":
    "34badf141109d78ef9a166a5f4ac0ed14a6df51edc23f6e4ef8e7e0741da6e2f",
  "webview/assets/settings-loading-row-DeWwhCfK.js":
    "89259b5c836e210a90736a89a33521ec3d2e6537cc1c69511a7bba41757ae356",
  "webview/assets/toolbar-breadcrumb-D6g0pyfy.js":
    "15b77c28026677d4e20be30abe29425042b6de65221dea0f59398be00ffe9d4a",
});

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("pins every direct target-build module locator", async () => {
  const host = await readFile(new URL("host.js", bindingDirectory), "utf8");
  const patch = await readFile(
    new URL("host-source-patch.cjs", bindingDirectory),
    "utf8",
  );
  for (const [name, modulePath] of Object.entries(runtimeModules)) {
    assert.match(host, new RegExp(`${name}\\s*=\\s*${escaped(JSON.stringify(modulePath))}`));
  }
  for (const modulePath of Object.values(patchedModules)) {
    assert.equal(patch.split(modulePath).length - 1, 1, modulePath);
  }
  assert.doesNotMatch(host + patch, /B6Gk5KCN|C8qpsv81|CPTOpaBq|Q19uoBql/);
});

test("pins mapped initializers, exports, and activation phase", async () => {
  const patch = await readFile(
    new URL("host-source-patch.cjs", bindingDirectory),
    "utf8",
  );
  const entry = await readFile(
    new URL("renderer-entry.ts", bindingDirectory),
    "utf8",
  );
  for (const call of [
    "appInitialModule.Eut();",
    "appInitialModule.Rwt();",
    "appInitialModule.iY();",
    "appInitialModule.CT();",
    "chatgptThreadVisibilityModule.E();",
    "chatgptThreadVisibilityModule.c();",
    "localConversationItemModule.C();",
  ]) {
    assert.equal(patch.split(call).length - 1, 1, call);
  }
  for (const mapping of [
    "StreamingMarkdown: appInitialModule.aY",
    "contentReferenceDirectiveName: appInitialModule.Hot",
    "TurnContext: appInitialModule.HQ",
    "useCurrentTurnContext: appInitialModule.WQ",
    "ReactDOMPortal: appInitialModule.qzt()",
    "contentReferenceIndex: chatgptThreadVisibilityModule.w",
    "ChatGptCodeBlock: chatgptCodeBlockModule.ChatGptCodeBlock",
    "LocalConversationItem: localConversationItemModule.S",
    "CloudConversationTurn: chatgptThreadVisibilityModule.s",
    "useScopeValue: appInitialModule.GGt",
    "threadHostIdByConversation: appInitialModule.tdt",
    "accountState: appInitialModule.Iwt",
  ]) {
    assert.ok(patch.includes(mapping), mapping);
  }
  assert.equal(
    patch.includes("useScopeValue: appInitialModule.HGt"),
    false,
    "HGt is the full scope-object hook, not the scope-value hook",
  );
  assert.equal(
    patch.includes("chatgptThreadVisibilityModule.i();"),
    false,
    "i initializes the outer viewer group, not the direct cloud-turn group",
  );
  assert.match(entry, /version: "26\.820\.80927"/);
  assert.match(entry, /activateExactBuildRendererExtension/);
  assert.match(entry, /deactivateExactBuildRendererExtension/);
});

test("pins the target native bootstrap contracts", async () => {
  const host = await readFile(new URL("host.js", bindingDirectory), "utf8");
  for (const contract of [
    "appInitialModule.yFt();",
    "messageBus: appInitialModule.bFt",
    "openInBrowser: appInitialModule.Zpt",
  ]) {
    assert.equal(host.split(contract).length - 1, 1, contract);
  }
  for (const invalidContract of [
    "appInitialModule.BWt();",
    "appInitialModule.zWt();",
    "messageBus: appInitialModule.VWt",
    "openInBrowser: appInitialModule.LWt",
  ]) {
    assert.equal(host.includes(invalidContract), false, invalidContract);
  }
});

test("pins the exact rich-content identity and owner assets", () => {
  assert.equal(RICH_CONTENT_BINDING.appVersion, "26.820.80927");
  assert.equal(RICH_CONTENT_BINDING.appBuild, "7271");
  assert.equal(
    RICH_CONTENT_BINDING.appAsarSha256,
    "60f9dcc03f50e7b66883c43e34e86e34d3dcf2650dcdf2b80bc79db116ee93cf",
  );
  assert.deepEqual(
    RICH_CONTENT_BINDING.assets.map(({ path }) => path),
    [
      "webview/assets/app-initial-CpK4W6kT.js",
      "webview/assets/chatgpt-thread-visibility-p3PeKx_R.js",
      "webview/assets/subagent-activity-chip-group-DZBSwHRQ.js",
      "webview/assets/chatgpt-code-block-C_pK8Bfv.js",
    ],
  );
});

const researchTree = process.env.CHATGPT_APP_RESEARCH_TREE;
test(
  "the supplied research tree matches every pinned module and semantic owner",
  { skip: researchTree === undefined },
  async () => {
    for (const asset of RICH_CONTENT_BINDING.assets) {
      verifyRichContentAssetSource(
        asset,
        await readFile(join(researchTree, asset.path)),
      );
    }
    for (const [relativePath, expected] of Object.entries(researchAssets)) {
      const bytes = await readFile(join(researchTree, relativePath));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
    }
    const main = await readFile(
      join(researchTree, ".vite/build/main-Chzli0KN.js"),
      "utf8",
    );
    assert.ok(
      main.includes(
        "scrollBounce:process.platform===`darwin`&&o===`primary`",
      ),
      "ChatGPT primary window appearance discriminator",
    );
  },
);
