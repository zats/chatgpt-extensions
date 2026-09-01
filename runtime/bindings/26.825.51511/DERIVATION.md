# ChatGPT 26.825.51511 binding

This directory is one exact binding package. The runtime must select it only
for this app identity:

- ChatGPT version: `26.825.51511`
- app build: `7377`
- `app.asar` SHA-256: `f56ac8d5254a10fc4a04e7417fa787d135c3bbca49bad7d668d4ae65833d40c7`
- source app: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.825.51511.zip`
- source archive length: `595263123` bytes
- source archive Ed25519 signature: `9ig6An9v69dIpSgoSRGs6PoTr4sP4Dug9HcyWm4vMEB7W4owrEQT5cN+csTux1MdN70stJXuq1U6KRxzqBw9CQ==`

`host.js` is the exact host artifact for this app build. Its SHA-256 is
`b69b974d320b8ec59b9167ba9ea47e4d037ad2608e42ddbedab855de9bf1e37e`.
It is now stored in this repository. The v5 launcher does not read a local v4
installation or a `versions-lock.json` file.

`host-source-patch.cjs` adds the v5 public API owners to the exact host source.
`renderer-entry.ts` combines the common renderer host factory with this
build's `renderer-adapter.ts`. `renderer-host.js` is the checked-in browser
bundle of that entry.

Run `npm run build:runtime` to rebuild the renderer entry and to verify that
its digest is equal to the digest in `manifest.json`. The build fails if the
checked-in bundle is stale. The binding registry also verifies each artifact
digest before bootstrap loads executable code.

`rich-content-binding-verifier.mjs` pins five exact renderer assets and 41
unique semantic anchors. The anchors include each extension attachment owner,
the first-party fallback renderers for `title_citation`, local
`assistant-message`, and cloud `assistant-message` values, and the exact
home-task suggestion producer. They also pin the default AppShell main surface,
its app-shell header marker, and its main focus-area marker. The home asset pins
its query, owner props, native list surface, dismiss action, export, and
null-producer gate. The live
gate must also prove the first-party `text` code-block renderer, an unregistered
directive name, a failed directive renderer, and false, thrown, and
renderer-failure outcomes for every matcher-capable definition kind.

The rich-message live probe expands the four definition kinds into eight
surface variants: leaf and container directives, a content reference, complete
and streaming code blocks, standalone and grouped execution items, and a cloud
item. Assistant directive, content-reference, and code-block contexts use the
canonical execution or cloud `ThreadLocator`. The exact isolated live run
recorded 49 lifecycle events and proved interaction, invalidation, replacement,
fallback, final disposal, and one valid code-block effect replay.

The home binding imports `HomeSuggestionSurface`, the ambient producer, and the
exact `HomeTaskSuggestions` producer from
`home-task-suggestions-CPTOpaBq.js`. The home-page boundary finds the existing
first-party suggestion owner. If an upstream feature gate returns before it
creates that owner, the boundary supplies an empty native surface only while an
extension suggestion transformer is registered.

The exact `RemoteSidebarThreadRow` is `URc`, exported as `Fc` from
`app-initial-B6Gk5KCN.js`. Its pinned contract includes `task`,
`transformContextMenuItems`, and the direct task-row export. The adapter uses
this owner for canonical remote task identity, selected-thread state, menu
transforms, title-prefix contributions, and priority-indicator contributions.

The thread-row priority contribution does not reserve a new leading title slot.
With no native priority, the adapter passes the extension mount through
`overlayMetaContent` and places it as an absolute row child. With a native
priority, it composes both views through `priorityIndicatorNode`. The live gate
proved one 3 px bar with a 3 px title gap, full 30 px standard and cloud row
height, full 53.5 px activity row height, and equal x 16 title alignment for
colored and uncolored rows. That live record covers the prior persisted and
signed-in ChatGPT rows. Adapter `1.0.5` adds the exact Remote Codex row and its
deterministic standard and activity probe. It requires a new live-gate result
before the Remote Codex layout is recorded as passed.

The compiled Native Main Probe is part of the exact live gate. It receives the
same Electron singleton as ChatGPT, Node `24.14.0`, and the bundled `objc-js`.
It also proves renderer-to-main calls and cancellation, targeted and broadcast
events, caller ownership, resource release, and deferred cleanup.

## Artifacts and validation

| Manifest artifact | SHA-256 |
| --- | --- |
| `host.js` | `b69b974d320b8ec59b9167ba9ea47e4d037ad2608e42ddbedab855de9bf1e37e` |
| `host-source-patch.cjs` | `6ab6c4e5f1c3fcf5a18cafed7097d0567ba8d52e45b527173e7ecb3f4ba51674` |
| `renderer-entry.ts` | `7e0a00faed7c4946261514442550a7e7ddf316f8080e400bfb123aa61d83e69d` |
| `renderer-adapter.ts` | `4c971623b753f3c57ed628c5a703a7fe3fc87185e3f4db82cee59ebef8b7151d` |
| `renderer-host.js` | `8541c787474f01c2838ebf31418a48258e9149795ccfddedfb20007d37bde31f` |

The exact patch produces
`3b1a9bd9c1ac5179d89b26e7d26bb8ea60d2d931dbb622342bcb52d0ccb4023c`.
Adapter `1.0.5` passes the repository static, type, and build checks. Its
product probe has one total 55-second UI deadline. Settings search remains
inside the active Settings owner after a remount. The deterministic row fixture
uses first-party persisted, Remote Codex, and signed-in ChatGPT row owners.
