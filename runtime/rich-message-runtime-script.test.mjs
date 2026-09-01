import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRichContentDiagnostics,
  assertRichContentUnmountDiagnostics,
  assertRichProbeLifecycle,
  findRuntimeFailures,
  missingRichProbeEvents,
  richProbeDisposalEvents,
  richProbeInteractionEvents,
} from "../scripts/rich-message-gate.mjs";

const fallbackSurfaces = [
  "assistantContentReference",
  "assistantCodeBlock",
  "conversationItemLocal",
  "conversationItemCloud",
];

function completeFallbacks() {
  return {
    assistantDirective: {
      unregistered: { attempts: 0, connected: true },
      rendererError: { attempts: 1, connected: true },
    },
    ...Object.fromEntries(fallbackSurfaces.map((surface) => [
      surface,
      {
        nonMatch: { attempts: 1, connected: true },
        matcherError: { attempts: 1, connected: true },
        rendererError: { attempts: 1, connected: true },
      },
    ])),
  };
}

function completeDiagnostics() {
  return {
    rendererDocumentId: "document:test-renderer",
    eventFile: "document%3Atest-renderer.json",
    drift: false,
    fallbacks: completeFallbacks(),
    interactions: {
      directive: {
        initialLabel: "Rich probe directive 0",
        finalLabel: "Rich probe directive 1",
        found: true,
        invalidateFound: true,
        invalidateClicked: true,
        replaced: true,
        oldDisconnected: true,
        otherOwnersReady: true,
        clicked: true,
        changed: true,
      },
      directiveContainer: {
        initialLabel: "Rich probe container directive 0",
        finalLabel: "Rich probe container directive 1",
        found: true,
        invalidateFound: true,
        invalidateClicked: true,
        replaced: true,
        oldDisconnected: true,
        otherOwnersReady: true,
        clicked: true,
        changed: true,
      },
      contentReference: {
        initialLabel: "Rich probe content reference 0",
        finalLabel: "Rich probe content reference 1",
        found: true,
        invalidateFound: true,
        invalidateClicked: true,
        replaced: true,
        oldDisconnected: true,
        otherOwnersReady: true,
        clicked: true,
        changed: true,
      },
      codeBlock: {
        initialLabel: "Rich probe code block 0",
        finalLabel: "Rich probe code block 1",
        found: true,
        invalidateFound: true,
        invalidateClicked: true,
        replaced: true,
        oldDisconnected: true,
        otherOwnersReady: true,
        clicked: true,
        changed: true,
      },
      streamingCodeBlock: {
        initialLabel: "Rich probe streaming code block 0",
        finalLabel: "Rich probe streaming code block 1",
        found: true,
        invalidateFound: true,
        invalidateClicked: true,
        replaced: true,
        oldDisconnected: true,
        otherOwnersReady: true,
        clicked: true,
        changed: true,
      },
      conversationItem: {
        initialLabel: "Rich probe conversation item 0",
        finalLabel: "Rich probe conversation item 1",
        found: true,
        invalidateFound: true,
        invalidateClicked: true,
        replaced: true,
        oldDisconnected: true,
        otherOwnersReady: true,
        clicked: true,
        changed: true,
      },
      groupedConversationItem: {
        initialLabel: "Rich probe grouped conversation item 0",
        finalLabel: "Rich probe grouped conversation item 1",
        found: true,
        invalidateFound: true,
        invalidateClicked: true,
        replaced: true,
        oldDisconnected: true,
        otherOwnersReady: true,
        clicked: true,
        changed: true,
      },
      cloudConversationItem: {
        initialLabel: "Rich probe cloud conversation item 0",
        finalLabel: "Rich probe cloud conversation item 1",
        found: true,
        invalidateFound: true,
        invalidateClicked: true,
        replaced: true,
        oldDisconnected: true,
        otherOwnersReady: true,
        clicked: true,
        changed: true,
      },
    },
    registrations: {
      assistantDirective: 2,
      assistantContentReference: 2,
      assistantCodeBlock: 2,
      conversationItem: 3,
    },
    hits: {
      assistantDirective: 1,
      assistantContentReference: 1,
      assistantMarkdown: 2,
      assistantCodeBlock: 1,
      localConversationItem: 1,
      cloudConversationItem: 1,
    },
    lifecycle: {
      mounts: {
        assistantDirective: 4,
        assistantContentReference: 2,
        assistantCodeBlock: 4,
        conversationItem: 6,
      },
      disposals: {
        assistantDirective: 2,
        assistantContentReference: 1,
        assistantCodeBlock: 2,
        conversationItem: 3,
      },
    },
    cloudOwnerReady: true,
  };
}

function completeProbeEvents(unmounted) {
  const events = [{ name: "extension.activate" }];
  for (const surface of [
    "directive",
    "directive-container",
    "content-reference",
    "code-block",
    "code-block-streaming",
    "conversation-item",
    "conversation-item-grouped",
    "conversation-item-cloud",
  ]) {
    const context = { ownerId: `${surface}:owner` };
    events.push(
      { name: `${surface}.mount`, context },
      { name: `${surface}.invalidate` },
      { name: `${surface}.dispose` },
      { name: `${surface}.mount`, context },
      { name: `${surface}.activate` },
      ...(unmounted ? [{ name: `${surface}.dispose` }] : []),
    );
  }
  return events;
}

test("the live probe requires interaction and disposal for all eight surface variants", () => {
  assert.deepEqual(richProbeDisposalEvents, [
    "directive.dispose",
    "directive-container.dispose",
    "content-reference.dispose",
    "code-block.dispose",
    "code-block-streaming.dispose",
    "conversation-item.dispose",
    "conversation-item-grouped.dispose",
    "conversation-item-cloud.dispose",
  ]);
  const required = [...richProbeInteractionEvents, ...richProbeDisposalEvents];
  assert.deepEqual(missingRichProbeEvents(required, required), []);
  assert.deepEqual(
    missingRichProbeEvents(
      required.filter((name) => name !== "content-reference.dispose"),
      required,
    ),
    ["content-reference.dispose"],
  );
});

test("the live probe requires replacement and final disposal for each owner", () => {
  const interacted = completeProbeEvents(false);
  const unmounted = completeProbeEvents(true);
  assert.doesNotThrow(() => assertRichProbeLifecycle(interacted, false));
  assert.doesNotThrow(() => assertRichProbeLifecycle(unmounted, true));
  const replayed = structuredClone(interacted);
  const codeActivation = replayed.findIndex(
    (event) => event.name === "code-block.activate",
  );
  replayed.splice(
    codeActivation,
    0,
    { name: "code-block.dispose" },
    {
      name: "code-block.mount",
      context: { ownerId: "code-block:owner" },
    },
  );
  assert.doesNotThrow(() => assertRichProbeLifecycle(replayed, false));
  const preInvalidationReplay = structuredClone(interacted);
  const codeInvalidation = preInvalidationReplay.findIndex(
    (event) => event.name === "code-block.invalidate",
  );
  preInvalidationReplay.splice(
    codeInvalidation,
    0,
    { name: "code-block.dispose" },
    {
      name: "code-block.mount",
      context: { ownerId: "code-block:owner" },
    },
  );
  assert.doesNotThrow(() =>
    assertRichProbeLifecycle(preInvalidationReplay, false),
  );
  const postActivationReplay = structuredClone(interacted);
  const postActivationIndex = postActivationReplay.findIndex(
    (event) => event.name === "code-block.activate",
  );
  postActivationReplay.splice(
    postActivationIndex + 1,
    0,
    { name: "code-block.dispose" },
    {
      name: "code-block.mount",
      context: { ownerId: "code-block:owner" },
    },
  );
  assert.doesNotThrow(() =>
    assertRichProbeLifecycle(postActivationReplay, false),
  );
  assert.doesNotThrow(() =>
    assertRichProbeLifecycle(
      [...interacted, { name: "extension.activate" }],
      false,
    ),
  );
  assert.throws(
    () =>
      assertRichProbeLifecycle(
        interacted.filter((event) => event.name !== "extension.activate"),
        false,
      ),
    /did not activate/,
  );
  assert.throws(
    () =>
      assertRichProbeLifecycle(
        interacted.filter((event) => event.name !== "code-block.invalidate"),
        false,
      ),
    /code-block lifecycle is incomplete/,
  );
  const changedOwner = structuredClone(interacted);
  const directiveMounts = changedOwner.filter(
    (event) => event.name === "directive.mount",
  );
  directiveMounts[1].context = { ownerId: "directive:other-owner" };
  assert.throws(
    () => assertRichProbeLifecycle(changedOwner, false),
    /replacement did not keep one owner identity/,
  );
  assert.throws(
    () => assertRichProbeLifecycle(interacted, true),
    /lifecycle is incomplete/,
  );
});

test("diagnostics require registration and exact-owner evidence", () => {
  const diagnostics = completeDiagnostics();
  assert.doesNotThrow(() => assertRichContentDiagnostics(diagnostics));
  assert.doesNotThrow(() =>
    assertRichContentDiagnostics({
      ...diagnostics,
      lifecycle: {
        mounts: { ...diagnostics.lifecycle.mounts, assistantCodeBlock: 5 },
        disposals: {
          ...diagnostics.lifecycle.disposals,
          assistantCodeBlock: 3,
        },
      },
    }),
  );

  for (const key of Object.keys(diagnostics.registrations)) {
    assert.throws(
      () =>
        assertRichContentDiagnostics({
          ...diagnostics,
          registrations: { ...diagnostics.registrations, [key]: 0 },
        }),
      /diagnostics are incomplete/,
      key,
    );
  }
  for (const key of Object.keys(diagnostics.hits)) {
    assert.throws(
      () =>
        assertRichContentDiagnostics({
          ...diagnostics,
          hits: { ...diagnostics.hits, [key]: 0 },
        }),
      /diagnostics are incomplete/,
      key,
    );
  }
  for (const surface of Object.keys(diagnostics.fallbacks)) {
    for (const outcome of Object.keys(diagnostics.fallbacks[surface])) {
      assert.throws(
        () =>
          assertRichContentDiagnostics({
            ...diagnostics,
            fallbacks: {
              ...diagnostics.fallbacks,
              [surface]: {
                ...diagnostics.fallbacks[surface],
                [outcome]: { attempts: 1, connected: false },
              },
            },
          }),
        /diagnostics are incomplete/,
        `${surface}.${outcome}`,
      );
    }
  }
  for (const key of Object.keys(diagnostics.interactions)) {
    for (const field of [
      "found",
      "invalidateFound",
      "invalidateClicked",
      "replaced",
      "oldDisconnected",
      "otherOwnersReady",
      "clicked",
      "changed",
    ]) {
      assert.throws(
        () =>
          assertRichContentDiagnostics({
            ...diagnostics,
            interactions: {
              ...diagnostics.interactions,
              [key]: { ...diagnostics.interactions[key], [field]: false },
            },
          }),
        /diagnostics are incomplete/,
        `${key}.${field}`,
      );
    }
  }
  assert.throws(
    () =>
      assertRichContentDiagnostics({
        ...diagnostics,
        lifecycle: {
          ...diagnostics.lifecycle,
          disposals: {
            ...diagnostics.lifecycle.disposals,
            assistantCodeBlock: 0,
          },
        },
      }),
    /lifecycle\.disposals\.assistantCodeBlock/,
  );
  assert.throws(
    () => assertRichContentDiagnostics({ ...diagnostics, drift: true }),
    /owner\.drift/,
  );
  assert.throws(
    () =>
      assertRichContentDiagnostics({
        ...diagnostics,
        eventFile: "../events.json",
      }),
    /eventFile/,
  );
});

test("unmount diagnostics require final disposal for all eight surface variants", () => {
  const mountedLifecycle = {
    mounts: {
      assistantDirective: 4,
      assistantContentReference: 2,
      assistantCodeBlock: 4,
      conversationItem: 6,
    },
    disposals: {
      assistantDirective: 2,
      assistantContentReference: 1,
      assistantCodeBlock: 2,
      conversationItem: 3,
    },
  };
  const postUnmount = {
    lifecycle: {
      mounts: {
        assistantDirective: 4,
        assistantContentReference: 2,
        assistantCodeBlock: 4,
        conversationItem: 6,
      },
      disposals: {
        assistantDirective: 4,
        assistantContentReference: 2,
        assistantCodeBlock: 4,
        conversationItem: 6,
      },
    },
  };
  assert.doesNotThrow(() =>
    assertRichContentUnmountDiagnostics({
      unmounted: true,
      lifecycle: mountedLifecycle,
      postUnmount,
    }),
  );
  assert.throws(
    () =>
      assertRichContentUnmountDiagnostics({
        unmounted: true,
        lifecycle: mountedLifecycle,
        postUnmount: {
          lifecycle: {
            ...postUnmount.lifecycle,
            disposals: {
              ...postUnmount.lifecycle.disposals,
              conversationItem: 1,
            },
          },
        },
      }),
    /postUnmount\.lifecycle\.disposals\.conversationItem/,
  );
});

test("late runtime failures include probe and activation failures", () => {
  const records = [
    { event: "rich-content-probe-unmounted" },
    { event: "rich-content-probe-unmount-failed", error: "failed" },
    {
      event: "renderer-entry-activation",
      id: "rich-message-probe",
      status: "failed",
    },
    {
      event: "renderer-entry-activation",
      id: "thread-colors",
      status: "activated",
    },
    { event: "product-extension-probe-failed", error: "failed" },
    { event: "product-extension-real-ui-probe-failed", error: "failed" },
  ];
  assert.deepEqual(findRuntimeFailures(records), [
    records[1],
    records[2],
    records[4],
    records[5],
  ]);
});
