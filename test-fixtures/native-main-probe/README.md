# Native Main Probe

This test-only extension verifies the public main-extension contract. It has a
main entry and a renderer entry. The repository extension builder compiles both
entries into one `dist/` package.

The live probe verifies these results:

- `MainExtensionContext.electron` and a direct `electron/main` require return
  the same object.
- Foundation makes an `NSString` and returns the same text.
- a Node `node:crypto` import calculates the expected SHA-256 value;
- `runtime.getInfo()` returns the active build and extension identity;
- `renderers.listRenderers()` contains the renderer that made the call;
- `getOwner()` returns the same `WebContents` and `BrowserWindow` objects as
  Electron;
- the renderer invokes main handlers and receives one targeted event and one
  broadcast event;
- main observes the abort signal for a cancelled renderer invoke;
- a short power-save-blocker lease stops, and a deferred cleanup runs once.

Main writes the final result to the extension-scoped `evidence.json` file. The
renderer reads the file back before its activation completes. The version gate
reads the same file and rejects incomplete evidence.

Run the source, build, and behavioral contract tests:

```sh
npm test --prefix test-fixtures/native-main-probe
```

Do not run this fixture as a separate app. Use the `scripts/start.mjs run-gate`
command in `APIs/README.md` for the live test against stock ChatGPT.
