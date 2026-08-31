# ChatGPT Extensions version watcher

This Cloudflare Worker checks the official ChatGPT macOS Sparkle feed every
five minutes. It opens one GitHub issue when the newest full arm64 application
archive has no exact v5 binding. It opens a correction issue when the newest
short version exists but its build, archive length, or Sparkle signature has
changed. This also applies when that version is not the current binding. The
correction keeps the current selector unchanged. After the exact tuple is
repaired, the next check opens a current request to select it.

The Worker reads `runtime/bindings/index.json` from `main` and verifies that
the selected binding has a matching version-directory manifest. It compares
the app build, canonical URL, archive length, and Sparkle Ed25519 signature.
An exact binding is complete only when its exact tag has a published immutable
release, the tag contains the same manifest, and the two uploaded assets have
matching GitHub and checksum SHA-256 values. A missing or incomplete release
creates a current repair request instead of reporting `binding-exists`.
A D1 lease uses that complete feed identity and prevents parallel scheduled and
manual checks from creating duplicate issues. The issue is created with the
`pending` label in the same GitHub request. An existing issue is reused only
when its canonical title and complete schema-2 request body match.

## Required setup

The Wrangler configuration pins Cloudflare account
`5088ca1ac9e6a7e9282df4c2209d1da6` and repository
`zats/chatgpt-extensions`.

The checked-in Wrangler configuration points to the dedicated D1 database. It
also pins `zats` as the only trusted author for watcher-created issues. An exact
issue from any other public user is ignored.

For the first deployment, install and validate the package, then apply the D1
migration before any Worker version can start its scheduled check:

```sh
npm ci
npm test
npm run typecheck
npx wrangler d1 migrations apply chatgpt-extensions-version-watcher --remote
```

Create an untracked mode-0600 `.env` file outside the repository with both
secrets:

```dotenv
GITHUB_TOKEN=...
CHECK_TOKEN=...
```

`GITHUB_TOKEN` needs repository Contents read and Issues read/write access.
`CHECK_TOKEN` protects the manual HTTP trigger. Deploy the code and both secrets
in one operation:

```sh
npx wrangler deploy --secrets-file /absolute/path/to/version-watcher-secrets.env
```

Do not use separate `wrangler secret put` commands for the first deployment.
Each command deploys a Worker version immediately, so the schedule can run with
only one secret. After the first deployment, `wrangler secret put` is safe for
one-secret rotation.

Trigger a protected manual check with:

```sh
curl -X POST -H "Authorization: Bearer $CHECK_TOKEN" \
  https://chatgpt-extensions-version-watcher.<subdomain>.workers.dev/check
```
