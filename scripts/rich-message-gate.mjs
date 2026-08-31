import { runtimeFailureEventNames } from "./runtime-launch.mjs";

export const richProbeInteractionEvents = Object.freeze([
  "extension.activate",
  "directive.mount",
  "directive-container.mount",
  "content-reference.mount",
  "code-block.mount",
  "code-block-streaming.mount",
  "conversation-item.mount",
  "conversation-item-grouped.mount",
  "conversation-item-cloud.mount",
  "directive.invalidate",
  "directive-container.invalidate",
  "content-reference.invalidate",
  "code-block.invalidate",
  "code-block-streaming.invalidate",
  "conversation-item.invalidate",
  "conversation-item-grouped.invalidate",
  "conversation-item-cloud.invalidate",
  "directive.activate",
  "directive-container.activate",
  "content-reference.activate",
  "code-block.activate",
  "code-block-streaming.activate",
  "conversation-item.activate",
  "conversation-item-grouped.activate",
  "conversation-item-cloud.activate",
]);

export const richProbeDisposalEvents = Object.freeze([
  "directive.dispose",
  "directive-container.dispose",
  "content-reference.dispose",
  "code-block.dispose",
  "code-block-streaming.dispose",
  "conversation-item.dispose",
  "conversation-item-grouped.dispose",
  "conversation-item-cloud.dispose",
]);

const richProbeSurfaces = Object.freeze([
  "directive",
  "directive-container",
  "content-reference",
  "code-block",
  "code-block-streaming",
  "conversation-item",
  "conversation-item-grouped",
  "conversation-item-cloud",
]);

const richContentLifecycleKinds = Object.freeze([
  "assistantDirective",
  "assistantContentReference",
  "assistantCodeBlock",
  "conversationItem",
]);

const richContentMatcherFallbackSurfaces = Object.freeze([
  "assistantContentReference",
  "assistantCodeBlock",
  "conversationItemLocal",
  "conversationItemCloud",
]);

const richContentMountedOwnerCounts = Object.freeze({
  assistantDirective: 2,
  assistantContentReference: 1,
  assistantCodeBlock: 2,
  conversationItem: 3,
});

export function missingRichProbeEvents(names, expectedNames) {
  if (!Array.isArray(names)) return [...expectedNames];
  return expectedNames.filter((name) => !names.includes(name));
}

export function assertRichProbeLifecycle(events, unmounted) {
  if (!Array.isArray(events)) {
    throw new TypeError("The Rich Message Probe event log is missing");
  }
  const activationIndexes = events.flatMap((event, index) =>
    event?.name === "extension.activate" ? [index] : [],
  );
  if (activationIndexes.length < 1) {
    throw new Error("The Rich Message Probe did not activate");
  }
  for (const surface of richProbeSurfaces) {
    const surfaceEvents = events.filter((event) =>
      event?.name?.startsWith(`${surface}.`),
    );
    const actualNames = surfaceEvents.map((event) => event.name);
    let cursor = 0;
    const firstMount = actualNames[cursor++] === `${surface}.mount`;
    const invalidated = actualNames[cursor++] === `${surface}.invalidate`;
    const remaining = actualNames.slice(cursor);
    const finallyDisposed =
      !unmounted || remaining.pop() === `${surface}.dispose`;
    const surfaceActivationIndexes = remaining.flatMap((name, index) =>
      name === `${surface}.activate` ? [index] : [],
    );
    const lifecycleNames = remaining.filter(
      (name) => name !== `${surface}.activate`,
    );
    const replacementCount = lifecycleNames.length / 2;
    const alternating = lifecycleNames.every((name, index) =>
      index % 2 === 0
        ? name === `${surface}.dispose`
        : name === `${surface}.mount`,
    );
    const firstReplacementBeforeActivation =
      surfaceActivationIndexes.length === 1 &&
      remaining
        .slice(0, surfaceActivationIndexes[0])
        .includes(`${surface}.mount`);
    if (
      !firstMount ||
      !invalidated ||
      replacementCount < 1 ||
      !Number.isInteger(replacementCount) ||
      !alternating ||
      !firstReplacementBeforeActivation ||
      !finallyDisposed ||
      surfaceActivationIndexes.length !== 1
    ) {
      throw new Error(
        `The ${surface} lifecycle is incomplete: ${JSON.stringify(actualNames)}`,
      );
    }
    const mountEvents = surfaceEvents.filter(
      (event) => event.name === `${surface}.mount`,
    );
    const ownerIds = mountEvents.map((event) => event.context?.ownerId);
    if (
      ownerIds.length < 2 ||
      typeof ownerIds[0] !== "string" ||
      ownerIds.some((ownerId) => ownerId !== ownerIds[0])
    ) {
      throw new Error(
        `The ${surface} replacement did not keep one owner identity`,
      );
    }
    const firstSurfaceIndex = events.indexOf(surfaceEvents[0]);
    if (firstSurfaceIndex <= Math.min(...activationIndexes)) {
      throw new Error(`The ${surface} owner mounted before extension activation`);
    }
  }
}

function requireRichContentLifecycle(missing, lifecycle, unmounted, prefix) {
  for (const kind of richContentLifecycleKinds) {
    const mounts = lifecycle?.mounts?.[kind];
    const disposals = lifecycle?.disposals?.[kind];
    if (!Number.isInteger(mounts) || mounts < 2) {
      missing.push(`${prefix}.mounts.${kind}`);
    }
    if (
      !Number.isInteger(disposals) ||
      disposals !==
        mounts - (unmounted ? 0 : richContentMountedOwnerCounts[kind])
    ) {
      missing.push(`${prefix}.disposals.${kind}`);
    }
  }
}

export function assertRichContentDiagnostics(diagnostics) {
  const registrations = diagnostics?.registrations;
  const hits = diagnostics?.hits;
  const fallbacks = diagnostics?.fallbacks;
  const interactions = diagnostics?.interactions;
  const missing = [
    ["registration.assistantDirective", registrations?.assistantDirective, 2],
    [
      "registration.assistantContentReference",
      registrations?.assistantContentReference,
      2,
    ],
    ["registration.assistantCodeBlock", registrations?.assistantCodeBlock, 2],
    ["registration.conversationItem", registrations?.conversationItem, 3],
    ["owner.assistantDirective", hits?.assistantDirective, 1],
    ["owner.assistantContentReference", hits?.assistantContentReference, 1],
    ["owner.assistantMarkdown", hits?.assistantMarkdown, 2],
    ["owner.assistantCodeBlock", hits?.assistantCodeBlock, 1],
    ["owner.localConversationItem", hits?.localConversationItem, 1],
    ["owner.cloudConversationItem", hits?.cloudConversationItem, 1],
  ].flatMap(([name, value, minimum]) =>
    Number.isFinite(value) && value >= minimum ? [] : [name],
  );
  if (
    typeof diagnostics?.rendererDocumentId !== "string" ||
    diagnostics.rendererDocumentId.length === 0
  ) {
    missing.push("rendererDocumentId");
  }
  if (
    typeof diagnostics?.eventFile !== "string" ||
    !/^[A-Za-z0-9%._-]+\.json$/.test(diagnostics.eventFile)
  ) {
    missing.push("eventFile");
  }
  const directiveFallbacks = fallbacks?.assistantDirective;
  if (directiveFallbacks?.unregistered?.connected !== true) {
    missing.push("fallback.assistantDirective.unregistered");
  }
  if (
    !Number.isInteger(directiveFallbacks?.rendererError?.attempts) ||
    directiveFallbacks.rendererError.attempts < 1 ||
    directiveFallbacks.rendererError.connected !== true
  ) {
    missing.push("fallback.assistantDirective.rendererError");
  }
  for (const kind of richContentMatcherFallbackSurfaces) {
    for (const outcome of ["nonMatch", "matcherError", "rendererError"]) {
      const fallback = fallbacks?.[kind]?.[outcome];
      if (
        !Number.isInteger(fallback?.attempts) ||
        fallback.attempts < 1 ||
        fallback.connected !== true
      ) {
        missing.push(`fallback.${kind}.${outcome}`);
      }
    }
  }
  for (const [name, initialLabel, finalLabel] of [
    ["directive", "Rich probe directive 0", "Rich probe directive 1"],
    [
      "directiveContainer",
      "Rich probe container directive 0",
      "Rich probe container directive 1",
    ],
    [
      "contentReference",
      "Rich probe content reference 0",
      "Rich probe content reference 1",
    ],
    ["codeBlock", "Rich probe code block 0", "Rich probe code block 1"],
    [
      "streamingCodeBlock",
      "Rich probe streaming code block 0",
      "Rich probe streaming code block 1",
    ],
    [
      "conversationItem",
      "Rich probe conversation item 0",
      "Rich probe conversation item 1",
    ],
    [
      "groupedConversationItem",
      "Rich probe grouped conversation item 0",
      "Rich probe grouped conversation item 1",
    ],
    [
      "cloudConversationItem",
      "Rich probe cloud conversation item 0",
      "Rich probe cloud conversation item 1",
    ],
  ]) {
    const interaction = interactions?.[name];
    if (
      interaction?.initialLabel !== initialLabel ||
      interaction?.finalLabel !== finalLabel ||
      interaction?.found !== true ||
      interaction?.invalidateFound !== true ||
      interaction?.invalidateClicked !== true ||
      interaction?.replaced !== true ||
      interaction?.oldDisconnected !== true ||
      interaction?.otherOwnersStable !== true ||
      interaction?.clicked !== true ||
      interaction?.changed !== true
    ) {
      missing.push(`interaction.${name}`);
    }
  }
  requireRichContentLifecycle(
    missing,
    diagnostics?.lifecycle,
    false,
    "lifecycle",
  );
  if (diagnostics?.drift !== false) missing.push("owner.drift");
  if (diagnostics?.cloudOwnerReady !== true) {
    missing.push("owner.cloudConversationItemReady");
  }
  if (missing.length > 0) {
    throw new Error(
      `The rich-content diagnostics are incomplete (${missing.join(", ")}): ${JSON.stringify(diagnostics)}`,
    );
  }
}

export function assertRichContentUnmountDiagnostics(diagnostics) {
  const missing = [];
  if (diagnostics?.unmounted !== true) missing.push("unmounted");
  requireRichContentLifecycle(
    missing,
    diagnostics?.postUnmount?.lifecycle,
    true,
    "postUnmount.lifecycle",
  );
  if (missing.length > 0) {
    throw new Error(
      `The rich-content unmount diagnostics are incomplete (${missing.join(", ")}): ${JSON.stringify(diagnostics)}`,
    );
  }
}

export function findRuntimeFailures(records) {
  return records.filter(
    (record) =>
      runtimeFailureEventNames.has(record?.event) ||
      (record?.event === "renderer-entry-activation" &&
        record?.status === "failed"),
  );
}
