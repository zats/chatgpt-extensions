# Extension runtime architecture

V5 has two design rules:

1. Startup uses `NODE_OPTIONS=--require runtime/bootstrap.cjs`. This is the only
   injection path.
2. UI composition follows ChatGPT's own descriptor lists, component slots,
   route tree, and panel registry. V5 adds stable names, types, cleanup, and
   exact-build mappings. It does not add a parallel UI framework.

```text
scripts/start.mjs direct launcher or run-gate
└─ NODE_OPTIONS=--require runtime/bootstrap.cjs
   └─ ChatGPT Electron main process
      ├─ exact-build ChatGPT adapter
      ├─ trusted main extension entries
      │  ├─ actual Electron main module
      │  ├─ Node built-ins
      │  └─ host-provided objc-js
      └─ each app: renderer document
         ├─ ChatGPT preload plus ChatGPTX preload
         ├─ exact-build renderer host
         └─ trusted renderer extension entries
            ├─ stable ChatGPT API
            ├─ event and contribution callbacks
            ├─ caller-scoped ChatGPTX storage and extension state
            └─ extension-owned channel to its main endpoint
```

`NODE_OPTIONS` only starts the bootstrap module. It does not contain the API or
extension code. The bootstrap reads `CHATGPTX_LAUNCH_CONFIGURATION`, removes
the injection variables from the inherited environment, intercepts the first
Electron import, verifies the exact build, and installs the main and renderer
hosts. It then loads the normal package entries from each selected `dist/`
directory.

The runtime has clear code ownership:

- `runtime/bootstrap.cjs` owns startup, the exact-build gate, Electron capture,
  window attachment, and renderer transport.
- `runtime/extension-launch-config.cjs` validates package manifests and
  next-start enablement.
- `runtime/main-extension-host.cjs` activates main entries and owns native
  leases and renderer channels.
- `runtime/preload.cjs` installs the small isolated-world transport.
- `runtime/renderer-host.ts` validates normal renderer and settings bundles and
  sends them to the selected exact adapter.
- `runtime/bindings/26.825.51511/renderer-adapter.ts` maps the current ChatGPT
  owners to `@chatgptx/api`.
- `runtime/bindings/26.825.51511/host-source-patch.cjs` applies the validated
  exact-build source patch in memory.
- `runtime/extension-storage-main.cjs` owns scoped file storage.

## Activation order

1. The launcher writes one launch configuration with the expected app identity,
   exact binding host, storage root, and selected `dist/` packages.
2. The bootstrap runs before ChatGPT's `early-bootstrap.js` and removes its
   launch variables from the inherited environment.
3. The package loader validates each manifest and resolves only files inside
   its selected package directory.
4. The bootstrap intercepts the first `require("electron")`. It checks the app
   version, bundle build, live `app.asar` digest, host digest, and host target.
   It then patches the validated host source in memory. It does not write the
   installed binding or app. Runtime information reports the patched-source
   digest as `BindingInfo.adapterDigest`.
5. It patches new ChatGPT windows with the v5 preload. After `app.whenReady()`,
   it starts the enabled CommonJS main entries in deterministic sequence. It
   does not wait for all main activations before it attaches renderer documents.
6. For each eligible `app:` document, the preload creates the runtime request
   channel and enters the app main world. Main activation starts before the
   runtime attaches any already loaded documents, so an activating main entry
   can wait for the first renderer connection. If the first renderer needs a
   main request handler, the main entry must register that handler before its
   first `await`.
7. The exact-build host waits for the ChatGPT React root before it imports the
   exact UI chunks. It then installs, reports native readiness, and lets the
   generic renderer host map extension activations to that exact binding.
8. Each enabled renderer entry activates in the app main world.
9. Each declared settings entry activates even when the extension's normal main
   and renderer entries are disabled.
10. A full main-frame navigation disconnects the old document and gives the
    replacement a new ID. `pagehide` notifies main once and deactivates renderer
    entries in reverse activation order. An ineligible replacement or destroyed
    web contents also disconnects the old endpoint. Same-document navigation
    keeps the current ID and activation. Main activation continues until app
    exit. Enablement changes take effect after restart.

If `activate` rejects, the runtime aborts that entry's lifetime, disposes its
tracked contributions, channels, leases, and native cleanup records, and then
calls `deactivate` on a best-effort basis. No failed activation remains active.

The current ChatGPT renderer keeps `contextIsolation: true` and
`nodeIntegration: false`. v5 must not change these settings. Native work runs in
the extension's main entry. Renderer code calls its main endpoint through a
structured-clone channel.

Extension source is a normal npm package with a committed lock file. The build
creates three independent CommonJS outputs. Renderer and settings entries are
self-contained browser bundles with no Node imports. The main entry is a real
Node CommonJS module. It bundles ordinary JavaScript dependencies by default,
keeps `node:*`, `electron`, `electron/main`, and `electron/common` external, and
is loaded through Node's `require(absolutePath)`. This preserves module caching
and gives the bundle its `dist/` directory as `__dirname`. The loader calls each
entry's exported `activate(context)` function.

The repository builder produces those declared bundles. The runtime loads the
same normal `dist/` package in production and in the isolated test session.

The current build has the `EnableNodeOptionsEnvironmentVariable` Electron fuse
enabled. Its package enters `.vite/build/early-bootstrap.js`, whose first
dependency immediately imports Electron. The current bootstrap intercepts that
import. If a later build disables the fuse or imports Electron before the hook
can run, that build is unsupported until there is another verified startup
design. There is no fallback injection path.

## Trust and process boundaries

An installed extension is fully trusted. There is no manifest permission model
and no per-call authorization check. Capability checks only report whether a
build, account, host, or feature provides an operation.

The main and renderer split is still required. Electron objects such as
`BrowserWindow`, `WebContents`, `Menu`, and `NativeImage` have main-process
identity and cannot cross Electron IPC. The main entry keeps those objects. The
renderer entry keeps ChatGPT React callbacks. Only data crosses their channel.

Each full renderer document gets a new document ID and channel endpoint.
`pagehide`, full main-frame navigation, an ineligible replacement, and destroyed
web contents disconnect that endpoint. Same-document navigation keeps it. Main
call signals abort when the renderer disconnects. A method handler belongs to
one extension and cannot receive another extension's requests. This isolation
avoids name collisions and stale callbacks; it is not an authority check.

## Stable layers

- `@chatgptx/api` contains stable product concepts such as threads, messages,
  selections, menus, surfaces, and settings.
- `BaseExtensionContext` exposes ChatGPTX-owned file storage scoped to the
  calling extension and launch-configuration listing and enablement. One
  extension-management service owns the mutable launch state for both renderer
  IPC and main contexts. These services are shared by main, normal renderer,
  and settings renderer entries. They do not enter the product API or an
  exact-build adapter.
- The native main context exposes the actual host Electron and Node runtimes.
  It does not copy or wrap every Electron method.
- The host-provided `objc-js` module gives an advanced extension broad AppKit,
  Objective-C, and C-function access without a new one-off API for each call.
- Small coordinated APIs own app-global resources such as shortcuts, power
  blockers, the application menu, and Dock state. Their leases make shutdown
  and failed-activation cleanup deterministic; they are not security checks.
- The exact-build adapter owns raw AppHost services, RPC DTOs, React modules,
  routes, and hashed chunks. Extensions do not bind to those symbols.

The loader supplies `context.storage` and `context.extensions` from the loaded
manifest identity. All installed extensions are trusted. Package identity
supplies scope, not an authority boundary.

Storage methods, extension listing and enablement, runtime information, the
implemented settings methods, and current-thread reads accept request signals.
The runtime checks `signal` before work starts and again before it returns after
host or awaited work. An abort while waiting rejects the caller, but it does not
cancel or roll back work that the host already performed.

Main entries activate in deterministic sequence. Renderer attachment continues
while an activation promise is pending. When a main entry registers
`onRendererChange()`, the host sends `connected` events in a microtask for all
documents that are already connected. This lets each later main entry observe
the first renderer even when an earlier main entry waited for that renderer.
This replay applies to connection listeners only. It cannot make a request
handler available before the extension registers that handler.

## UI composition

`ContributionsApi` has three operations. Each operation maps to a ChatGPT
composition mechanism:

- `transform(point, transformer)` changes an app-owned descriptor list before
  ChatGPT renders it. This is the primary operation for menus, sidebar
  destinations, and pickers.
- `register(kind, definition)` adds an addressable definition. The complete
  contract has `assistant-code-block`, `assistant-content-reference`,
  `assistant-directive`, `command`, `command-menu-provider`,
  `composer-action`, `conversation-item`, `main-route`, `message-action`,
  `surface`, and `settings-section` definitions. Each maps to the corresponding
  ChatGPT content renderer, command, command-menu, composer control, action,
  panel, route, or settings owner. The exact-build adapter marks a kind
  available only when it has that attachment.
- `render(point, contribution)` mounts content in a named component slot when
  the owner builds direct JSX instead of a descriptor list. The contribution
  also carries native slot options, such as header position and order.

Static inspection of the current build found these first-party seams:

- the new-chat home owns a final `HomeSuggestionSurface` item list for its
  card and list layouts;
- `HomeComposerAnnouncements` selects the first eligible or loading entry from
  an ordered announcement list and renders its native announcement card;
- the assistant renderer passes `additionalActions` and
  `persistentAdditionalActions` React-node collections to its action row;
- local Codex, remote Codex, and ChatGPT cloud thread headers pass descriptor
  lists to one shared menu adapter;
- the signed-in ChatGPT sidebar thread-row owner builds a descriptor list with
  `surface: "sidebar"`, passes it through the row's `renderActions` prop, and
  supplies row content through the first-party `titlePrefix` and
  `priorityIndicatorNode` props;
- the app shell has a keyed header-action registry and a separate
  header-context-menu-item registry; the latter does not replace the local and
  cloud overflow-menu builders;
- the shell builds and merges `availableDestinations` for the primary sidebar;
- the product-mode selector owns one synchronous menu with `app.work` and
  `app.codex` rows;
- a renderer registry defines movable right and bottom panel types;
- the main-page routes are a static React Router tree;
- the composer footer, action bar, and utility bar use direct child and leading
  or trailing component props;
- assistant Markdown uses a directive component map and a content-reference
  dispatcher, fenced code uses the app's code-block component, and typed
  transcript data uses the conversation-item dispatcher.

ChatGPT does not expose one general extension registry. Descriptor transforms
and panel definitions attach to existing first-party data paths. Named render
slots and the static route tree need a small external registry plus one hook at
the proven owner boundary. These hooks must feed the same first-party props or
registries. They must not patch DOM coordinates or replace a first-party owner
container or render path. A descriptor transformer can still replace or remove
items inside the app-owned list that the owner renders.

The stable contract can normalize only what extensions need to survive a new
build: semantic point and item IDs, typed owner context, deterministic order,
disposal, invalidation, and error isolation. The exact-build adapter keeps
hashed modules, host item IDs, React attachment, and route attachment private.

The four rich-content definitions attach at those existing ChatGPT renderer
owners. They do not add another transcript or Markdown pipeline. Their contexts
contain immutable JSON snapshots instead of raw host objects or React values.
The extension renders through the same `UiRenderProvider` lifecycle as other
extension content. ChatGPT keeps its first-party element when no definition
matches, a matcher throws, or extension rendering fails.
They load from the normal renderer bundle selected by the existing
`NODE_OPTIONS=--require runtime/bootstrap.cjs` path. Rich content does not add
another preload, injection variable, or extension loader.

Static evidence is not enough to publish a point. Each build must pass a live
contract test for attachment, order, remount cleanup, action dispatch, and host
fallback paths before that point is marked available.

Use the `scripts/start.mjs run-gate` command in `APIs/README.md` after the exact
binding is updated and before any of the four points are published as
available. In order, the gate checks the selected app and exact asset owners,
runs the focused verifier, source-patch, and renderer-adapter unit tests, builds
and tests `test-fixtures/rich-message-probe`, and starts a temporary exact-build
gate session with the compiled probe. The live probe must exercise
ChatGPT's directive map, content-reference dispatcher, fenced-code component,
and typed conversation-item dispatcher. It must verify actions, invalidation,
disposal, and the unchanged first-party element after mismatch or failure.

The gate session enters through
`NODE_OPTIONS=--require runtime/bootstrap.cjs`. Passing the gate does not
authorize a new injection path or a replacement Markdown or transcript owner.

Raw AppHost exposure would give power but would defeat the stable-interface
goal. v5 instead maps those services into the semantic API and updates only the
adapter when ChatGPT changes.

## Complete contribution inventory

`transform`, `register`, and `render` are stable ChatGPTX method names. The
literal words are ours, but each method maps directly to an observed ChatGPT
host mechanism. They are not a new component system or a second view
architecture:

- `transform` changes an item list that a ChatGPT owner already builds.
- `register` adds a definition to a ChatGPT registry, prop collection, or owner
  boundary.
- `render` supplies content to a named prop or slot in a ChatGPT owner.

The following tables list every ID in `contributions.d.ts`: ten transform
points, 11 definition kinds, and 30 render points. "Implemented" means that
the direct adapter attaches the operation. It does not claim that every product
owner has live UI proof.

### Transform points

| ID | ChatGPT mechanism | Direct adapter state |
| --- | --- | --- |
| `home.new-chat-suggestions` | Final item list consumed by `HomeSuggestionSurface` | Implemented; isolated live test passed |
| `home.announcements` | Ordered `HomeComposerAnnouncements` entry list | Implemented; isolated live test passed |
| `assistant-selection.actions` | Selection-overlay action descriptor list | Implemented for the current persisted-Codex owner family |
| `thread.header.menu` | Header descriptor list before the shared menu adapter | Implemented for the current persisted-Codex owner family |
| `sidebar.destinations` | Primary-sidebar `availableDestinations` list | Implemented; isolated live test passed |
| `sidebar.product-mode.menu` | Native product-mode menu before its menu adapter | Implemented; isolated live test passed; extension rows are actions, not product modes |
| `sidebar.thread-row.actions` | Thread-row trailing-action descriptors | Unavailable |
| `sidebar.thread-row.menu` | Thread-row context-menu descriptor builder | Implemented for the signed-in ChatGPT cloud row owner |
| `profile.menu` | Profile-menu descriptor builder | Unavailable |
| `surface.new-tab` | Right- and bottom-panel new-tab choices | Unavailable |

### Definition kinds

| ID | ChatGPT mechanism | Direct adapter state |
| --- | --- | --- |
| `assistant-directive` | Directive component map used by the assistant Markdown owner | Implemented at the exact Markdown owner; first-party fallback remains active |
| `assistant-content-reference` | Content-reference dispatcher used by assistant Markdown | Implemented at the exact dispatcher owner; first-party fallback remains active |
| `assistant-code-block` | First-party assistant fenced-code component | Implemented at the exact code-block owner; first-party fallback remains active |
| `command` | Extension command registry and dispatch | Implemented |
| `command-menu-provider` | Command-menu provider registry | Unavailable |
| `composer-action` | Native composer control inserted in a first-party footer, action-bar, or utility rail | Implemented; isolated live test passed |
| `conversation-item` | First-party typed conversation-item dispatcher | Implemented at the exact item owner; first-party fallback remains active |
| `main-route` | Static router boundary and its extension definition registry | Unavailable |
| `message-action` | Assistant or user message additive action props | Unavailable |
| `surface` | Right- and bottom-panel type registry | Unavailable |
| `settings-section` | Settings navigation, group, row, native-control, and search owners | Partially implemented through the exact exported `NativeSettingsControlsSectionDefinition`; discovery reports the `native-controls` shape; a local definition ID must be non-empty and contain no dots |

### Render points

| ID | ChatGPT mechanism | Direct adapter state |
| --- | --- | --- |
| `thread.header.action` | Keyed header-action registry | Unavailable |
| `assistant-message.additional-actions` | Assistant action-row `additionalActions` prop | Unavailable |
| `assistant-message.persistent-actions` | Assistant action-row `persistentAdditionalActions` prop | Unavailable |
| `assistant-message.after` | Assistant message trailing-content prop | Unavailable |
| `user-message.additional-actions` | User message `additionalActions` prop | Unavailable |
| `sidebar.destination.trailing` | Sidebar destination trailing-content prop | Unavailable |
| `sidebar.thread-row.title-prefix` | Thread-row `titlePrefix` slot at the first-party row owner | Implemented for persisted Codex rows and signed-in ChatGPT cloud rows |
| `sidebar.thread-row.priority-indicator` | Thread-row `priorityIndicatorNode` slot outside the title marquee | Implemented for persisted Codex rows and signed-in ChatGPT cloud rows |
| `sidebar.thread-row.title-suffix` | Thread-row title-suffix prop | Unavailable |
| `sidebar.thread-row.secondary` | Thread-row secondary-content prop | Unavailable |
| `sidebar.thread-row.indicator-idle` | Thread-row idle-indicator prop | Unavailable |
| `sidebar.thread-row.indicator-rest` | Thread-row resting-indicator prop | Unavailable |
| `sidebar.thread-row.indicator-hover` | Thread-row hover-indicator prop | Unavailable |
| `sidebar.thread-row.meta` | Thread-row metadata prop | Unavailable |
| `sidebar.thread-row.overlay-meta` | Thread-row overlay-metadata prop | Unavailable |
| `composer.footer.leading` | Composer footer leading-content prop | Unavailable |
| `composer.footer.trailing` | Composer footer trailing-content prop | Unavailable |
| `composer.action-bar.leading` | Composer action-bar leading-content prop | Unavailable |
| `composer.action-bar.trailing` | Composer action-bar trailing-content prop | Unavailable |
| `composer.utility.leading` | Composer utility-bar leading-content prop | Unavailable |
| `composer.utility.trailing` | Composer utility-bar trailing-content prop | Unavailable |
| `composer.attachments` | Composer attachment-content prop | Unavailable |
| `composer.banners` | Composer banner-content prop | Unavailable |
| `right-panel.tabs.before` | Right-panel tab-strip content before tabs | Unavailable |
| `right-panel.tabs.after` | Right-panel tab-strip content after tabs | Unavailable |
| `right-panel.tabs.after-sticky` | Right-panel sticky content after tabs | Unavailable |
| `right-panel.empty-state` | Right-panel empty-state content | Unavailable |
| `bottom-panel.tabs.after` | Bottom-panel tab-strip content after tabs | Unavailable |
| `bottom-panel.tabs.after-sticky` | Bottom-panel sticky content after tabs | Unavailable |
| `bottom-panel.empty-state` | Bottom-panel empty-state content | Unavailable |

The public catalog is larger than the current direct adapter. Discovery must
return every transform point, definition kind, and render point. It must mark
an item unavailable when the active binding does not implement and test its
full contract. It must not omit unsupported catalog entries or infer support
from static bundle evidence.

See [CALLBACKS.md](./CALLBACKS.md) for the event and contribution callback model and
[NATIVE.md](./NATIVE.md) for the main-process API.
