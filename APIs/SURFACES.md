# Surface hierarchy and support matrix

Status: direct adapter implementation with separate static discovery notes.
"Implemented" in this file means that code exists in the exact adapter. It does
not mean that a live UI test has passed unless the build record states that
result.

```text
Native window
└─ Product shell
   ├─ Mode: ChatGPT | Work | Codex
   ├─ Primary sidebar
   │  ├─ Destination rows
   │  ├─ Pinned and custom sections
   │  └─ Projects, chats, and tasks
   └─ Main route tree
      ├─ Home or product page
      │  ├─ New-chat suggestion cards or list
      │  ├─ Ordered home announcements
      │  └─ Composer utility, action, and footer rails
      └─ Thread workspace
         ├─ Header actions and ellipsis menu
         ├─ Chat and transcript
         │  ├─ Message action rows
         │  ├─ Assistant selection overlay
         │  ├─ Assistant directives, content references, and code blocks
         │  ├─ Typed conversation items
         │  └─ Composer controls
         ├─ Active right panel tab
         └─ Active bottom panel tab
```

The chat region, one right tab, and one bottom tab can be visible at the same
time. The pinned chat and thread summary are host-owned regions. They are not
movable tabs.

## Direct support by product owner

The direct adapter connects to the persisted-Codex owner family and the
signed-in ChatGPT sidebar thread-row owner. The current bundle also contains
remote Codex and ChatGPT header owners, but static presence is not an active
binding.

| Capability or surface | Persisted local Codex | Remote Codex | Consumer ChatGPT cloud |
| --- | --- | --- | --- |
| Current thread identity and selection events | Implemented | Not attached | Implemented; live test passed for the selected signed-in row |
| Thread-header menu transform | Implemented | Owner found; not attached | Owner found; not attached |
| Header background and foreground properties | Implemented at the app-shell and panel-header owners | No thread-identity proof | Implemented through selected-row identity; live test passed |
| Sidebar thread-row menu transform | Not attached | Not attached | Implemented for signed-in rows; live test passed |
| Sidebar thread-row leading accent | Implemented for persisted rows | Not attached | Implemented at the signed-in row owner; live test passed with a 3 px full-height bar and unchanged title alignment |
| Assistant-selection action transform | Implemented | Owner needs a direct test | Owner found; not attached |
| Response annotation from a selection | Implemented for the current Codex annotation path | Static mapping only | Different composer path; unavailable |
| Native color picker | Implemented as an app-level native component | Same app-level service | Same app-level service |
| Extension settings sections and controls | Implemented as app-level owners | Same app-level service | Same app-level service |
| Scoped storage and extension management | Implemented by the v5 host | Same host service | Same host service |
| Main entry, Electron, Node, and `objc-js` | Implemented by the v5 main host | Same main process | Same main process |

The current direct runtime has implemented activation paths and unit-test
coverage. The table does not add proof outside the stated signed-in cloud row
owner. The exact build record keeps the available static and live evidence
separate.

## Contribution points

| Public point or definition | ChatGPT mechanism | Direct state |
| --- | --- | --- |
| `home.new-chat-suggestions` | Final item list consumed by `HomeSuggestionSurface` | Implemented; isolated live test passed |
| `home.announcements` | Ordered entries consumed by `HomeComposerAnnouncements` | Implemented; isolated live test passed |
| `sidebar.destinations` | Primary-sidebar `availableDestinations` list | Implemented; isolated live test passed |
| `sidebar.product-mode.menu` | Synchronous native menu for the `app.work` and `app.codex` rows | Implemented; isolated live test passed |
| `assistant-selection.actions` | Selection-overlay action descriptor list | Implemented for the current persisted-Codex path |
| `assistant-directive` | Assistant Markdown directive component map | Implemented at the exact Markdown owner with first-party fallback |
| `assistant-content-reference` | Assistant Markdown content-reference dispatcher | Implemented at the exact dispatcher with first-party fallback |
| `assistant-code-block` | Assistant fenced-code component and rich-block path | Implemented at the exact code-block owner with first-party fallback |
| `conversation-item` | Typed conversation-item dispatcher | Implemented at the exact item owner with first-party fallback |
| `thread.header.menu` | Header descriptor list before the shared menu adapter | Implemented for the current persisted-Codex path |
| `sidebar.thread-row.menu` | Context-menu descriptor builder at the signed-in ChatGPT row owner | Implemented for signed-in ChatGPT cloud rows |
| `sidebar.thread-row.title-prefix` | Leading view through the first-party row's `titlePrefix` prop | Implemented for persisted Codex rows and signed-in ChatGPT cloud rows |
| `sidebar.thread-row.priority-indicator` | Priority view through the first-party row owner. With no native priority, the adapter uses `overlayMetaContent` and repositions the mount in the row without reserving a title slot. With a native priority, it composes into `priorityIndicatorNode`. | Implemented for persisted Codex rows and signed-in ChatGPT cloud rows; the exact live gate passed standard, taller activity, and cloud rows |
| `command` | Extension command registry used by native settings controls | Implemented |
| `composer-action` | First-party button and menu components in composer rails | Implemented; isolated live test passed |
| `settings-section` | Existing settings navigation, group, row, native-control, and search owners | Partially implemented through the exported `NativeSettingsControlsSectionDefinition`; discovery reports the `native-controls` shape |
| All other IDs in `contributions.d.ts` | Observed owner or candidate contract | Reported as unavailable |

Discovery returns all declared point and definition IDs. This lets an extension
inspect the complete API catalog before it registers work. An unsupported ID is
present with state `unavailable`; it is not silently omitted.

### Home and composer controls

`home.new-chat-suggestions` transforms the final item list that ChatGPT sends
to `HomeSuggestionSurface`. This build binds both the ambient suggestion owner
and the `HomeTaskSuggestions` producer in
`home-task-suggestions-CPTOpaBq.js`. If a first-party feature gate returns
before either producer creates a surface, the exact home-page owner supplies an
empty `HomeSuggestionSurface` only when an extension suggestion transformer is
registered. The binding keeps the app's card or list layout. Each item can
activate or dismiss through the same owner callbacks. The four stable built-in
category IDs are `codex-explore`, `codex-create`, `codex-review`, and
`codex-fix`.

`home.announcements` transforms the ordered entries used by
`HomeComposerAnnouncements`. The owner shows the first entry whose
`isEligible` or `isLoading` value is true. An extension announcement supplies
text, an optional leading visual, and primary and dismiss actions. The binding
uses ChatGPT's announcement card and action components.

`composer-action` adds a native control to one of the existing composer footer,
action-bar, or utility rails. The binding uses ChatGPT's button and menu
components and calls the extension's activation callbacks. The separately
reported composer render points are the path for arbitrary extension-owned DOM.

`sidebar.destinations` transforms the primary sidebar's
`availableDestinations` list. It preserves the built-in rows and lets an
extension add a destination with the same owner and selection path.

`sidebar.product-mode.menu` transforms the two native product rows. The stable
IDs are `app.work` and `app.codex`. The first row can display `ChatGPT`,
`ChatGPT Work`, or `Work`, based on `workModeAccess`; the second row displays
`Codex`. Extension items are menu actions. They do not create a new product
mode.

An isolated test on build 26.825.51511 rendered extension items in all five UI
contribution families. It activated the suggestion, announcement, sidebar
destination, product-menu action, and composer action callbacks. The suggestion
test used the native `HomeSuggestionSurface` reached through the exact home
producer or its feature-gated empty slot.

### Rich assistant and conversation content

The four rich-content definition kinds use the same owners that ChatGPT uses
for its built-in rich UI. `assistant-directive` maps a directive name,
`assistant-content-reference` maps a reference type, `assistant-code-block`
maps a fenced code language or predicate, and `conversation-item` maps a typed
conversation item. They replace only the matched element. They do not replace
the transcript, Markdown parser, or conversation store.

Each owner passes an immutable JSON snapshot to the extension's
`UiRenderProvider`. Assistant directive, reference, and code-block contexts
include the canonical execution or cloud `ThreadLocator`; extensions do not
reconstruct thread identity from raw owner fields. Directive data keeps leaf
and container kinds. Code-block data keeps complete and streaming/open-fence
states. Conversation-item data keeps standalone and grouped layouts and the
cloud variant keeps its canonical account and optional workspace identity. An
opaque conversation item keeps the complete supported JSON data in
`OpaqueConversationItem.data`. An unregistered directive name and a failed
directive renderer keep the original first-party directive. For the other
three kinds, no matching definition, a false or failed matcher, and a failed
renderer keep the original first-party element. Registration invalidation and
host-value changes remount the provider. The normal abort and disposer
lifecycle applies before the old mount is removed.

Each new exact binding must prove the directive map, content-reference
dispatcher, code-block component, and typed-item dispatcher by static owner
anchors. It must then load one public-API probe extension in an isolated app
and render all eight variants: leaf and container directives, one content
reference, complete and streaming/open code blocks, standalone and grouped
execution items, and one cloud item. It must activate their controls and verify
their stored callback events. It must verify an unregistered name and a
renderer failure for directives. It must verify a false matcher, a thrown
matcher, and a renderer failure for each of the other three first-party
fallback paths. The `26.825.51511` gate passed these checks with 49 recorded
lifecycle events.

### Exact native settings shape

For `settings-section`, `listDefinitionKinds()` returns
`supportedDefinitionShapes: ["native-controls"]`. The current adapter accepts
only `NativeSettingsControlsSectionDefinition`. The definition `id` is local to
the calling extension. It must be non-empty and contain no dots:

- A section has `id`, `title`, `content: "controls"`, and `controls`. It can
  have one native group: `personal`, `integrations`, `coding`, or `archived`.
  Each `searchEntries` item has `title` and optional `keywords`. It has no `id`
  because the native owner does not preserve search-entry identity.
- Each control has `id` and `title`. It can have `description` and
  `restartRequired`.
- A `toggle` has `settingKey` and optional `defaultValue`, `disabled`, and
  native settings `destination`.
- A `text` control has `settingKey` and can have `placeholder`, `defaultValue`,
  `validate`, `disabled`, and `destination`. Secure text is not supported.
- A `select` has `settingKey`, value-and-label options, and optional
  `defaultValue`, `disabled`, and `destination`. Option descriptions are not
  supported.
- A command button has `commandId` and can have `disabled` and `destination`.
  A destination-only button becomes a native disclosure row with no control;
  it cannot have `disabled`. A button cannot have `href` or `settingKey`.

Rendered sections, section `icon`, `order`, and `isVisible`, and all other
control types are unavailable in this binding. Registration rejects them. The
broader `SettingsSectionDefinition` remains a candidate contract for a future
binding; it is not accepted by this one.

The current settings data store supports only extension scope. An omitted scope
means `{ kind: "extension" }`; every other `SettingsScope` is unavailable.
`settings.events()` also accepts only extension scope. Its subscription and the
thread-event subscription accept `signal`, which disposes the subscription on
abort. They accept `afterCursor`, but all previous cursors expire in this
binding. Each source sends `reset` with reason `cursor-expired`, then sends its
fresh snapshot.

`settings.get()`, `set()`, `delete()`, and `batch()` check the signal before
storage work and again before return. A signal that aborts before mutation
prevents the write. An abort after persistence rejects the call but does not
roll back the file. `settings.open()` checks before and after native navigation.

`settings.listSections()` is unavailable. For `settings.open()`, a dotted
section ID is already fully qualified and passes through unchanged. Every ID
in `BuiltInSettingsSectionId` maps to
`codex.settings.<id>`. Any other undotted ID maps to
`<calling-extension-id>.<id>`. An omitted ID opens the built-in
`general-settings` section. `hostId` navigation is unavailable.

## Small ChatGPTX seams

Most entries in the matrix use a direct first-party descriptor list or native
component. Some current features need a small host seam:

- Header properties: the adapter composes two CSS custom properties that the
  app shell and panel headers consume.
- Thread-row content: the adapter mounts extension views through the
  first-party row owner. A Thread Colors bar uses the priority contribution
  point, not `titlePrefix`. When the row has no native priority, the adapter
  supplies the extension mount through `overlayMetaContent` and moves it into
  the row as an absolute bar. This prevents ChatGPT from reserving a leading
  title slot. When a native priority exists, the adapter composes both views in
  `priorityIndicatorNode`. The live gate proves one 3 px bar fills the complete
  standard, taller activity, and cloud row height, has a 3 px gap to the title,
  and keeps colored and uncolored titles aligned.
- Color picker: the adapter serializes requests around ChatGPT's controlled
  native picker and exposes one disposable session.
- Extension settings: a small registry supplies extension sections to the
  existing settings navigation, group, row, native-control, and search owners.
- Rich content: one registry supplies definitions to the exact first-party
  directive, content-reference, fenced-code, and typed-item owners. The owner
  retains its original element as the fallback.

These seams do not replace a ChatGPT owner. They add extension data at the
owner boundary and use the same app components.

## Candidate surfaces

The current bundle has static evidence for these first-party mechanisms, but
the direct adapter does not publish them yet:

| Area | Observed ChatGPT mechanism | Public candidate |
| --- | --- | --- |
| Assistant hover buttons | `additionalActions` and `persistentAdditionalActions` React-node props | `message-action` or the matching render slots |
| User-message actions | One `additionalActions` React-node prop | `message-action` or `user-message.additional-actions` |
| Thread header actions | Keyed header-action registry | `thread.header.action` |
| Thread-row suffix, idle, resting, and hover indicators, metadata, and trailing action | Named row props | The matching `sidebar.thread-row.*` points |
| New-panel picker | Right- and bottom-panel choice list | `surface.new-tab` |
| Right and bottom panels | First-party panel-type registry | `surface` definition |
| Main pages | Static React Router tree | `main-route` definition with one host route |
| Composer utility content | Direct leading and trailing component props | Matching composer render points |

These items stay unavailable until the adapter attaches them and the required
contract tests cover order, action dispatch, invalidation, remount, cleanup,
and each native or React path.

ChatGPTX adds stable point IDs, semantic built-in item IDs, typed owner context,
deterministic order, invalidation, and disposal. The exact adapter keeps hashed
symbols, host IDs, React attachment, and feature gates outside the public API.
