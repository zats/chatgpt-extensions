# Reactions extension

Reactions adds configurable emoji actions below ChatGPT's assistant-text
selection toolbar. Selecting an emoji creates the first-party response
annotation `User reacted with <emoji>`. Holding Command also submits the
composer.

The normal renderer entry owns the assistant-selection action transform. The
settings entry registers a `NativeSettingsControlsSectionDefinition` for the
native `Reactions` section and stays available when the normal extension
entries are disabled. This is the current binding's reported `native-controls`
shape. Both entries use the same caller-scoped `settings.json` file. They
synchronize that file with the extension-only settings store. The section's
search entries use titles and keywords without separate IDs, as required by the
current native owner.

The direct adapter implements the selection transform and response annotation
for the current persisted-Codex path. The consumer ChatGPT cloud selection uses
a different composer path and is unavailable. Remote Codex needs separate
owner proof before this document can call it supported.

An isolated local-Codex test on 2026-08-30 proved all four configured selection
actions. Activating the thumbs-up action created the first-party response
annotation `User reacted with 👍`. The same test does not prove the remote or
cloud paths.

From the v5 root, run:

```sh
npm test --workspace=@chatgptx/extension-reactions
```

The command runs strict TypeScript checks, builds the normal
`dist/renderer.cjs` and `dist/settings.cjs` bundles, and runs the focused
behavior tests. The source imports only `@chatgptx/api`.

The exact assistant-selection point supplies `createResponseAnnotation()` on
its owner context. If that owner callback fails, the action rejects with the
same error and reports it. Use the direct isolated runtime in
[the extension guide](../README.md) for UI checks.
