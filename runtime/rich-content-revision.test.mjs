import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hostPatchFile = new URL(
  "./bindings/26.825.51511/host-source-patch.cjs",
  import.meta.url,
);

function loadExactRichRevisionContract() {
  const source = readFileSync(hostPatchFile, "utf8");
  const registrationStart = source.indexOf(
    "  function exactRichRegistration(collection, entry) {",
  );
  const revisionEnd = source.indexOf(
    "\n  function exactRichProbeFallbackOutcome(kind, context) {",
    registrationStart,
  );
  assert.notEqual(registrationStart, -1, "exact rich registration is missing");
  assert.notEqual(revisionEnd, -1, "exact rich revision boundary is missing");
  const fragment = source.slice(registrationStart, revisionEnd);
  return new Function(`
    const exactRichRevisions = new WeakMap();
    let changes = 0;
    function emitExactUiChange() { changes += 1; }
    ${fragment}
    return {
      register: exactRichRegistration,
      revision: exactRichRevision,
      changes: () => changes,
    };
  `)();
}

test("exact rich invalidation changes only the selected owner revision", () => {
  const contract = loadExactRichRevisionContract();
  const collection = [];
  const entry = {};
  const registration = contract.register(collection, entry);
  assert.deepEqual(collection, [entry]);
  assert.equal(contract.changes(), 1);
  assert.equal(contract.revision(entry, "owner-a"), "0:0");
  assert.equal(contract.revision(entry, "owner-b"), "0:0");

  registration.invalidate("owner-a");
  assert.equal(contract.revision(entry, "owner-a"), "0:1");
  assert.equal(contract.revision(entry, "owner-b"), "0:0");

  registration.invalidate("owner-b");
  assert.equal(contract.revision(entry, "owner-a"), "0:1");
  assert.equal(contract.revision(entry, "owner-b"), "0:1");

  registration.invalidate();
  assert.equal(contract.revision(entry, "owner-a"), "1:1");
  assert.equal(contract.revision(entry, "owner-b"), "1:1");
  assert.equal(contract.changes(), 4);
});
