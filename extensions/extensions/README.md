# Extensions manager

The Extensions package is required. Its normal renderer entry registers one
`NativeSettingsControlsSectionDefinition`. Each non-required extension has an
enablement toggle. Required extensions have a disabled toggle. A change updates
the launch configuration and applies after ChatGPT restarts.

The list contains every selected package except the manager itself, including
disabled packages. It is sorted by extension ID. The manager refreshes the list
when the renderer window regains focus. Repeated focus events use one queued
refresh. If an extension declares a settings section, its row has a native
disclosure destination that opens that section.

There is no manual refresh control. The launch configuration cannot hot-load
extension code, and startup and window focus already refresh the displayed
state.

The package uses `context.extensions.list()` and
`context.extensions.setEnabled()`. These are ChatGPTX host services, not
ChatGPT product APIs. The runtime derives the caller from the loaded manifest.
All installed extensions are trusted. The service rejects an unknown ID and an
attempt to disable a required package. Renderer and main contexts use this same
mutable launch state. A later list in either context sees a change, but the
runtime does not hot-load or hot-unload an extension.

The manager mirrors enablement values in the extension-only settings scope and
listens to that scope without passing `afterCursor`. Its native search entries
omit IDs. Extension settings destinations are fully qualified, so the adapter
passes them through without adding the manager's namespace.

The source imports only `@chatgptx/api`. The workspace build writes the normal
runtime package to `extensions/extensions/dist`. Focused behavior tests cover
the model refresh queue, toggle state, required-package handling, settings
destinations, and cleanup.

Runtime tests cover the shared renderer-and-main management state and
`RequestOptions` abort checks. The manager's focused tests cover its UI model;
they do not claim a main-entry live test.

An isolated test on 2026-08-30 proved the native Extensions section, both
example toggles, and navigation from the Reactions disclosure to the native
Reactions settings controls.
