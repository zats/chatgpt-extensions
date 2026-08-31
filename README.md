# ChatGPT Extensions

This repository adds trusted extensions to the stock ChatGPT macOS app. It
provides a stable TypeScript API, exact-build bindings, a direct launcher,
example extensions, live contract probes, and version automation.

It does not use or start the ChatGPTX macOS app.

## How it works

The launcher starts the stock `ChatGPT.app` with one preloaded CommonJS module:

```text
NODE_OPTIONS=--require runtime/bootstrap.cjs
```

The bootstrap checks the app version, bundle build, `app.asar` digest, code
signature, and selected binding. It then loads trusted extension bundles into
the Electron main process and eligible ChatGPT renderer documents. A mismatch
stops extension activation. It does not modify the installed app.

The public API uses ChatGPT concepts and existing ChatGPT UI owners. Exact-build
adapters map stable names to the current internal modules, descriptor lists,
component slots, routes, panels, and content dispatchers. Extensions do not
import hashed ChatGPT modules.

See these documents for details:

- [Public API](APIs/README.md)
- [Runtime architecture](APIs/ARCHITECTURE.md)
- [Surface inventory](APIs/SURFACES.md)
- [Extension development](extensions/README.md)

## Included extensions

- [Thread Colors](extensions/thread-colors/README.md) adds native color menus,
  header colors, and sidebar row indicators.
- [Reactions](extensions/reactions/README.md) adds configured reaction actions
  to the assistant selection toolbar.
- [Extensions](extensions/extensions/README.md) adds native settings controls
  for extension enablement.

Test extensions also exercise new-chat cards and announcements, composer
buttons, sidebar destinations, the product menu, assistant directives, content
references, rich code blocks, and typed conversation items.

## Requirements

- macOS on Apple silicon
- the exact stock ChatGPT build listed in `runtime/bindings/index.json`
- Node.js 24 or later
- an existing ChatGPT sign-in in the selected Codex home

## Build and test

```sh
npm ci
npm run typecheck
npm run build
npm test
```

Generated extension bundles are not committed. The launcher builds them before
a normal `npm start` launch.

## Start the stock app

```sh
npm start
```

The command prints the session path and process ID. It keeps the ChatGPT profile
and extension storage under:

```text
~/Library/Application Support/chatgpt-extensions/v5
```

Use the printed absolute session path for status and stop commands:

```sh
node scripts/start.mjs status "/absolute/session/path"
node scripts/start.mjs stop "/absolute/session/path"
```

Add a compiled extension package with a repeatable option:

```sh
npm start -- --extension /absolute/path/to/extension/dist
```

The start command refuses to run while a ChatGPTX process is present. It stops
only the stock ChatGPT process group that it started.

## Extension packages

An extension is a normal npm package. It can have a main entry, a renderer
entry, and a settings renderer entry. The build uses esbuild and includes normal
JavaScript dependencies in the output bundle. Main entries can use the host
Electron and Node runtimes. Renderer entries stay browser-only.

Installed extensions are trusted. There is no permission model. The
main/renderer split exists because Electron objects and React callbacks belong
to different processes, not because it is a security boundary.

## Exact-build verification

The version gate first runs static contract checks. Its live phase then starts
an isolated stock ChatGPT process with a temporary profile and private copied
authentication. The gate must prove:

- exact app and binding identity;
- extension activation and cleanup;
- a main extension receives ChatGPT's Electron singleton, Node runtime, and
  bundled `objc-js`, and its renderer channel supports calls, cancellation,
  targeted events, broadcast events, and cleanup;
- Thread Colors and Reactions interactions;
- one 3 px Thread Colors bar fills the complete standard, activity, and cloud
  row height without moving the title;
- new-chat, composer, sidebar, and product-menu contributions;
- eight rich-content variants: leaf and container directives, a content
  reference, complete and streaming code blocks, and standalone, grouped, and
  cloud conversation items;
- matching, fallback, invalidation, remount, action, and disposal behavior;
- no runtime failure records.

The current `26.825.51511` live gate recorded 49 rich-content lifecycle events.

The live gate always stops its isolated process.

## New ChatGPT versions

The Cloudflare Worker in `backend/version-watcher` checks the official arm64
appcast. If the newest build has no exact binding, it opens one labeled GitHub
issue. GitHub Actions then:

1. downloads and verifies the exact notarized OpenAI app;
2. creates a binding in an uncommitted worktree;
3. runs all static and live extension gates;
4. creates a candidate commit only after those gates pass;
5. validates that exact candidate commit;
6. fast-forwards `main` only if its base did not change;
7. runs a protected post-land gate and publishes immutable binding artifacts.

The backtest workflow resolves one appcast snapshot and processes its `t`,
`t-2`, and `t-4` builds in sequence. This tests both existing-binding and
historical-binding paths without changing which binding is current.
