import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
} from "node:fs";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

export const RICH_CONTENT_BINDING = Object.freeze({
  appVersion: "26.820.80927",
  appBuild: "7271",
  appAsarSha256:
    "60f9dcc03f50e7b66883c43e34e86e34d3dcf2650dcdf2b80bc79db116ee93cf",
  assets: Object.freeze([
    Object.freeze({
      id: "app-rich-content-owners",
      path: "webview/assets/app-initial-CpK4W6kT.js",
      sha256:
        "9e85f5705a7640f90281a3e31daa63ef849d97675ad53a99d72c1a2b6ef14634",
      anchors: Object.freeze([
        Object.freeze({
          label: "generic Markdown directive dispatcher",
          needle:
            "function Sda(e,t,n,r){let i=n.directives?.[e.name]",
        }),
        Object.freeze({
          label: "StreamingMarkdown owner",
          needle: "function $ba(e){let t=(0,nxa.c)(5)",
        }),
        Object.freeze({
          label: "full StreamingMarkdown initializer",
          needle: "oxa=n((()=>{dba(),axa()}))",
        }),
        Object.freeze({
          label: "account-state atom shape",
          needle:
            "$b=Ha(Q,{accountId:null,accountLoading:!0,accountStructure:null,authLoading:!0,authMethod:null,authenticatedAccountId:null,hasChatGptToken:void 0,plan:null,requiresAuth:!0,supportedSurface:!1,userId:null}",
        }),
        Object.freeze({
          label: "scope-value hook",
          needle: "function ss(e,t,n){let r=(0,cs.c)(7)",
        }),
        Object.freeze({
          label: "conversation host selector",
          needle:
            "Rk=$a(Q,(e,{get:t})=>$Er(t,e)??t(Lk,e)?.getHostId()??t(Ik))",
        }),
        Object.freeze({
          label: "fenced-code lazy module",
          needle:
            "yoa=(0,_oa.lazy)(async()=>{let{ChatGptCodeBlock:e}=await",
        }),
        Object.freeze({
          label: "default AppShell main surface",
          needle: '"data-app-shell-main-surface":`default`',
        }),
      ]),
    }),
    Object.freeze({
      id: "cloud-conversation-and-content-reference-owners",
      path: "webview/assets/chatgpt-thread-visibility-p3PeKx_R.js",
      sha256:
        "1936ea1d8793f1eac48f4f757737c2ebc156aa982ff16cec02ad95ee2ceff1bf",
      anchors: Object.freeze([
        Object.freeze({
          label: "content-reference index parser",
          needle:
            "function zd(e){let t=Hd.safeParse(e);return t.success?t.data.index:null}",
        }),
        Object.freeze({
          label: "content-reference dispatcher props",
          needle:
            "function CS(e){let t=(0,wS.c)(56),{contentReferenceIndex:n,contentReferenceType:r,isTerminalInline:i,reference:a,turnContext:o}=e",
        }),
        Object.freeze({
          label: "content-reference message identity",
          needle: "i.contentReferenceMessageIds?.[n]??i.messageId",
        }),
        Object.freeze({
          label: "title-citation first-party branch",
          needle: "case`title_citation`:{",
        }),
        Object.freeze({
          label: "cloud conversation-turn owner",
          needle:
            "function aE(e){let t=(0,IE.c)(74),{browserConversationId:n,conversationId:r,branchingMessageId:i,hostId:a",
        }),
        Object.freeze({
          label: "content-reference initializer export",
          needle: "Wd as E",
        }),
        Object.freeze({
          label: "content-reference parser export",
          needle: "zd as w",
        }),
        Object.freeze({
          label: "cloud conversation-turn initializer export",
          needle: "VE as c",
        }),
        Object.freeze({
          label: "cloud conversation-turn export",
          needle: "aE as s",
        }),
      ]),
    }),
    Object.freeze({
      id: "local-conversation-item",
      path: "webview/assets/subagent-activity-chip-group-DZBSwHRQ.js",
      sha256:
        "ec7c26bd95d670a10c8388ab35b67a695842d37eaeda19092df25da6b7f4f99d",
      anchors: Object.freeze([
        Object.freeze({
          label: "local conversation-item owner",
          needle:
            "function nM(e){let t=(0,gM.c)(321),{item:n,alwaysShowUserMessageActions:r,alwaysShowAssistantMessageActions:i",
        }),
        Object.freeze({
          label: "local conversation-item type dispatcher",
          needle: "switch(n.type){case`external-event`:",
        }),
        Object.freeze({
          label: "local conversation-item initializer export",
          needle: "yM as C",
        }),
        Object.freeze({
          label: "local conversation-item owner export",
          needle: "nM as S",
        }),
      ]),
    }),
    Object.freeze({
      id: "assistant-code-block",
      path: "webview/assets/chatgpt-code-block-C_pK8Bfv.js",
      sha256:
        "4e8f472b6ab2b885aedae37978d9ff5588f09cdcdd284b79e4fc5dc90e2a3c34",
      anchors: Object.freeze([
        Object.freeze({
          label: "named code-block wrapper",
          needle: "function Ut(e){let t=(0,qt.c)(7)",
        }),
        Object.freeze({
          label: "code-block final owner props",
          needle:
            "function Wt(e){let t=(0,qt.c)(194),{allowWideBlocks:n,codeBlockIndex:r,codeBlockInfo:o,content:s,forceCodeBlockWordWrap:c,isCodeFenceOpen:l,language:u,stickyHeader:d,turnContext:f}=e",
        }),
        Object.freeze({
          label: "code-block native preview branch",
          needle: "code_blocks_auto_preview",
        }),
        Object.freeze({
          label: "code-block named export",
          needle: "Ut as ChatGptCodeBlock",
        }),
      ]),
    }),
  ]),
});

function countOccurrences(source, needle) {
  if (needle.length === 0) {
    throw new TypeError("A semantic anchor cannot be empty");
  }
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}

export function validateUniqueAnchors(assetPath, source, anchors) {
  if (typeof source !== "string") {
    throw new TypeError(`The ${assetPath} source must be text`);
  }
  for (const anchor of anchors) {
    const count = countOccurrences(source, anchor.needle);
    if (count !== 1) {
      throw new Error(
        `${assetPath}: semantic anchor "${anchor.label}" expected exactly once, found ${count}`,
      );
    }
  }
}

export function verifyRichContentAssetSource(asset, source) {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== asset.sha256) {
    throw new Error(
      `${asset.path}: SHA-256 ${actualSha256} does not match ${asset.sha256}`,
    );
  }
  validateUniqueAnchors(asset.path, bytes.toString("utf8"), asset.anchors);
  return Object.freeze({
    id: asset.id,
    path: asset.path,
    sha256: actualSha256,
    anchors: asset.anchors.length,
  });
}

function readPlistValue(plistPath, key) {
  const result = spawnSync(
    "/usr/bin/plutil",
    ["-extract", key, "raw", "-o", "-", plistPath],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Cannot read ${key} from ${plistPath}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

async function sha256File(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

function defaultAsarBinary() {
  const configured = process.env.CHATGPTX_ASAR_BINARY;
  if (configured) return configured;
  for (const candidate of [
    "/opt/homebrew/bin/asar",
    "/usr/local/bin/asar",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "asar";
}

function extractAsset(asarBinary, asarPath, assetPath, outputDirectory) {
  const result = spawnSync(
    asarBinary,
    ["extract-file", asarPath, assetPath],
    { cwd: outputDirectory, encoding: "utf8" },
  );
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(
        `Cannot find the asar CLI at ${asarBinary}. Set CHATGPTX_ASAR_BINARY.`,
      );
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Cannot extract ${assetPath} from ${asarPath}: ${result.stderr.trim()}`,
    );
  }
  return join(outputDirectory, basename(assetPath));
}

export async function verifyInstalledRichContentBinding(options = {}) {
  const appPath = resolve(options.appPath ?? "/Applications/ChatGPT.app");
  const infoPlist = join(appPath, "Contents", "Info.plist");
  const asarPath = join(appPath, "Contents", "Resources", "app.asar");
  const appVersion = readPlistValue(
    infoPlist,
    "CFBundleShortVersionString",
  );
  const appBuild = readPlistValue(infoPlist, "CFBundleVersion");
  if (
    appVersion !== RICH_CONTENT_BINDING.appVersion ||
    appBuild !== RICH_CONTENT_BINDING.appBuild
  ) {
    throw new Error(
      `Rich-content binding requires ChatGPT ${RICH_CONTENT_BINDING.appVersion} (${RICH_CONTENT_BINDING.appBuild}); found ${appVersion} (${appBuild})`,
    );
  }

  const appAsarSha256 = await sha256File(asarPath);
  if (appAsarSha256 !== RICH_CONTENT_BINDING.appAsarSha256) {
    throw new Error(
      `app.asar SHA-256 ${appAsarSha256} does not match ${RICH_CONTENT_BINDING.appAsarSha256}`,
    );
  }

  const outputDirectory = await mkdtemp(
    join(tmpdir(), "chatgptx-rich-content-binding-"),
  );
  try {
    const assets = [];
    const asarBinary = options.asarBinary ?? defaultAsarBinary();
    for (const asset of RICH_CONTENT_BINDING.assets) {
      const extractedFile = extractAsset(
        asarBinary,
        asarPath,
        asset.path,
        outputDirectory,
      );
      assets.push(
        verifyRichContentAssetSource(asset, await readFile(extractedFile)),
      );
    }
    return Object.freeze({
      appPath,
      appVersion,
      appBuild,
      appAsarSha256,
      assets: Object.freeze(assets),
    });
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}
