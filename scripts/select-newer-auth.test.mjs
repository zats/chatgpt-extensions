import assert from "node:assert/strict";
import test from "node:test";

import { selectNewerAuthentication } from "./select-newer-auth.mjs";

const current = {
  last_refresh: "2026-08-31T12:00:00.000000000Z",
  tokens: { access_token: "old", refresh_token: "refresh" },
};

test("authentication selection accepts only changed newer tokens", () => {
  assert.equal(selectNewerAuthentication(current, structuredClone(current)), "same");
  assert.equal(
    selectNewerAuthentication(current, {
      ...current,
      last_refresh: "2026-08-31T12:00:01Z",
      tokens: { ...current.tokens, access_token: "new" },
    }),
    "newer",
  );
  assert.equal(
    selectNewerAuthentication(current, {
      ...current,
      last_refresh: "2026-08-31T11:59:59Z",
      tokens: { ...current.tokens, access_token: "stale" },
    }),
    "stale",
  );
});

test("authentication selection fails closed on malformed documents", () => {
  assert.throws(
    () => selectNewerAuthentication(current, { tokens: {} }),
    /last_refresh/,
  );
});
