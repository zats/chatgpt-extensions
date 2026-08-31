# Extension development

Each extension is a normal npm workspace package. Its source imports the public
`@chatgptx/api` package. It does not import ChatGPT hashed modules.

## Package entries

The source `package.json` has an npm-safe `name`, a user-facing `displayName`,
an extension `id`, and a `chatgptx` object. It can declare:

- `main: "dist/main.cjs"` for `src/main.ts`;
- `renderer: "dist/renderer.cjs"` for `src/renderer.ts`;
- `settings.renderer: "dist/settings.cjs"` for `src/settings.ts`;
- one extension-local settings `sectionId`;
- the product and native capabilities that the package uses. ChatGPTX host
  services on the extension context are not declared as capabilities.

At least one entry is required. The builder validates fixed output names. The
packaged manifest in `dist/package.json` uses paths relative to `dist/`.

The runtime behavior is:

- an enabled main entry runs once in Electron main after `app.whenReady()`;
- an enabled renderer entry runs in each eligible ChatGPT `app:` document;
- a declared settings entry runs in each eligible document even when the
  normal entries are disabled.

Each bundle exports `activate(context)` and can export `deactivate()`.

Each full main-frame document has a unique `context.document.id`. A
same-document navigation keeps the current activation. Full navigation and
`pagehide` disconnect the old document, and `pagehide` deactivates its renderer
entries in reverse activation order.

Main entries activate in deterministic sequence, but their promises do not
block renderer attachment. `context.renderers.onRendererChange()` replays
already connected renderers in a microtask. A main entry can therefore wait for
its first renderer during activation. If that renderer must call a main handler,
register the handler before the first `await`; connection replay does not replay
a missed request.

Storage methods, extension listing and enablement, runtime information,
implemented settings calls, and the current-thread read take optional request
signals. Pass a lifetime signal when work has no value after the entry stops.
Abort rejects the call. It does not undo host work that already completed.

The current adapter reads only the current renderer window through
`threads.getCurrent(context.document.windowId)`. Thread and settings event
subscriptions accept a signal that disposes them. They accept `afterCursor`,
but every previous cursor expires. Expect a `cursor-expired` reset followed by
a fresh snapshot.

For a settings section, inspect `supportedDefinitionShapes` before
registration. The current exact binding reports only `native-controls` and
accepts only `NativeSettingsControlsSectionDefinition`. Its local definition
`id` must be non-empty and contain no dots. Settings data uses extension scope
only, and `settings.listSections()` is unavailable. Dotted destination IDs pass
through, built-in IDs map to `codex.settings.<id>`, and other undotted IDs get
the calling extension's namespace. Search entries omit `id`. A destination-only
button cannot have `disabled` because it produces a disclosure row without a
button control.

## Dependencies

Add normal JavaScript runtime libraries to the extension package's
`dependencies` and import them from TypeScript. The builder uses esbuild:

- renderer and settings dependencies become part of self-contained browser
  CommonJS bundles;
- normal main-process JavaScript dependencies become part of `main.cjs`;
- `node:*`, `electron`, `electron/main`, and `electron/common` stay external so
  the main entry uses the host runtimes;
- direct `objc-js` imports are rejected. Use `context.objc`, which is the
  host-provided module.

Do not add Electron as code inside the output. Use Electron types as a
development dependency. Do not depend on ChatGPT's own `node_modules` tree.

## Build and tests

From the v5 root:

```sh
npm install
npm run typecheck
npm run build
npm test
```

The build writes the normal runtime package to `extensions/<id>/dist`. This is
the only compiled extension package. The direct v5 runtime loads this package
for both normal use and the version gate.

## Direct ChatGPT launch

Build the runtime and all extensions, then start stock ChatGPT:

```sh
npm run build
node scripts/start.mjs start --app /Applications/ChatGPT.app
```

To load other compiled extension packages, add one `--extension` option for
each package directory. Relative paths resolve from the current directory. The
three standard v5 extensions remain loaded:

```sh
node scripts/start.mjs start \
  --app /Applications/ChatGPT.app \
  --user-data-dir /private/tmp/chatgpt-v5-profile \
  --extension ./test-fixtures/ui-surface-probe/dist \
  --extension /absolute/path/to/another-extension/dist
```

The start command prints an absolute `Session:` path. Keep that exact path. The
script starts the stock ChatGPT executable with a repository-owned exact-build
binding, extension storage directory, launch configuration, and owned process
group. It loads these normal packages:

- `extensions/extensions/dist` for the required Extensions manager;
- `extensions/reactions/dist` and its settings entry;
- `extensions/thread-colors/dist`.

The start command also waits for each added renderer and settings entry to
activate. A failed added entry makes the isolated launch fail.

Use the session path for status and cleanup:

```sh
node scripts/start.mjs status <absolute-session-path>
node scripts/start.mjs stop <absolute-session-path>
```

`start` waits for normal renderer and settings activation. It does not prove
arbitrary UI behavior. Use `node scripts/start.mjs run-gate` for an exact-build
acceptance check. The gate requires explicit stock app, binding, private Codex
home, five compiled extension packages, and a result file. It uses a temporary
profile, refuses to run while ChatGPTX is active, exercises the Rich Message,
UI Surface, Thread Colors, and Reactions paths, stops its owned process, and
removes its temporary session.

The direct launch requires the exact OpenAI bundle identifier, signing team,
strict code signature, Gatekeeper approval, ChatGPT version, bundle build,
`app.asar`, and binding digest. A binding mismatch leaves ChatGPT running
without v5 extensions. An app identity or signing failure prevents launch.
