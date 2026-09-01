import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  RICH_CONTENT_BINDING,
  validateUniqueAnchors,
  verifyRichContentAssetSource,
} from "./rich-content-binding-verifier.mjs";

test("pins five unique exact-build assets with complete SHA-256 values", () => {
  assert.equal(RICH_CONTENT_BINDING.assets.length, 5);
  assert.equal(
    new Set(RICH_CONTENT_BINDING.assets.map((asset) => asset.path)).size,
    5,
  );
  for (const asset of RICH_CONTENT_BINDING.assets) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.ok(asset.anchors.length >= 3);
  }
});

test("pins the three first-party primary AppShell markers", () => {
  const appInitial = RICH_CONTENT_BINDING.assets.find(
    (asset) => asset.id === "app-rich-content-owners",
  );
  assert.ok(appInitial);
  assert.deepEqual(
    appInitial.anchors.slice(-3),
    [
      {
        label: "default AppShell main surface",
        needle: '"data-app-shell-main-surface":`default`',
      },
      {
        label: "AppShell header marker",
        needle: "N=`app-shell-header`",
      },
      {
        label: "AppShell main focus-area marker",
        needle: '"data-app-shell-focus-area":`main`',
      },
    ],
  );
});

test("accepts one match for each semantic anchor", () => {
  validateUniqueAnchors(
    "fixture.js",
    "const owner = true; export { owner };",
    [
      { label: "owner", needle: "const owner = true" },
      { label: "export", needle: "export { owner }" },
    ],
  );
});

test("rejects a missing semantic owner anchor", () => {
  assert.throws(
    () =>
      validateUniqueAnchors("fixture.js", "export { owner };", [
        { label: "owner", needle: "const owner = true" },
      ]),
    /fixture\.js: semantic anchor "owner" expected exactly once, found 0/,
  );
});

test("rejects a duplicate semantic owner anchor", () => {
  assert.throws(
    () =>
      validateUniqueAnchors(
        "fixture.js",
        "const owner = true; const owner = true;",
        [{ label: "owner", needle: "const owner = true" }],
      ),
    /fixture\.js: semantic anchor "owner" expected exactly once, found 2/,
  );
});

test("rejects a changed semantic export anchor", () => {
  assert.throws(
    () =>
      validateUniqueAnchors("fixture.js", "export { renamed };", [
        { label: "export", needle: "export { owner }" },
      ]),
    /fixture\.js: semantic anchor "export" expected exactly once, found 0/,
  );
});

test("checks the file digest before semantic anchors", () => {
  const source = "const owner = true;";
  const actual = createHash("sha256").update(source).digest("hex");
  assert.throws(
    () =>
      verifyRichContentAssetSource(
        {
          path: "fixture.js",
          sha256: "0".repeat(64),
          anchors: [{ label: "owner", needle: source }],
        },
        source,
      ),
    new RegExp(`fixture\\.js: SHA-256 ${actual} does not match ${"0".repeat(64)}`),
  );
});

test("each pinned anchor set has an internally valid one-match fixture", () => {
  for (const asset of RICH_CONTENT_BINDING.assets) {
    const source = asset.anchors.map((anchor) => anchor.needle).join("\n");
    validateUniqueAnchors(asset.path, source, asset.anchors);
  }
});
