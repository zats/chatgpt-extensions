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
  appVersion: "26.825.32147",
  appBuild: "7303",
  appAsarSha256:
    "0462b03e878f0e78b223b849ee14cbba0de043f2c16acebee163cb95daa622ef",
  assets: Object.freeze([
    Object.freeze({
      id: "streaming-markdown",
      path: "webview/assets/chatgpt-markdown-view-Be5HLyGH.js",
      sha256:
        "d7a60723edb0b89e768203207764df3a96d68db649aca331a3519999f4c5942b",
      anchors: Object.freeze([
        Object.freeze({
          label: "content-reference dispatcher props",
          needle:
            "{contentReferenceIndex:n,contentReferenceType:r,isTerminalInline:i,reference:a,turnContext:o}=e",
        }),
        Object.freeze({
          label: "content-reference message identity",
          needle:
            "i.contentReferenceMessageIds?.[n]??i.messageId",
        }),
        Object.freeze({
          label: "content-reference type switch",
          needle: "case`client_defined_widget`:",
        }),
        Object.freeze({
          label: "title-citation first-party branch",
          needle: "case`title_citation`:{",
        }),
        Object.freeze({
          label: "title-citation first-party text renderer",
          needle: "r=Bt(n.description)??me(n)",
        }),
        Object.freeze({
          label: "StreamingMarkdown owner props",
          needle:
            "{conversationId:o,directives:n,extensions:r,isBrowserEnabled:i,...a}=e",
        }),
        Object.freeze({
          label: "directive and extension forwarding",
          needle:
            "directives:g,extensions:f,externalResourcePolicy:_,isBrowserEnabled:y",
        }),
        Object.freeze({
          label: "StreamingMarkdown owner export",
          needle: "Nh as t",
        }),
      ]),
    }),
    Object.freeze({
      id: "app-rich-content-owners",
      path: "webview/assets/app-initial-DJrCTPoN.js",
      sha256:
        "27618295c2da9ccf6959e93427e34b75a6d1b4ccd7d4a9f6a18a3974b61803e5",
      anchors: Object.freeze([
        Object.freeze({
          label: "generic Markdown directive dispatcher",
          needle:
            "function Mds(e,t,n,r){let i=n.directives?.[e.name]",
        }),
        Object.freeze({
          label: "generic Markdown directive identity and owner props",
          needle:
            "directiveId:n.nextDirectiveId(),conversationId:n.conversationId,hostId:n.hostId,name:e.name",
        }),
        Object.freeze({
          label: "fenced-code owner props",
          needle:
            "function Kss(e){let t=(0,Xss.c)(24),{allowWideBlocks:n,codeBlockIndex:r,codeBlockInfo:i,content:a,forceCodeBlockWordWrap:o,isCodeFenceOpen:s,language:c,onAddSelectedTextToChat:l,renderImmediately:u,renderCodeBlocksAsWritingBlocks:d}=e",
        }),
        Object.freeze({
          label: "fenced-code first-party lazy renderer",
          needle:
            "$ss=(0,Zss.lazy)(async()=>{let{ChatGptCodeBlock:e}=await",
        }),
        Object.freeze({
          label: "fenced-code current turn context",
          needle:
            "f=UD(`2910064124`),p=fes(),m=d?Yss:void 0",
        }),
        Object.freeze({
          label: "fenced-code metadata and turn-context forwarding",
          needle:
            "codeBlockInfo:i,content:a,forceCodeBlockWordWrap:o,isCodeFenceOpen:s,language:c,renderImmediately:u,stickyHeader:f,turnContext:p",
        }),
        Object.freeze({
          label: "account-state atom shape",
          needle:
            "rk=Qg($,{accountId:null,accountLoading:!0,accountStructure:null,authLoading:!0,authMethod:null,authenticatedAccountId:null,hasChatGptToken:void 0,plan:null,requiresAuth:!0,supportedSurface:!1,userId:null}",
        }),
        Object.freeze({
          label: "account-state atom export",
          needle: "rk as uwt",
        }),
        Object.freeze({
          label: "scope-value hook export",
          needle: "k_ as JUt",
        }),
        Object.freeze({
          label: "scope-value hook body",
          needle:
            "function k_(e,t,n){let r=(0,nCt.c)(7),i;if(typeof e==`object`&&e&&ryt in e)",
        }),
        Object.freeze({
          label: "scope-value reactive resolution",
          needle:
            "r[5]!==i?(a=zg(i,n),r[4]=n,r[5]=i,r[6]=a):a=r[6],Z(a)}",
        }),
        Object.freeze({
          label: "non-hook initializer export",
          needle: "iCt as KUt",
        }),
        Object.freeze({
          label: "fenced-code owner export",
          needle: "Kss as Iw",
        }),
        Object.freeze({
          label: "default AppShell main surface",
          needle: '"data-app-shell-main-surface":`default`',
        }),
        Object.freeze({
          label: "AppShell header marker",
          needle: "N=`app-shell-header`",
        }),
        Object.freeze({
          label: "AppShell main focus-area marker",
          needle: '"data-app-shell-focus-area":`main`',
        }),
      ]),
    }),
    Object.freeze({
      id: "local-conversation-item",
      path: "webview/assets/conversation-blocks-CaWT0vxQ.js",
      sha256:
        "66e5cbf8eb606b3f9c556def78b700ce332375643a3c970791175030e498fa45",
      anchors: Object.freeze([
        Object.freeze({
          label: "local conversation-item owner",
          needle: "function ZV(e){",
        }),
        Object.freeze({
          label: "local conversation-item owner props",
          needle:
            "{item:n,alwaysShowUserMessageActions:r,alwaysShowAssistantMessageActions:i,showAssistantMessageActionRow:a",
        }),
        Object.freeze({
          label: "local conversation-item type dispatcher",
          needle: "switch(n.type){case`external-event`:",
        }),
        Object.freeze({
          label: "local assistant-message branch",
          needle: "case`assistant-message`:{let e=n.markdownMediaCacheKey",
        }),
        Object.freeze({
          label: "local assistant-message first-party renderer",
          needle: "function d_(e){",
        }),
        Object.freeze({
          label: "local conversation-item owner export",
          needle: "ZV as f",
        }),
      ]),
    }),
    Object.freeze({
      id: "cloud-conversation-item",
      path: "webview/assets/viewer-BPgEYBcW.js",
      sha256:
        "8e37cce945e796fabb8404d4c5d2a5f49eaa164eb08d2676e7f66680bc2a493c",
      anchors: Object.freeze([
        Object.freeze({
          label: "cloud conversation-item owner",
          needle: "function Zf(e){",
        }),
        Object.freeze({
          label: "cloud conversation-item owner props",
          needle:
            "{automation:n,assistantHeadingImageId:r,assistantMessageRootRef:i,browserConversationId:a,conversationId:o,hostId:s,index:c,isLatestActorMessage:l,isTemporaryChat:u,item:d,items:f,localConversationId:p",
        }),
        Object.freeze({
          label: "cloud assistant-message branch",
          needle: "if(d.type===`assistant-message`){",
        }),
        Object.freeze({
          label: "cloud assistant-message first-party renderer",
          needle: "function bl(e){",
        }),
        Object.freeze({
          label: "cloud assistant-message content-reference reads",
          needle:
            "n.contentReferenceMessageIds||t[12]!==n.contentReferences",
        }),
        Object.freeze({
          label: "cloud web-search branch",
          needle: "if(d.type===`web-search`){",
        }),
        Object.freeze({
          label: "cloud generated-image branch",
          needle: "if(d.type===`generated-image`){",
        }),
        Object.freeze({
          label: "cloud turn owner export",
          needle: "If as r",
        }),
        Object.freeze({
          label: "direct cloud turn group initializer export",
          needle: "_p as i",
        }),
        Object.freeze({
          label: "paragen viewer group initializer export",
          needle: "nm as n",
        }),
      ]),
    }),
    Object.freeze({
      id: "home-task-suggestions",
      path: "webview/assets/home-task-suggestions-BS_HlNsl.js",
      sha256:
        "60a955dd2f15426b0cdcb31c08451a961cdf4debcffe1ebec9f31c216e7cddef",
      anchors: Object.freeze([
        Object.freeze({
          label: "task-suggestion query identity",
          needle:
            "queryKey:[`chatgpt-task-suggestions`,r,e,t],enabled:r!=null",
        }),
        Object.freeze({
          label: "task-suggestion owner props",
          needle:
            "{generatedSuggestionsEnabled:i,hostId:a,mode:s,onSelect:l}=e",
        }),
        Object.freeze({
          label: "task-suggestion null producer gate",
          needle: "!b||x==null||N==null&&S==null)return null",
        }),
        Object.freeze({
          label: "task-suggestion native list surface",
          needle: "layout:`list`,showCloseAction:!1,items:U",
        }),
        Object.freeze({
          label: "task-suggestion dismiss action",
          needle: "home.taskSuggestions.dismissFailed",
        }),
        Object.freeze({
          label: "task-suggestion owner export",
          needle: "he as HomeTaskSuggestions",
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
