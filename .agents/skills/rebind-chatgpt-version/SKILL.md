---
name: rebind-chatgpt-version
description: Create, backtest, or correct one exact ChatGPT macOS Electron binding in runtime/bindings without changing the stable public API, extensions, launcher, or automation.
---

# Rebind one ChatGPT version

Use the supplied stock `ChatGPT.app` and extracted `app.asar` tree to keep the current v5 public API working on one exact ChatGPT build. ChatGPT owns the concepts, components, behavior, and interaction model. The binding exposes those existing app capabilities. Do not invent a second UI architecture or replace an app component with a look-alike.

## Read before you edit

Read these files completely:

1. `runtime/bindings/index.json`
2. `runtime/bindings/<reference-version>/manifest.json`
3. `runtime/bindings/<reference-version>/DERIVATION.md`
4. Every source file and test in that reference binding
5. `APIs/index.d.ts`, all files it exports, and `APIs/builds/<reference-version>.md`
6. `scripts/validate-binding-change.mjs` and `scripts/run-version-gate.mjs`

Treat the prior binding as research evidence, not as truth about the new minified build.

## Fixed scope

The orchestrator supplies the exact app path, extracted tree, version, app build, `app.asar` SHA-256, Electron version, download URL, base commit, and mode. Use only those inputs. Do not discover or download another ChatGPT app. Do not launch ChatGPTX or use a ChatGPTX macOS application, component store, or launcher.

You may change only:

- `runtime/bindings/<target-version>/**`
- `runtime/bindings/index.json`
- `APIs/builds/<target-version>.d.ts`
- `APIs/builds/<target-version>.md`

Keep the stable API, runtime loader and launcher, product extensions, test fixtures, automation, other binding directories, and package manifests unchanged. If the build cannot implement the existing API, report the precise missing app capability. Do not change the API to make the binding pass.

## Modes

- `current`: The target binding must not exist. Create adapter version `1.0.0`, add it to the index, and select it as current.
- `backtest`: Create a missing historical binding at adapter version `1.0.0`. Add it to the index but preserve the current selection. If the exact binding already exists, make no changes; the orchestrator uses the validation-only path.
- `correction`: The target binding must exist. Replace only that binding and its exact build documentation. Preserve `index.current` unless the target is already current. Increment the adapter patch version by exactly one. Do not create a compatibility path.

## Derive the binding

1. Confirm the supplied app version, build, `app.asar` digest, Electron version, and URL before research.
2. Start with the prior binding's semantic anchors. Search the current extracted tree for stable app evidence in this order: i18n identifiers, IPC and protocol strings, library behavior and ARIA semantics, test identifiers, then visible text.
3. Verify current module and export identities by behavior and prop contracts. Never use a minified name or content-hashed chunk filename as the only evidence.
4. Reuse the app's current components and ownership boundaries. Preserve built-in children, handlers, focus, keyboard, menu, and accessibility behavior.
5. Keep multi-extension composition and callback isolation unchanged. Extensions must continue to use the app-shaped API that already exists.
6. Rebuild every checked-in binding artifact. Put its relative path and exact lowercase SHA-256 in `manifest.json`.
7. Add or update exact-build tests inside the target binding. Tests must fail if a locator, module, export, activation phase, rich-message contribution, UI-surface contribution, or product-extension composition path is absent.

## Record evidence

Write `runtime/bindings/<target-version>/DERIVATION.md` with only the final verified approach:

- exact app identity and source URL;
- semantic anchors and extracted-tree locations;
- verified modules, exports, component owners, and interaction boundaries;
- each artifact path and digest;
- exact tests and meaningful failure signatures.

Update `APIs/builds/<target-version>.d.ts` and `.md` only with exact-build mapping facts. Do not change stable API terminology.

## Completion

Before you stop:

1. Run syntax and target binding tests.
2. Run `npm run typecheck`, `npm test`, and `npm run build` when the worktree is ready.
3. Run `node scripts/validate-binding-change.mjs --repository <repository> --base <base> --version <version> --mode <mode> --app-build <build> --download-url <url> --download-length <bytes> --download-ed-signature <base64-signature>`.
4. Leave the finished patch uncommitted and unstaged.

The orchestrator, not the generator, owns isolated authenticated ChatGPT launch and the final `scripts/run-version-gate.mjs` live gate. Do not read, copy, print, or modify any test-account authentication file.
