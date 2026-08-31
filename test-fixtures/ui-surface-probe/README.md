# UI Surface Probe

This test-only extension verifies the native v5 contribution points for the
new-thread home, composer, and primary sidebar. It is not a product extension
and is not part of `npm run build:extensions`.

The probe contributes these native peer items:

- one first-position new-thread suggestion;
- one first-position eligible announcement with primary and dismiss actions;
- one last-position primary sidebar destination;
- one last-position product-mode menu action;
- one composer action-bar action.

Each renderer document writes to its own extension-scoped
`events-<document-id>.json` file. Each action adds one event. Its visible or
accessible label contains the new event count after owner invalidation. The
event list uses a sequence number and event name only, so live checks have a
deterministic result.

From the v5 root, run:

```sh
npm test --prefix test-fixtures/ui-surface-probe
```

The command type-checks the source, writes the compiled extension package to
`test-fixtures/ui-surface-probe/dist`, and runs the focused contract tests.
