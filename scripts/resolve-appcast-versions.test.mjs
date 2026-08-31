import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedDownloadUrl,
  parseAppcast,
  resolveOffsets,
} from "./resolve-appcast-versions.mjs";

const signature = Buffer.alloc(64, 7).toString("base64");

function item(version, attributes = "", appBuild = "7000") {
  return `<item><title>${version}</title><sparkle:version>${appBuild}</sparkle:version><sparkle:shortVersionString>${version}</sparkle:shortVersionString><enclosure ${attributes} url="${expectedDownloadUrl(version)}" length="123456" sparkle:edSignature="${signature}" /></item>`;
}

test("one snapshot resolves t, t-2, and t-4 in feed order", () => {
  const xml = `<rss><channel>${[0, 1, 2, 3, 4]
    .map((value) => item(`26.825.${50000 - value}`))
    .join("")}</channel></rss>`;
  const result = resolveOffsets(xml);
  assert.equal(result.schemaVersion, 2);
  assert.match(result.snapshotSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    result.builds.map(({ offset, version }) => ({ offset, version })),
    [
      { offset: 0, version: "26.825.50000" },
      { offset: 2, version: "26.825.49998" },
      { offset: 4, version: "26.825.49996" },
    ],
  );
});

test("duplicate versions do not change historical offsets", () => {
  const xml = `<rss><channel>${item("26.2.5")}${item("26.2.5")}${item(
    "26.2.4",
  )}</channel></rss>`;
  assert.deepEqual(
    parseAppcast(xml).map(({ version }) => version),
    ["26.2.5", "26.2.4"],
  );
});

test("shortVersionString, app build, length, and signature are preserved", () => {
  const xml = `<rss><channel>${item("26.3.1", "", "7377")}</channel></rss>`;
  assert.deepEqual(parseAppcast(xml)[0], {
    version: "26.3.1",
    appBuild: "7377",
    downloadUrl: expectedDownloadUrl("26.3.1"),
    downloadLength: 123456,
    downloadEdSignature: signature,
  });
});

test("a delta enclosure before the full arm64 enclosure is ignored", () => {
  const version = "26.3.1";
  const xml = `<rss><channel><item><title>${version}</title><sparkle:version>7377</sparkle:version><sparkle:shortVersionString>${version}</sparkle:shortVersionString><enclosure url="https://persistent.oaistatic.com/codex-app-prod/ChatGPT-${version}-delta.zip" length="12" sparkle:edSignature="${signature}" /><enclosure url="${expectedDownloadUrl(version)}" length="123456" sparkle:edSignature="${signature}" /></item></channel></rss>`;
  assert.equal(parseAppcast(xml)[0].downloadUrl, expectedDownloadUrl(version));
});

test("a noncanonical download URL fails closed", () => {
  const xml = `<rss><channel><item><title>26.1.2</title><sparkle:version>7</sparkle:version><enclosure url="https://example.com/ChatGPT.zip" length="1" sparkle:edSignature="${signature}" /></item></channel></rss>`;
  assert.throws(() => parseAppcast(xml), /must contain the full arm64 URL/);
});

test("missing historical offsets fail instead of selecting another build", () => {
  const xml = `<rss><channel>${item("26.1.2")}${item("26.1.1")}</channel></rss>`;
  assert.throws(() => resolveOffsets(xml), /missing offsets 2, 4/);
});

test("offsets must be unique and non-negative", () => {
  const xml = `<rss><channel>${item("26.1.2")}</channel></rss>`;
  assert.throws(() => resolveOffsets(xml, [0, 0]), /unique non-negative/);
  assert.throws(() => resolveOffsets(xml, [-1]), /unique non-negative/);
});
