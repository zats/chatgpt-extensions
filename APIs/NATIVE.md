# Native macOS access

Status: implemented main-extension host and candidate native contract.

A main extension is trusted code in ChatGPT's Electron main process. It has the
same file, process, network, clipboard, and user authority as ChatGPT. macOS TCC,
the app's entitlements, its code-signing identity, and Electron lifecycle rules
still apply. The current app is not App Sandbox enabled.

## Module model

`MainExtensionContext.electron` is the Electron main namespace that ChatGPT
already loaded. It is not an RPC proxy and it is not a second Electron package.
It includes normal windows, web contents, menus, dialogs, notifications,
sessions, screen, power, shortcuts, shell, and Dock APIs.

Node built-ins use normal `node:*` imports in the CommonJS main entry. There is
no Node wrapper and no generated API for each Node function.

The extension bundle must keep `electron`, `electron/main`, and
`electron/common` external. They resolve inside the ChatGPT Electron process.
`context.electron` is the authoritative host namespace. The extension uses the
exact host Electron release as a peer and type dependency. It must not include
Electron in its output.

The repository builder writes `dist/main.cjs`. The direct v5 runtime loads that
file once for each enabled extension after Electron `app.whenReady()`. The host
validates the module exports, creates the full `MainExtensionContext`, and calls
`activate(context)`. A failed activation releases registered handlers, native
leases, and cleanup records before it calls `deactivate()` on a best-effort
basis.

The host starts main entries in deterministic sequence, but renderer attachment
does not wait for the complete main activation pass. A main entry can wait for
its first renderer through `context.renderers.onRendererChange()`. If the
renderer is already connected when a later entry registers, the host replays
the current connection in a microtask. A handler that the first renderer needs
must be registered before the main entry's first `await`. Connection replay does
not replay an earlier request.

`MainExtensionContext.objc` is the host-provided `objc-js` module. The current
build provides version `1.5.0`. It can load frameworks, send Objective-C
messages, define classes, implement protocols, create typed blocks, call C
functions, and work with raw pointers. An extension must not bundle another
copy of its native add-on. The builder rejects direct `objc-js` imports; use
`context.objc`. A wrong selector, signature, pointer, or private API call can
crash the full app.

The exact target uses ChatGPT `26.825.51511`, Electron `42.3.0`, Node
`24.14.0`, Node module ABI `143`, Node-API build version `10`, `objc-js` `1.5.0`,
and arm64. These values are available through `context.runtime`.

## Main and renderer entries

Native work stays in the main entry. React events, menu transforms, and surface
rendering stay in the renderer entry. `context.renderers` and `context.main`
are the two ends of one extension-scoped JSON channel.

This channel is general data transport for the extension. It is not a generated
proxy for Electron. The main entry can define a method such as `reveal-path` and
the renderer can call it. The extension owns that method contract.

```js
// main.cjs
module.exports.activate = (context) => {
  context.renderers.handle("reveal-path", async (parameters) => {
    if (!parameters || typeof parameters !== "object") {
      throw new TypeError("A path is required");
    }

    const path = parameters.path;
    if (typeof path !== "string") {
      throw new TypeError("A path is required");
    }

    context.electron.shell.showItemInFolder(path);
  });
};
```

The renderer main world still has no Node integration. BrowserWindow,
WebContents, Menu, NativeImage, and functions cannot cross structured clone.
They remain in main; only JSON values cross the channel.

## Direct APIs and owned state

Use direct Electron and Node APIs for extension-owned windows, views, trays,
notifications, files, child processes, dialogs, clipboard data, images, and
event listeners. Register cleanup with `context.disposables`.

Some Electron values are global to the app. Two trusted extensions can replace
each other's state or leave stale state at shutdown. `context.owned` provides
small leases for these values:

- application menu;
- Dock badge, icon, and menu;
- global shortcuts;
- power-save blockers.

The runtime releases all leases after failed activation and during app-exit
deactivation. An extension can release a lease early. A shortcut request returns
`null` when its accelerator is unavailable. When a menu or Dock lease ends, the
coordinator restores the captured host value or the next active lease.

Trusted code can still call the direct Electron functions. The lease API is for
collision handling and deterministic restore; it is not an authorization check.

`getOwner(windowId)` maps a stable public window ID to live `BrowserWindow` and
`WebContents` objects. Use it to parent a dialog or child window. Either getter
can return `null` after the window closes.

## Finder

Use `context.electron.shell.showItemInFolder(absolutePath)` to reveal and select
a path in Finder. It has no completion result. Check the path first when the
extension must report failure.

Use `context.electron.shell.openPath(path)` when Finder or the default
application must open the item. It resolves to an empty string on success and
an error string on failure.

Use the stable files API for ChatGPT file handles and app-owned file workflows.
Use `context.storage` for state shared by an extension's main, normal renderer,
and settings renderer entries. Use direct Node and Electron APIs for other paths
that the extension already owns.

Main and renderer contexts use the same extension-management state. A
`setEnabled()` call updates the launch file and the shared in-memory list, but it
does not hot-load or hot-unload an entry. Storage methods, extension-management
methods, and `context.runtime.getInfo()` accept `RequestOptions`. Aborting a
request rejects the caller; it does not undo a write or enablement change that
already completed.

## Raw AppHost

The raw AppHost stays inside the exact-build adapter. It has 83 current services
for files, terminals, browser control, projects, permissions, notifications,
and other product functions. Its names, DTOs, MessagePorts, owner rules, and
cleanup objects are build-specific.

Renderer extensions use `context.api` for ChatGPT product operations and send
the required JSON data to main. This keeps threads, messages, projects, surfaces,
files, browser tabs, and terminals stable across ChatGPT builds. Withholding raw
AppHost is a stability and ownership rule, not a security boundary.

## Foreign native code

Pure JavaScript and the host `objc-js` module are the supported in-process path.
An extension-provided `.node` add-on cannot be assumed to load because:

1. Its CPU architecture must match the app.
2. Its Node-API or Electron module ABI must match the host.
3. It must be an unpacked file.
4. The app uses the hardened runtime and does not disable library validation.
   A module signed by another team, or an unsigned module, is not a supported
   in-process dependency.

ChatGPTX cannot add a foreign module to the signed OpenAI app without changing
that app. Do not use a signing bypass. When `objc-js` is not enough, run a
separately signed helper executable through `node:child_process` and use a data
protocol. The helper has its own process identity and macOS access rules.

See [the current build evidence](./builds/26.825.51511.md) for the inspected host
identity and native-service inventory.
