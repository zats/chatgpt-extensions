# Events and contribution callbacks

Status: direct adapter for the current example callbacks and candidate contract
for the remaining callbacks. Unit tests cover the adapter shapes. This file does
not claim a direct-runtime live UI result that the build record does not list.

## Where functions run

Event listeners, list transformers, action handlers, definition callbacks, and
render providers run as normal JavaScript functions in the extension's renderer
entry. The exact-build renderer adapter and the extension are in the same
ChatGPT main world. These functions do not use IPC.

The renderer can call its extension's main endpoint through `context.main`. A
call rejects when no active main entry registered the method. This channel uses
JSON requests and events. A function, DOM node, React value, `Range`, or Electron
object never crosses it.

The exact `26.825.51511` native-main live probe confirms this boundary. Its
main entry received the same Electron singleton as ChatGPT, Node `24.14.0`, and
the bundled `objc-js`. Its renderer completed main calls, cancellation,
targeted events, and broadcast events. The gate also confirmed renderer owner
identity and deterministic native resource cleanup.

## Current-thread callbacks

The direct adapter implements `threads.getCurrent()` and `threads.events` for
the renderer document's window. `getCurrent()` accepts only
`context.document.windowId`; a different window ID is unavailable and does not
read the host. It checks an optional request signal before and after the host
read.

`threads.events.subscribe()` sends one current-window snapshot, then selection
events from the same first-party owner. A pre-aborted signal rejects before a
host subscription starts. A later abort disposes the host subscription and
stops callbacks. Renderer deactivation does the same. The current binding
accepts `afterCursor`, but all previous cursors expire. It first sends `reset`
with reason `cursor-expired`, then sends a fresh snapshot.

The direct extension-settings event source has the same signal and cursor
rules. It accepts only `{ kind: "extension" }`. It sends its settings snapshot
after the extension store loads. With `afterCursor`, all previous cursors
expire. It first sends `reset` with reason `cursor-expired`, then sends the
fresh snapshot. It stops callbacks after signal abort or renderer-phase
deactivation.

## Capability callbacks

`runtime.capabilities.changed.subscribe()` accepts an optional signal and
`afterCursor`. Every earlier cursor expires in this binding. A resumed
subscription first receives `reset` with reason `cursor-expired`, then a fresh
global capability snapshot. A pre-aborted signal throws before subscription
setup. Later abort or renderer deactivation disposes the subscription and
prevents queued delivery.

## Assistant-message lifecycle

This section defines the candidate stable mapping. The current direct adapter
does not publish `messages.assistantEvents`; it reports the message-stream
capability as unavailable.

`messages.assistantEvents(scope)` normalizes two current backends. One renderer
activation can cover its current window or one thread in that window:

| Public event | Local Codex source | ChatGPT cloud source |
| --- | --- | --- |
| `started` | `item/started` for `agentMessage` | first in-progress assistant snapshot |
| `updated` | ordered `item/agentMessage/delta` plus adapter accumulator | cumulative decoded message snapshot |
| `finished` | `item/completed` after queued text drains | candidate mapping from terminal callback after decoder drain and final state read |

The local app batches React state writes by animation frame. Its raw manager
notifications still arrive in order. The adapter keeps its own item accumulator
and does not read React state after each delta. The host defers item completion
until queued text drains, so `finished` follows all preceding updates.

The cloud decoder emits complete message snapshots. They are not append-only.
The public `updated.message` is therefore always the complete current message.
`appendedText` is present only when the adapter proves that the previous text is
an exact prefix. `message_stream_complete` ends a conversation stream; by itself,
it does not prove that one message finished.

For the cloud foreground stream, the candidate finish rule is: the start
or resume operation calls its terminal callback, all serialized decoder work has
finished, and the adapter can read the last assistant snapshot for that request.
Error and cancellation callbacks finish the last known assistant snapshot with
their matching outcome. Static code supports this mapping, but live fixtures
must prove final-message identity and ordering before the binding is published.

```ts
const stop = context.api.messages.assistantEvents({
  kind: "window",
  windowId: context.document.windowId,
}).subscribe((record) => {
  if (record.type !== "event") return;

  const event = record.value.event;
  if (event.type === "started") {
    console.log("assistant started", event.message.messageId);
  } else if (event.type === "updated") {
    renderPreview(event.message);
  } else {
    console.log("assistant finished", event.outcome);
  }
});

context.lifetime.addEventListener("abort", stop, { once: true });
```

The snapshot lists active assistant messages. A cursor reset gives the extension
a new canonical snapshot after a renderer remount or missed sequence.

## Rich assistant and conversation content

The direct adapter maps four extension definition kinds to the existing
ChatGPT content owners:

| Definition kind | First-party owner | Public value |
| --- | --- | --- |
| `assistant-directive` | Assistant Markdown directive component map | `AssistantDirectiveUiContext.directive` as `AssistantDirectiveValue` |
| `assistant-content-reference` | Assistant Markdown content-reference dispatcher | `AssistantContentReferenceUiContext.reference` as `AssistantContentReference` |
| `assistant-code-block` | Assistant fenced-code component and its rich-block path | `AssistantCodeBlockUiContext.codeBlock` as `AssistantCodeBlockValue` |
| `conversation-item` | Typed conversation-item dispatcher | `ConversationItemUiContext.item` as `ConversationItem` |

An `AssistantDirectiveDefinition` selects one exact directive `name`. An
`AssistantContentReferenceDefinition` selects one content-reference `type` and
can apply a synchronous `matches` predicate. An `AssistantCodeBlockDefinition`
can select one `language` and can apply a synchronous `matches` predicate. A
`ConversationItemRendererDefinition` selects one item `type` and can apply a
synchronous `matches` predicate. These definitions replace only the matching
first-party element. They do not add a generic transcript insertion point.

The value on `context.directive`, `context.reference`, `context.codeBlock`, or
`context.item` is an immutable JSON snapshot. It contains the host data that
the extension needs to decide and render. It does not expose a host store,
React value, callback closure, or mutable raw object. An unknown typed item
uses `OpaqueConversationItem.data` so an extension can render a new host item
before ChatGPTX adds a named public item type.

Assistant directive, content-reference, and code-block contexts include a
canonical `thread` locator. It has the exact execution host or the signed-in
cloud account and optional workspace. Directive callbacks receive both leaf
and container values. Code-block callbacks receive streaming and open-fence
state. Conversation-item callbacks receive standalone or grouped layout.

The exact-build probe renders eight variants through these four definition
kinds: leaf and container directives, a content reference, complete and
streaming code blocks, standalone and grouped execution items, and a cloud
item. It verifies the canonical assistant `thread` locator, immutable values,
interaction, invalidation, replacement, final disposal, and first-party
fallback. The `26.825.51511` isolated live run recorded 49 lifecycle events.

The adapter keeps ChatGPT's original element as the fallback. A directive uses
ChatGPT's name-keyed component map and has no matcher. An unregistered
directive name or a failed directive renderer keeps the first-party directive.
For the other three kinds, the adapter keeps the first-party element when there
is no matching definition, `matches` returns `false`, a matcher throws, or
extension rendering fails. A matcher or renderer failure is reported against
that extension and does not blank the assistant message or stop another
conversation item.

Each definition uses `UiRenderProvider`. The adapter gives the provider a
committed container, the typed context, and an abort signal. The provider must
mount synchronously. The adapter aborts the signal and calls the returned
disposer before a remount, owner unmount, registration disposal, renderer
deactivation, or document teardown removes the container.

`UiRegistration.invalidate(ownerId)` remounts the matching owner with a fresh
snapshot without changing registration identity. A change in the host value
also gives the renderer a fresh snapshot. Extension code must not retain the
old snapshot as live host state.

## Assistant text selection

The current direct adapter publishes the action transform used by Reactions.
It does not yet publish the full `started`, `changed`, and `ended` selection
event stream described below.

The current positioner listens to selection, keyboard, pointer, scroll, resize,
and double-click events. It evaluates through `requestAnimationFrame`. Its
native `onOpen` callback only reports the first valid selection and has no end
callback. The proposed adapter must add a session registry at this owner.

The stable lifecycle is:

1. `started`: a non-empty range first maps to one assistant message.
2. `changed`: text, range, target, or viewport geometry changes in that owner.
3. `ended`: the selection collapses, changes owner, navigates, unloads, or its
   real owner unmounts.

The adapter keeps one selection ID while the owner is unchanged. If the range
moves to another assistant message, it ends the old session and starts a new
one. It rejects user-message, cross-message, content-editable, invisible, and
fully clipped selections.

React can clean up and restore a component during a remount. The adapter delays
owner cleanup by one microtask and compares a session token. This avoids a false
end and start pair only when the replacement owner mounts before that microtask.
A later virtualization or route remount starts a new selection session. Changes
follow the host animation-frame cadence.

The public snapshot contains semantic text, message identity, and viewport
rectangles. It does not contain a live DOM `Range`. The direct adapter maps the
current Codex response-annotation operation used by Reactions. This does not add
proof for remote Codex or consumer ChatGPT cloud. A cloud selection uses a
different composer flow, so an unsupported call must fail with
`capability-unavailable`.

## Thread menus

The current app has three thread-header owners: local Codex, remote Codex, and
ChatGPT cloud. Each builds its own item list and sends descriptors to the same
menu adapter. That adapter supports checkboxes, separators, nested submenus,
accelerators, icons, disabled items, danger tone, native Electron menus, and a
React fallback.

The signed-in ChatGPT sidebar thread-row owner builds another descriptor list
with `surface: "sidebar"`. It passes that list through the row's
`renderActions` prop. The direct row context menu and its hover `Chat actions`
button both enter the existing generic menu component.

App-owned separators remain public `{ kind: "separator" }` items during a
transform evaluation. They do not become opaque items. A transformer can find
a separator and insert an extension action before it, while the adapter keeps
the original native separator when it maps the result back to ChatGPT.

A complete exact-build hook must wrap each supported owner's `getItems` before
the generic menu component normalizes the list. This preserves the app's menu
renderers and its current action closures. The direct adapter attaches the
persisted-Codex header owner and the signed-in ChatGPT sidebar row owner. The
remote Codex and ChatGPT cloud header owners, and other sidebar owner families,
remain unavailable.

The app shell also has a direct `HeaderContextMenuItem` registry, but it covers
only entries composed through that shell. It does not expose the complete local
Codex, remote Codex, or ChatGPT cloud thread menu. The owner wrappers remain
necessary for one semantic point that can inspect and transform all three full
lists.

The public contract combines the narrower registry with
`"thread.header.menu"`. The exact-build adapter can use that registry where the
owner already composes it, then transform the final list from the local Codex,
remote Codex, or ChatGPT cloud owner.
Publishing both mechanisms would duplicate extension items and create two
ordering models for one visible menu.

`contributions.transform("thread.header.menu", transformer)` receives the full
semantic descriptor list when a header menu opens. A transformer can add, move,
replace, wrap, or remove items. The header owner evaluates this list
synchronously. Long work belongs in an action callback.

`contributions.transform("sidebar.thread-row.menu", transformer)` receives the
signed-in row's account-scoped cloud thread context. The row menu accepts an
asynchronous transform result because its first-party `getItems` path is
asynchronous. Opening a menu does not select that row. Only the app's selected
row updates the current-thread state used by the header.

For both menu points, the evaluation signal aborts when the menu closes or its
result becomes stale. The `"assistant-selection.actions"` transformer is also
synchronous because it runs in the selection overlay render path.

Registrations compose in deterministic extension activation order. The adapter
maps owner-specific built-in IDs, such as the local Codex and ChatGPT cloud
rename IDs, to one stable public ID. It namespaces new extension IDs. It rejects
duplicate or foreign extension IDs. One failed transformer or action is
reported and skipped without stopping other extensions.

Each menu open gets new host descriptors and current host action closures. The
adapter does not cache an `onSelect` closure across a React remount. The native
menu returns only the selected item ID. If it does not report input source or
modifier keys, `UiActivation.source` is `unknown` and modifiers are absent.

```ts
const registration = context.api.contributions.transform(
  "thread.header.menu",
  (items, header) => {
    if (!header.thread) return items;

    return [
      ...items,
      { kind: "separator", id: "reveal-separator" },
      {
        kind: "action",
        id: "reveal-working-directory",
        label: "Reveal Working Directory",
        onActivate: async () => {
          const thread = await context.api.threads.get(header.thread!.ref);
          const path = thread.execution?.cwd;
          if (!path) return;
          await context.main.invoke("reveal-path", { path });
        },
      },
    ];
  },
);

context.lifetime.addEventListener(
  "abort",
  () => registration.dispose(),
  { once: true },
);
```

A pending local worktree can show a header before it has a durable thread ID.
For that state, `ThreadHeaderContext.kind` is `pending-thread` and `thread` is
`null`. An extension can still add a general action.

## Other composition callbacks

The same `ContributionsApi` uses the closest ChatGPT mechanism for each area:

- `transform` changes an app-owned descriptor list. Current thread menus, the
  sidebar destination builder, and the panel picker have such lists.
- `register` adds an addressable definition. Current right and bottom panel
  types map to the first-party panel registry. `main-route` definitions update
  the external registry read by the one wildcard route that the build hook
  installs before ChatGPT creates its router. A `message-action` definition
  maps to the existing additional or persistent action-node prop and uses the
  first-party action control. Rich assistant and conversation definitions map
  to the current directive, content-reference, fenced-code, or typed-item
  dispatcher before its first-party renderer runs.
- `render` supplies a provider and native slot options to a named direct-JSX
  slot, such as a header action or composer utility position. The proposed
  external registry only gets the owner to call the provider; it does not add
  another view system.

A transformer receives a fresh app-owned list, a typed semantic owner, and an
evaluation signal each time the owner evaluates it. The adapter aborts the
signal and ignores a late result after menu close, invalidation, owner unmount,
registration disposal, or a newer evaluation. A render provider receives a
committed container, an abort signal, and the same owner context. Its returned
disposer runs before a controlled owner unmount or document teardown removes
the container. `pagehide` deactivates registered renderer entries in reverse
activation order. It must mount synchronously; later asynchronous work observes
the abort signal. A renderer crash uses process teardown and cannot run
callbacks.
`UiRegistration.invalidate()` asks the owner to evaluate the same registration
again without changing identity or order. For a registered definition, it also
refreshes callback-derived availability, visibility, disabled state, and panel
title or icon getters.

These callback rules are candidate contract rules. Each point stays unavailable
until a live adapter test proves evaluation order, remount cleanup, action
dispatch, and the native or React path that the owner can select.

The direct adapter implements the persisted-Codex header-menu,
selection-action, row-render, and four rich-content definition shapes. It also
implements the signed-in ChatGPT row-menu, `titlePrefix`, and
priority-indicator shapes. Thread Colors uses the row menu and priority
contribution for both local execution rows and signed-in cloud rows. If a row
has no native priority, the adapter sends the mount through
`overlayMetaContent` and places it as an absolute full-height row child. This
avoids ChatGPT's reserved leading title slot. If the row already has a native
priority, the adapter composes both views in `priorityIndicatorNode` because
that slot is already reserved. Contribution discovery still returns the full
public catalog and marks any other point unavailable until its complete
callback contract passes these tests.

## Status callback ownership

The first-party toast service is renderer-local. Each show method returns one
`ToastHandle`. `close()` and `dispose()` are the same idempotent operation. They
close that concrete toast. `closeAll()` closes only the toasts in the calling
renderer document's first-party toaster; it does not affect another window or
desktop notifications.

`onRemove` runs once when the concrete toast auto-closes, is closed, is replaced
by a toast with the same logical ID, is included in `closeAll()`, or is removed
with its renderer owner. A custom toast uses the normal synchronous
`UiRenderProvider` rule: its abort signal fires before removal and its returned
disposable runs before the adapter removes the mount container.

The AppHost notification service has a different lifetime. `show()` returns a
listener lease. Disposing it stops extension callbacks but does not hide the
macOS notification. The lease also ends when ChatGPT removes that notification.
`hide()` performs the visible removal and ends its listener. A match with both a
thread and a navigation destination uses the host's union behavior: it hides
notifications that match either value.

Status callbacks run in the renderer entry. Renderer unload disposes their
listener and render leases. It does not synthesize an action callback. Extension
code must call `hide()` when it also wants a desktop notification removed.

Capability mappings are direct: the four toast severity methods and `custom()`
require `toasts.show`;
`ToastHandle.close()`, `dispose()`, and `closeAll()` require `toasts.close`;
notification `show()` requires `notifications.show`; and `hide()` requires
`notifications.hide`.

## Imperative surface callback ownership

`OpenSurfaceOptions.trailingContent`, `onMove`, and `onClose` belong to the
renderer activation that called `surfaces.open()`. They stay live until the
surface instance closes or that renderer lifetime aborts. `onClose` runs at most
once when the instance closes while its owner activation is live. `onMove` runs
for each first-party panel move during that lifetime. An aborted owner discards
both callbacks without a final synthetic call.

These functions and `trailingContent` are not durable-route data. A restored
tab gets serializable props and state through its registered surface definition;
it does not restore callbacks from an earlier document. The normal render
provider abort and disposer rules apply when trailing content unmounts.

## Attachment rules

The complete v5 adapter must attach to the local Codex, remote Codex, and
ChatGPT cloud owner components. It must not patch the ellipsis DOM button, patch
only one hashed module, or patch every shared menu instance without owner
context.

For a point that needs an external registry, the registry lives outside React.
A version counter and `useSyncExternalStore` refresh the first-party owner.
A rich-content hook must match one exact first-party owner shape. It must not
interpret rendered Markdown DOM, search text nodes, or replace the complete
message component. A new ChatGPT build is unavailable until static owner
anchors and the isolated public-extension probe both pass for all four
definition kinds and their first-party fallback paths.
A full main-frame navigation gives the next document a new ID and ends the old
document's renderer subscriptions and registrations. `pagehide`, an ineligible
replacement, and destroyed web contents disconnect the old main channel. A
same-document navigation keeps the current ID, activation, and callbacks.

The current-build anchors and hashes are in
[builds/26.825.51511.md](./builds/26.825.51511.md).
