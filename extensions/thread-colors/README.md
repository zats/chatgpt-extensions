# Thread Colors extension

Thread Colors stores one color for each scoped thread reference. It uses the
direct v5 API to:

- add a native `Color` submenu to the thread-header menu;
- add the same native `Color` submenu to each sidebar thread-row menu;
- apply background and foreground properties to the thread and panel headers;
- open ChatGPT's native macOS color picker for a custom color;
- render a 3 px leading color bar in each matching sidebar thread row.

The source keys colors by the full thread scope and thread ID. This prevents
equal thread IDs in different scopes from sharing a color. For an execution
thread, the stable locator contains both `hostId` and `threadId`; it does not
use the renderer document ID. The extension writes this locator with the color
to the caller-scoped `settings.json` file. Each new renderer document reads the
same map and restores the matching header and row state. Its storage and
current-thread requests pass the renderer lifetime signal, so work rejects
after that document becomes inactive. It asks for
`context.document.windowId`, which is the only window supported by the current
`threads.getCurrent()` binding. An abort does not roll back a write that already
completed.

The row contribution has an `isVisible` check. An uncolored row does not get an
empty host container or layout gap. Persisted Codex execution rows and
signed-in ChatGPT cloud rows both mount the bar through their first-party
`priorityIndicatorNode` prop, outside the animated title marquee. The header
API registers the CSS properties that the current app-shell and panel-header
owners use.

Both menu registrations use one transform helper. A thread-header owner changes
the selected-header state only when it has a durable thread. A sidebar menu
always targets the thread in its row context and does not change the selected
header. The helper replaces only an earlier Thread Colors item during a repeated
owner evaluation. It keeps app items and items from other extensions, including
items that use the same unqualified item ID.

The extension requests `thread.header.menu` and `sidebar.thread-row.menu` from
the active exact-build adapter. The current adapter provides the persisted-Codex
header owner and the signed-in ChatGPT sidebar row owner. Remote and ChatGPT
cloud header owners, and other sidebar row owner families, remain unavailable.

An isolated test on ChatGPT 26.825.51511 selected `Color` then `Purple` from the
signed-in row menu. The account-scoped cloud color persisted, the selected
thread header became purple, and the target row showed a visible 3 by 16 px
purple bar through `priorityIndicatorNode`.

From the v5 root, run:

```sh
npm run typecheck --workspace=@chatgptx/extension-thread-colors
npm run build --workspace=@chatgptx/extension-thread-colors
npm test --workspace=@chatgptx/extension-thread-colors
```

The build writes the runtime package to `extensions/thread-colors/dist`. The
tests cover color conversion, storage, both menu-owner contexts, repeated menu
evaluation, header state, row state, picker behavior, invalidation, and cleanup.
Use the direct isolated runtime in [the extension guide](../README.md) for UI
checks.
