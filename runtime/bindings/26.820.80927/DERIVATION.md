# ChatGPT 26.820.80927 binding

This directory contains one exact v5 binding for the supplied stock app.

- ChatGPT version: `26.820.80927`
- app build: `7271`
- Electron: `42.3.0`
- Chromium framework: `151.0.7922.170`
- architecture: `arm64`
- `app.asar` SHA-256: `60f9dcc03f50e7b66883c43e34e86e34d3dcf2650dcdf2b80bc79db116ee93cf`
- source app: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.820.80927.zip`
- source archive length: `588709155` bytes
- source archive Ed25519 signature: `rASGXIGH+/HSYuW/EQ+9DGb67PzqtWr84+rz8IE3N54GKllfz/hVTAPXnaQpbcz8HPVXkvHH2v1DtZpQimMYCQ==`

The exact research tree is
`/var/folders/k9/jyjkdb955tl5q1dc43qz8b1w0000gn/T/chatgpt-app-26.820.80927.hatBNI`.
The target files and the signed release tuple are the source of truth. No source
map is present.

## Host base

`host.js` starts from the exact v4 host at
`../v4/src/platform/bindings/26.820.80927/host.js`. It has two generic v5 host
fixes:

1. The selection surface schedules one animation-frame placement and cancels
   that frame during cleanup.
2. The generic thread-menu clone sets `disableNative: true`.

The v5 patch also uses the generic primary AppShell readiness rule. It selects
`main[data-app-shell-main-surface]` and requires a connected root that owns
`[data-app-shell-focus-area="main"]`. It does not require the default surface or
a header.

## Exact target mappings

The base module is `webview/assets/app-initial-CpK4W6kT.js`.

| Contract | Initializer | Export |
| --- | --- | --- |
| message bus | `yFt()` | `bFt` |
| open in browser | none | `Zpt` |
| keyed scope value | `UGt()` | `GGt` |
| account state | `Rwt()` | `Iwt` |
| conversation host ID | `Eut()` | `tdt` |
| generic banner | `CT()` | `ST` |
| streaming Markdown | `iY()` | `aY` |
| content-reference directive name | none | `Hot` |
| turn context | none | `HQ` |
| current turn context hook | none | `WQ` |
| React DOM portal namespace | factory call | `qzt()` |
| home composer utility owner | module initialization | `bE` |
| native button | none | `qN` |
| sidebar row | none | `Ou` |
| tooltip | none | `l4` |
| close X icon | none | `nmt` |

`HGt` is the full scope-object hook. It is not the keyed scope-value hook.
The Composer namespace is internal and has no target export.

The exact rich-content owners are:

| Contract | Exact module | Initializer | Owner export |
| --- | --- | --- | --- |
| content-reference index | `chatgpt-thread-visibility-p3PeKx_R.js` | `E()` | `w` |
| cloud conversation turn | `chatgpt-thread-visibility-p3PeKx_R.js` | `c()` | `s` |
| local conversation item | `subagent-activity-chip-group-DZBSwHRQ.js` | `C()` | `S` |
| assistant code block | `chatgpt-code-block-C_pK8Bfv.js` | module self-initializes | named `ChatGptCodeBlock` |

The cloud mapping uses the direct turn initializer `c` and owner `s`. Exports
`i` and `r` initialize and render the outer viewer. They are not the direct
cloud-turn boundary.

The code-block module exports its wrapper. The patch also recognizes the final
owner by its exact prop and source contract. Composer attachment slots use an
exact semantic owner because the Composer namespace is internal.

## Capability limits

The stable public catalog remains complete. The binding reports these target
surfaces as unavailable:

- `home.new-chat-suggestions`
- `home.announcements`
- a direct standalone `ChatGptMarkdownView` owner

This build has no exported Home suggestion surface, no v5 task-suggestion
module, no exported Home banner controller, and no standalone Markdown-view
module. The binding does not create substitute owners. Assistant directive and
content-reference definitions remain available through the exported
`StreamingMarkdown` owner. Assistant code-block definitions remain available
through the named code-block module. Direct transform registration for either
unavailable Home point fails with `capability-unavailable` and reason
`binding-unavailable`; it does not call a legacy Home registration path. The
same `availableListPoints` set controls discovery and direct registration.

## Pinned source evidence

`exact-build-locators.test.mjs` pins the direct bootstrap, settings, icon, menu,
composer, and rich-content module paths and file digests.
`rich-content-binding-verifier.mjs` pins four exact rich-content assets:

- `app-initial-CpK4W6kT.js`: `9e85f5705a7640f90281a3e31daa63ef849d97675ad53a99d72c1a2b6ef14634`
- `chatgpt-thread-visibility-p3PeKx_R.js`: `1936ea1d8793f1eac48f4f757737c2ebc156aa982ff16cec02ad95ee2ceff1bf`
- `subagent-activity-chip-group-DZBSwHRQ.js`: `ec7c26bd95d670a10c8388ab35b67a695842d37eaeda19092df25da6b7f4f99d`
- `chatgpt-code-block-C_pK8Bfv.js`: `4e8f472b6ab2b885aedae37978d9ff5588f09cdcdd284b79e4fc5dc90e2a3c34`

Each semantic anchor must occur exactly once after its file digest matches.

## Artifacts

| Manifest artifact | SHA-256 |
| --- | --- |
| `host.js` | `66379d40f549ecd2ca9ebe1fe92ce7f8fe97db7f17427f435ee8fec5e2fc5192` |
| `host-source-patch.cjs` | `9656d815fb5d3a497939f9de26db1bfdd355585de7002e8c4d450dc4863a7cff` |
| `renderer-entry.ts` | `2a33b872d6fbd5041ec5029185715712f97aa1999e9f931b1f1e131e7f5fc583` |
| `renderer-adapter.ts` | `0607c2c0663defe08397892a051877f8c34a267f78379a494677c42dceb484cc` |
| `renderer-host.js` | `88a66437a70359a965ddf5a81e9af6e578e395080cd106a6d2ae09099fed8be8` |

The exact patch accepts the checked-in host digest above and produces
`6f2e0f6f26b86b7c33169bc05b53a4e45062747e23a731897b7ae82d4a2dd9d3`.

## Validation

The complete binding-local suite passes 47 tests against the exact research
tree. It covers exact module and digest checks, unique semantic anchors, patch
fail-closed behavior, AppShell readiness, adapter discovery and lifecycle,
direct rejection of unavailable Home transforms, rich-content definitions, UI
owners, settings, and Thread Colors identity.
The renderer bundle was rebuilt with the repository build settings for
Chrome 151. No app was launched for this preparation.
