# Rich Message Probe

This test-only extension verifies the public rich-content definition path. It
uses only `@chatgptx/api`. It is not a product extension and is not part of
`npm run build:extensions`.

The probe registers one definition for each supported ChatGPT render owner:

- the `chatgptx-probe` assistant Markdown directive;
- the `chatgptx-probe` assistant content-reference type;
- the `chatgptx-probe` assistant code-block language;
- the `chatgptx-probe` opaque conversation-item source type.

Those definitions verify eight live values: leaf and container directives, a
content reference, complete and streaming/open code blocks, standalone and
grouped execution items, and a cloud item. The assistant-content values must
include the canonical execution thread locator. The cloud item must include
the signed-in account and optional workspace identity.

Each matched owner mounts an accessible `Rich probe <kind> 0` button. A click
changes the label to `Rich probe <kind> 1`. The extension writes activation,
mount, click activation, and disposal evidence to its extension-scoped
`events.json` file. Each mount first checks the exact public context that the
probe input must produce. The mount event includes that JSON context evidence.

The fixture also proves ChatGPT's first-party fallback for each owner. A
directive has no matcher because ChatGPT selects directive components by name.
The live gate proves one unregistered directive name and one registered
directive whose extension renderer throws. For each of the other three kinds,
one definition uses the real first-party type and distinguishes these native
values:

- `nonMatch` returns `false` from its matcher;
- `matcherError` throws from its matcher;
- `rendererError` matches, then throws from its renderer.

The content-reference values are native `title_citation` references. The code
values are native `text` fenced blocks. The local and cloud conversation-item
values are native `assistant-message` items. The live gate reads the text from
the actual first-party renderers. It does not append a separate witness that
could hide an empty fallback.

From the v5 root, run:

```sh
npm test --prefix test-fixtures/rich-message-probe
```

The command type-checks the source, writes the compiled package to `dist`, and
runs the focused public-contract tests.

For a new ChatGPT version, do not use this fixture command as the release gate
by itself. Use the `scripts/start.mjs run-gate` command in `APIs/README.md`.
The gate first verifies the exact ChatGPT assets and owner hooks. It then runs
this fixture build and test, and loads this same compiled `dist/` package in a
temporary exact-build profile. The live run uses the production
`NODE_OPTIONS=--require runtime/bootstrap.cjs` injection path and must prove all
eight data variants across the four ChatGPT owner mappings, interactions,
cleanup, and first-party fallback.
