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
  APP_INITIAL_MODULE: "./assets/app-initial-DJrCTPoN.js",
  PLUS_ICON_MODULE: "./assets/plus-BgCJgEEs-DVFkddeF.js",
  PALETTE_ICON_MODULE: "./assets/palette-lzFbWMQk-BQiJ2H2n.js",
  THREAD_MENU_MODULE: "./assets/thread-overflow-menu-DrZEc2Ru.js",
  AUTH_MODULE: "./assets/chatgpt-desktop-auth-url-C9T__Nvw.js",
  SETTINGS_VISIBILITY_MODULE:
    "./assets/use-visible-settings-sections-s-VlMB6g.js",
  SETTINGS_LOADING_MODULE: "./assets/settings-loading-row-Cig0SJI7.js",
  TOOLBAR_BREADCRUMB_MODULE: "./assets/toolbar-breadcrumb-DGLz3tdB.js",
});

const patchedModules = Object.freeze({
  HOME_SUGGESTION_SURFACE_MODULE:
    "./assets/home-suggestion-surface-DYzWjNWQ.js",
  HOME_AMBIENT_SUGGESTIONS_MODULE:
    "./assets/home-ambient-suggestions-content-BsHgi12z.js",
  HOME_TASK_SUGGESTIONS_MODULE:
    "./assets/home-task-suggestions-BS_HlNsl.js",
  HOME_ANNOUNCEMENTS_MODULE:
    "./assets/codex-home-announcements-BEqpJiFL.js",
  HOME_BANNER_MODULE: "./assets/banner-rS_k_4OE.js",
  COMPOSER_UTILITY_BAR_MODULE:
    "./assets/composer-utility-bar-DIkeCMt4.js",
  CHATGPT_MARKDOWN_VIEW_MODULE:
    "./assets/chatgpt-markdown-view-Be5HLyGH.js",
  CONVERSATION_BLOCKS_MODULE:
    "./assets/conversation-blocks-CaWT0vxQ.js",
  CLOUD_CONVERSATION_VIEWER_MODULE: "./assets/viewer-BPgEYBcW.js",
});

const researchAssets = Object.freeze({
  "webview/assets/home-suggestion-surface-DYzWjNWQ.js":
    "fa612a39418909fc479e40485398d0cca8d4bd20c55f977369db10558a45344e",
  "webview/assets/home-ambient-suggestions-content-BsHgi12z.js":
    "7498b52e8ecba4f5ce8d65a5b332196bb1da52b0fc44b1951fef072d4cded132",
  "webview/assets/codex-home-announcements-BEqpJiFL.js":
    "41e68ffaf074e30dfde28806e69d775b305370068e427352e3dd9a5516abd04e",
  "webview/assets/banner-rS_k_4OE.js":
    "5f93e86790a4f7b0b59f7d8acac72baef2722f739579b30e9be7fc0660dbbe28",
  "webview/assets/composer-utility-bar-DIkeCMt4.js":
    "4184a7ffd2048c4359ae9930e63937ca9fc971cc602c62f0d137be7e1f5667b3",
  "webview/assets/plus-BgCJgEEs-DVFkddeF.js":
    "78b315e8b02f83e19af6d411f0f8b9b7a3dcfff2c5d0398f39f55be1ba7eb1db",
  "webview/assets/palette-lzFbWMQk-BQiJ2H2n.js":
    "2090c4ed089ede909069a933193da40e052c5aec27ec1dba80e9cf2747c5a8c0",
  "webview/assets/thread-overflow-menu-DrZEc2Ru.js":
    "26c76443a84a97d20db0ae08300b67d34c89b15622adc9f86082a3acda32389c",
  "webview/assets/chatgpt-desktop-auth-url-C9T__Nvw.js":
    "36850acbdd9034578aa057c95d7b092be584fd25ea99894d339968e9aafaf0ae",
  "webview/assets/use-visible-settings-sections-s-VlMB6g.js":
    "d2214252c23ad2f19b8cffccb2480bae496e48057fd853ac18f1d0ed2605b54b",
  "webview/assets/settings-loading-row-Cig0SJI7.js":
    "caae890fb5975b8021992b097896f2930086532c204ebb86791f9a8fd1b2bcee",
  "webview/assets/toolbar-breadcrumb-DGLz3tdB.js":
    "624123bba67dd28780b52f43450e0d30f3a58e3616773583eaed98a4ff42cec8",
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
    "homeSuggestionSurfaceModule.n();",
    "homeAnnouncementsModule.r();",
    "homeBannerModule.n();",
    "chatgptMarkdownModule.n();",
    "conversationBlocksModule.p();",
    "cloudConversationViewerModule.i();",
  ]) {
    assert.equal(patch.split(call).length - 1, 1, call);
  }
  for (const mapping of [
    "HomeSuggestionSurface: homeSuggestionSurfaceModule.t",
    "HomeTaskSuggestions: homeTaskSuggestionsModule.HomeTaskSuggestions",
    "StreamingMarkdown: appInitialModule.rC",
    "ChatGptMarkdownView: chatgptMarkdownModule.t",
    "LocalConversationItem: conversationBlocksModule.f",
    "CloudConversationTurn: cloudConversationViewerModule.r",
    "useScopeValue: appInitialModule.JUt",
    "threadHostIdByConversation: appInitialModule.j2",
    "accountState: appInitialModule.uwt",
  ]) {
    assert.ok(patch.includes(mapping), mapping);
  }
  assert.equal(
    patch.includes("useScopeValue: appInitialModule.KUt"),
    false,
    "KUt is the target app's iCt initializer, not the scope-value hook",
  );
  assert.equal(
    patch.includes("cloudConversationViewerModule.n();"),
    false,
    "n initializes the paragen viewer group, not the direct cloud-turn group",
  );
  assert.match(entry, /version: "26\.825\.32147"/);
  assert.match(entry, /activateExactBuildRendererExtension/);
  assert.match(entry, /deactivateExactBuildRendererExtension/);
});

test("pins the target native bootstrap contracts", async () => {
  const host = await readFile(new URL("host.js", bindingDirectory), "utf8");
  for (const contract of [
    "appInitialModule.BWt();",
    "messageBus: appInitialModule.VWt",
    "openInBrowser: appInitialModule.LWt",
  ]) {
    assert.equal(host.split(contract).length - 1, 1, contract);
  }
  for (const invalidContract of [
    "appInitialModule.RWt();",
    "appInitialModule.FWt();",
    "messageBus: appInitialModule.zWt",
    "openInBrowser: appInitialModule.PWt",
  ]) {
    assert.equal(host.includes(invalidContract), false, invalidContract);
  }
});

test("pins the exact rich-content identity and owner assets", () => {
  assert.equal(RICH_CONTENT_BINDING.appVersion, "26.825.32147");
  assert.equal(RICH_CONTENT_BINDING.appBuild, "7303");
  assert.equal(
    RICH_CONTENT_BINDING.appAsarSha256,
    "0462b03e878f0e78b223b849ee14cbba0de043f2c16acebee163cb95daa622ef",
  );
  assert.deepEqual(
    RICH_CONTENT_BINDING.assets.map(({ path }) => path),
    [
      "webview/assets/chatgpt-markdown-view-Be5HLyGH.js",
      "webview/assets/app-initial-DJrCTPoN.js",
      "webview/assets/conversation-blocks-CaWT0vxQ.js",
      "webview/assets/viewer-BPgEYBcW.js",
      "webview/assets/home-task-suggestions-BS_HlNsl.js",
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
  },
);
