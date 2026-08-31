# ChatGPTX v5 API

Status: implemented runtime and candidate public product contract.

The v5 runtime loads normal extension packages from their `dist/` directories.
It does not make a second package for tests. The runtime has one exact binding
for ChatGPT `26.825.51511`. That binding maps the current ChatGPT modules and
owners to the stable API in this folder.

Two rules define the design:

- Startup uses `NODE_OPTIONS=--require` to load `runtime/bootstrap.cjs` before
  ChatGPT imports Electron.
- UI integration uses ChatGPT descriptor lists, component slots, settings
  owners, and native components. It does not create a second UI framework.

## Runtime shape

```text
ChatGPTX launch configuration
└─ NODE_OPTIONS=--require runtime/bootstrap.cjs
   └─ ChatGPT Electron main process
      ├─ exact-build gate and exact renderer binding
      ├─ trusted dist/main.cjs entries
      └─ each eligible app: renderer document
         ├─ exact-build host
         ├─ generic v5 renderer host
         ├─ enabled dist/renderer.cjs entries
         └─ all declared dist/settings.cjs entries
```

An installed extension is trusted. The manifest has no permission model. The
runtime still separates the main and renderer processes because Electron
objects and React callbacks cannot cross a process boundary.

## Exact-build gate

The launch configuration identifies one ChatGPT build and one binding host. It
contains:

- the ChatGPT version and bundle build number;
- the SHA-256 digest of `app.asar`;
- the binding host path, version, and SHA-256 digest;
- the API version, storage directory, and selected extension packages.

The loader validates absolute paths, package paths, manifest data, and the
binding host digest before it touches Electron. On the first Electron import,
it also checks `app.getVersion()`, `CFBundleVersion`, the live `app.asar`
digest, and the target version in the host source. A mismatch stops extension
activation. It does not stop ChatGPT.

For the current exact build, the bootstrap patches the validated binding host
source in memory. The patch uses ChatGPT's `KUt` scope-value hook and `j2`
thread-host selector to keep the host ID that ChatGPT resolved for the open
thread. It reads the sidebar row's separate host-ID attribute for row contexts.
The installed binding file and ChatGPT app stay unchanged. The configured host
digest validates the original source; `BindingInfo.adapterDigest` is the
SHA-256 digest of the patched source that the renderer receives.

The current exact target is:

- ChatGPT version `26.825.51511`;
- bundle build `7377`;
- `app.asar` SHA-256
  `f56ac8d5254a10fc4a04e7417fa787d135c3bbca49bad7d668d4ae65833d40c7`.

The loader injects renderer code only into `app:` documents. The exact host
must report version `26.825.51511`, and its native setup must finish before an
extension entry can register.

Before a new ChatGPT version can report the four rich-content definition kinds
as available, run this required gate against the installed target build:

```sh
npm run build
npm run build --prefix test-fixtures/native-main-probe
npm run build --prefix test-fixtures/ui-surface-probe
npm run build --prefix test-fixtures/rich-message-probe
node scripts/start.mjs run-gate \
  --app /Applications/ChatGPT.app \
  --binding runtime/bindings/26.825.51511 \
  --codex-home "$CODEX_HOME" \
  --extension extensions/extensions/dist \
  --extension extensions/reactions/dist \
  --extension extensions/thread-colors/dist \
  --extension test-fixtures/native-main-probe/dist \
  --extension test-fixtures/ui-surface-probe/dist \
  --extension test-fixtures/rich-message-probe/dist \
  --result /private/tmp/chatgpt-version-gate.json
```

The gate verifies four exact asset hashes and 32 unique semantic anchors. It
tests the exact owner hooks and renderer adapter, builds and tests the public
API probe extensions, and runs the compiled `dist/` packages in an isolated
ChatGPT profile. The Native Main Probe also verifies the direct Electron-main
singleton, a Foundation `NSString` round trip, Node, runtime information,
renderer ownership, the private main channel, invoke cancellation, and owned
resource cleanup. The four rich-content mappings are `assistant-directive`,
`assistant-content-reference`, `assistant-code-block`, and `conversation-item`.
The binding selects an extension before the matching first-party renderer. It
does not add a parser. An unregistered directive name or a failed directive
renderer keeps the first-party directive. For the other three kinds, a target
mismatch, a false or failed matcher, or a failed extension renderer keeps the
first-party element.

The mapped contexts preserve the exact ChatGPT owner data. Every assistant
content context includes a canonical `ThreadLocator`; a cloud locator uses the
signed-in account and optional workspace, and an execution locator uses the
exact host. A content reference uses the message identity at its reference
index. A directive includes its exact instance ID, leaf or container kind, and
terminal-inline state. A code block includes its open-fence and streaming
state, and its info value stays an optional raw string. A typed conversation
item includes standalone or grouped layout.

The live step must use direct ChatGPT v5 `NODE_OPTIONS` injection. It must not
start or call ChatGPTX. It must prove real UI interaction, deep immutable JSON,
per-owner invalidation and remount without remounting other owners, the two
directive fallback paths, the three matcher-capable fallback paths, and
deterministic disposal. A static source match or a successful TypeScript build
cannot make these API points available by itself.

The direct launcher and `run-gate` use the same startup path:
`NODE_OPTIONS=--require runtime/bootstrap.cjs`. The gate does not add a second
preload, parser, transcript, or extension loader.

## Extension entries

An extension package can declare three entries:

- `main`: `dist/main.cjs` runs once in Electron main after `app.whenReady()`.
- `renderer`: `dist/renderer.cjs` runs in each eligible renderer document while
  the extension is enabled.
- `settings`: `dist/settings.cjs` runs in each eligible renderer document even
  when the normal main and renderer entries are disabled.

Each entry exports `activate(context)`. It can also export `deactivate()`.
Failed activation aborts the entry lifetime and starts best-effort cleanup.
Each full main-frame document gets a new document ID. A full navigation,
`pagehide`, an ineligible replacement, or destroyed web contents disconnects
the old document. `pagehide` also deactivates its renderer and settings entries
in reverse activation order. A same-document navigation keeps the current ID
and activation. App exit aborts main lifetimes. An enablement change applies at
the next app start.

The renderer entry receives ChatGPT product APIs and UI callbacks. The settings
entry receives the same renderer context and registers its manifest section.
The main entry receives the live Electron namespace, Node, the host `objc-js`
module, native resource leases, and the main side of its renderer channel.

## Dependencies and output

Extension source is a normal npm package. Add JavaScript libraries to that
package and import them from the source entry.

The repository builder uses esbuild and writes one package to
`extensions/<id>/dist`:

- renderer and settings entries are self-contained browser CommonJS bundles;
- the main entry is a Node CommonJS bundle;
- normal JavaScript dependencies are bundled into each entry that imports
  them;
- `node:*`, `electron`, `electron/main`, and `electron/common` stay external in
  the main bundle and resolve to the host runtimes;
- direct `objc-js` imports are rejected. Main entries use the host module from
  `MainExtensionContext.objc`.

An extension must not import ChatGPT hashed chunks or use ChatGPT's
`node_modules` as its dependency contract. A foreign native `.node` module is
not a supported in-process dependency. Use `MainExtensionContext.objc` or a
separately signed helper.

## Public API and ChatGPTX seams

`@chatgptx/api` describes stable user-visible concepts. Examples include
threads, messages, selections, settings, menus, surfaces, files, projects,
accounts, and native runtime information. The exact-build binding owns the
current REST paths, RPC names, React modules, host item IDs, and hashed files.

Most implemented UI operations connect to a ChatGPT mechanism that already
exists:

- a list transform changes an app-owned descriptor list before ChatGPT renders
  it;
- a definition registration adds data to a matching ChatGPT owner;
- a render contribution supplies content to a named owner slot.

The current examples need a small set of ChatGPTX-owned seams where ChatGPT has
an owner but no general extension registry:

- header CSS-property composition at the existing app-shell header and panel
  header owners;
- sidebar-row mounts at the first-party `titlePrefix` and
  `priorityIndicatorNode` owners;
- a serialized session queue around ChatGPT's native color-picker component;
- an extension settings registry that feeds the existing settings navigation,
  group, row, native-control, and search owners.

These seams keep ChatGPT as the render owner. They do not create new product
surfaces. The complete implemented and candidate surface matrix is in
[SURFACES.md](./SURFACES.md).

## ChatGPTX host services

Storage and extension management are host services. They are not ChatGPT
product APIs and they do not belong to an exact-build binding.

`context.storage` is scoped to the calling manifest ID. It supports sorted
recursive file listing, UTF-8 reads, atomic mode-0600 writes, and deletion.
Paths must be non-empty POSIX-relative paths. They cannot escape the extension
root or pass through symbolic links. Main, renderer, and settings entries for
one extension use the same storage root.

`context.extensions` lists every package in the launch configuration, including
disabled and required packages. Results are sorted by ID. `setEnabled()`
updates next-start state with an atomic launch-configuration write. It rejects
unknown IDs and an attempt to disable a required extension. The runtime scopes
each call from the loaded manifest identity. Renderer and main contexts use one
shared in-memory launch state, so later `list()` calls in either process see an
enablement change. The runtime does not activate or unload an entry until the
next app start.

All `context.storage` methods, `context.extensions.list()`,
`context.extensions.setEnabled()`, and `context.runtime.getInfo()` accept
`RequestOptions`. A pre-aborted signal rejects before work starts. Renderer
requests check the signal again after the host reply, so an abort while waiting
rejects the returned promise. It does not cancel or roll back host work that
already started.

Each renderer activation also has a JSON channel to its own main entry.
`context.main.invoke()` calls a method that the main entry registered through
`context.renderers.handle()`. Main can send to one renderer or broadcast to all
connected renderers for that extension. Functions, DOM nodes, React values,
and Electron objects cannot cross this channel. Main activation starts before
the runtime attaches already loaded renderer documents, and renderer attachment
does not wait for main activation. A later `onRendererChange()` listener gets a
microtask replay of each renderer that is already connected. If the first
renderer needs a main request handler, register that handler before the first
`await` in main activation. Connection replay does not replay a missed request.

## Current implemented slice

The direct exact-build renderer adapter reports these operations as available:

- current thread read and thread-selection events for
  `context.document.windowId` only;
- thread-header menu transform;
- signed-in ChatGPT sidebar thread-row menu transform;
- assistant-selection action transform and local response annotation;
- native color picker and light or dark appearance read;
- header background and foreground property registration;
- sidebar thread-row `titlePrefix` and priority-indicator renders;
- extension-only settings read, write, and events, plus settings navigation;
- command registration and the exact exported
  `NativeSettingsControlsSectionDefinition` for native toggle, text, select,
  command-button, and disclosure-button rows;
- `assistant-directive`, `assistant-content-reference`, `assistant-code-block`,
  and typed `conversation-item` definition mappings at ChatGPT's existing
  owners;
- runtime information, scoped storage, extension listing and enablement, and
  the renderer-to-main channel, with `RequestOptions` on the host-service reads
  and writes listed above.

Definition discovery reports `supportedDefinitionShapes: ["native-controls"]`
for `settings-section`. The current adapter rejects the broader candidate
settings-section shapes. See [SURFACES.md](./SURFACES.md) for the exact fields
and controls that this shape accepts. Registration accepts only
`NativeSettingsControlsSectionDefinition`, and its local `id` must be non-empty
and contain no dots.

The current settings store accepts only an omitted scope or
`{ kind: "extension" }`. `settings.listSections()` is unavailable. Settings and
thread subscriptions accept a signal that disposes the subscription. They also
accept `afterCursor`, but every previous cursor is expired in this binding. The
adapter sends a `cursor-expired` reset and then a fresh snapshot. Implemented
settings operations and `threads.getCurrent()` check request aborts before work
and again before they return.

A call to a declared renderer API member that this binding does not attach
throws `ChatGPTXApiError` with code `capability-unavailable`. Capability-change
subscriptions accept `afterCursor`, but all earlier cursors expire. They send a
`cursor-expired` reset and then a global capability snapshot. Abort or renderer
deactivation stops delivery. UI discovery evaluates the global scope, the
current renderer window, and a thread scope with no window or the current
window. Cloud thread scope is available only for the signed-in ChatGPT
`sidebar.thread-row.menu`, `sidebar.thread-row.title-prefix`, and
`sidebar.thread-row.priority-indicator` points. It reports another window and
every other unbound owner scope as unavailable.

Other declarations describe the planned stable contract. Discovery returns
the complete contribution catalog and marks an unattached point as
`unavailable`. Static evidence in a ChatGPT bundle does not make a point
available.

## Stability rules

1. A public name represents a product concept, not a minified host symbol.
2. Each ChatGPT build has one exact adapter and one observed-build record.
3. A capability reports build, app-server, account, host, and feature
   availability.
4. An unavailable operation throws `ChatGPTXApiError` with code
   `capability-unavailable`. It does not use a hidden fallback.
5. Thread and project references include their scope. A bare ID does not cross
   the public API.
6. Renderer callbacks run in the renderer. Native objects stay in main.
7. Registrations have deterministic order, invalidation, and cleanup.
8. A list transform receives the app items. An unknown item stays opaque so an
   extension can keep, move, or remove it without decoding it. An app-owned
   thread-menu separator stays a public separator so a transformer can insert
   an item before it.
9. A public UI point stays unavailable until its attachment, action, remount,
   disposal, and native or React path pass the required live tests.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for activation and the complete
contribution inventory, [CALLBACKS.md](./CALLBACKS.md) for callback rules,
[NATIVE.md](./NATIVE.md) for main-process access, and
[builds/26.825.51511.md](./builds/26.825.51511.md) for exact-build evidence.
