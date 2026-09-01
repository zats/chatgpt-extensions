# ChatGPT 26.825.32147 binding

This directory is one exact binding package for the supplied stock app:

- ChatGPT version: `26.825.32147`
- app build: `7303`
- Electron: `42.3.0`
- Chromium framework: `151.0.7922.174`
- architecture: `arm64`
- `app.asar` SHA-256: `0462b03e878f0e78b223b849ee14cbba0de043f2c16acebee163cb95daa622ef`
- source app: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.825.32147.zip`
- source archive length: `594222100` bytes
- source archive Ed25519 signature: `Y4YH/H+IsSwOd6HdN8Zdct2d6SV3/lSAVNNz/PcusUmYAvYIcuej05jhvVqsEZ95VeyGqgSZ1lqwJXTYJ19cDw==`

The supplied app and prepared `app.asar` research tree were the only app
sources used. No other ChatGPT build was used. The app bundle reports version
`26.825.32147`, build `7303`, and Chromium base `151.0.7922.174`; its packaged
`package.json` reports Electron `42.3.0`. No source maps were present.

## Verified renderer modules

The module identities below were derived from stable identifiers, owner prop
contracts, first-party branches, ARIA or test markers, and initializer call
graphs in the target tree. Chunk names and minified exports were accepted only
after those behaviors matched.

| Capability | Exact module | Verified exports and boundary |
| --- | --- | --- |
| App owners and shared exports | `app-initial-DJrCTPoN.js` | `BWt` message-bus initializer, `VWt` message bus, `LWt` open-in-browser dispatcher, `JUt` scope-value hook, `j2` conversation-to-host selector, `uwt` account state, `Iw` fenced-code owner, selection, settings, menu, React, and JSX exports |
| Menu icons | `plus-BgCJgEEs-DVFkddeF.js`, `palette-lzFbWMQk-BQiJ2H2n.js` | component `n` / initializer `t`; component `t` / initializer `n` |
| Thread menu | `thread-overflow-menu-DrZEc2Ru.js` | component `t`, initializer `n`, header owner behavior |
| Authentication | `chatgpt-desktop-auth-url-C9T__Nvw.js` | sign-in `o`, URL decoration `t`, required initializer `r` |
| Settings | `use-visible-settings-sections-s-VlMB6g.js`, `settings-loading-row-Cig0SJI7.js`, `toolbar-breadcrumb-DGLz3tdB.js` | icon-map initializer `i` and map `r`; loading initializer `n` and component `t`; breadcrumb initializer `n` and component `t` |
| Suggestions | `home-suggestion-surface-DYzWjNWQ.js`, `home-ambient-suggestions-content-BsHgi12z.js`, `home-task-suggestions-BS_HlNsl.js` | native surface initializer `n` and component `t`; named ambient and task producers with target owner prop and null-gate contracts |
| Announcements | `codex-home-announcements-BEqpJiFL.js`, `banner-rS_k_4OE.js` | announcement initializer `r` / component `t`; banner initializer `n` / component `t` |
| Composer | `composer-utility-bar-DIkeCMt4.js` | named utility-bar owner and the existing first-party composer slots |
| Assistant Markdown | `chatgpt-markdown-view-Be5HLyGH.js` | initializer `n`, view `t`, content-reference index reader `w`, directive map and first-party fallback branches |
| Local typed items | `conversation-blocks-CaWT0vxQ.js` | owner `f`, owner group initializer `p`, local `assistant-message` fallback |
| Cloud typed items | `viewer-BPgEYBcW.js` | cloud turn `r`; direct owner-group initializer `i` |

The cloud viewer uses initializer `i`, which maps directly to the `_p` owner
group that defines cloud turn `r`. Export `n` is the larger paragen viewer
group and only reaches `_p` transitively.

The scope-value hook is `JUt`, which maps to the target `k_` keyed-scope hook.
Export `KUt` maps to the unrelated `iCt` initializer. Treating `KUt` as a hook
made the cloud typed-item owner visible to interception but prevented it from
receiving account identity, so cloud contributions and their first-party
fallbacks could not mount.

The first generated seed copied three aliases from another build. Target
behavior rejects all three: `RWt` is the `mg` URL normalizer and throws when
called without a URL, `zWt` is the `hg` initializer rather than the message
bus, and `PWt` is the `Xgt` event wrapper rather than the direct browser
dispatcher. The exact target export table maps the required contracts to
`BWt()`, `VWt`, and `LWt`. The corrected host is byte-identical to the
previously validated host for this exact app version, build, and app.asar.

`rich-content-binding-verifier.mjs` pins five target assets by SHA-256 and 46
unique anchors: the directive and content-reference dispatcher, fenced-code
owner, execution and cloud typed-item owners and fallbacks, task-suggestion
producer and null gate, and the three primary AppShell markers. Every anchor
occurs exactly once in the supplied tree.

## Artifacts

| Manifest artifact | SHA-256 |
| --- | --- |
| `host.js` | `2cb3022811c8d0bd45b51af0acf6d4e43203edd6492d43be13a6c4a02b192123` |
| `host-source-patch.cjs` | `8541843fbd2c25afc9d369ba49a04e1960dcca2bdb679a7c445e6a631c13ca51` |
| `renderer-entry.ts` | `fd51e9d461ccdc88ab4f0788f1bec3c5eda2a3e1c2fc9b752487117b70ff63b1` |
| `renderer-adapter.ts` | `819351a1e5a54c9f11c91858c4afe35c936d0292af798c03af1b83780f05adfc` |
| `renderer-host.js` | `19e949d47597dc663bf76c136fd1c3d08fb0e889c4a699ec0e4850dcdb65679c` |

## Exact tests and failure signatures

- `exact-build-locators.test.mjs` fails when a target module locator,
  initializer, mapped export, activation entry, rich owner, or pinned target
  asset digest changes. With `CHATGPT_APP_RESEARCH_TREE` set, it verifies the
  supplied research tree directly.
- `rich-content-binding-verifier.test.mjs` rejects missing, changed, duplicate,
  or hash-mismatched rich-content anchors.
- `host-source-patch.test.mjs` rejects wrong version/build/digest, missing or
  duplicate patch anchors, reapplication, and absent UI or product-extension
  composition paths.
- `renderer-adapter.test.ts` covers activation lifetime, exact UI and rich
  contribution mapping, product-extension composition, cancellation,
  discovery, settings, and callback isolation.
- `thread-colors.integration.test.ts` pins renderer callback identity used by
  the checked-in product extension.

The direct stock-app live gate passed locally against this exact signed app,
binding, and isolated authenticated profile. It verified native main calls,
all rich-message lifecycle and interaction paths, all UI surfaces, the real
Reactions and Thread Colors extensions in standard, activity, and cloud row
layouts, cleanup, and the absence of runtime failure events. The separate
test-auth-only CI runner must repeat this evidence before publication.
