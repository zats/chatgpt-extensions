import type {
  Disposable,
  ExtensionMessage,
  RendererExtensionContext,
} from "@chatgptx/api";

import {
  NATIVE_PROBE_EVENT_BROADCAST,
  NATIVE_PROBE_EVENT_CANCEL_OBSERVED,
  NATIVE_PROBE_EVENT_CANCEL_STARTED,
  NATIVE_PROBE_EVENT_TARGETED,
  NATIVE_PROBE_EVIDENCE_FILE,
  NATIVE_PROBE_METHOD_BEGIN,
  NATIVE_PROBE_METHOD_CANCEL,
  NATIVE_PROBE_METHOD_FINALIZE,
  jsonObject,
  record,
} from "./contract.js";

interface PendingEvent {
  readonly promise: Promise<ExtensionMessage | undefined>;
  dispose(): void;
}

function waitForProbeEvent(
  context: RendererExtensionContext,
  event: string,
  type: string,
  nonce: string,
): PendingEvent {
  let registration: Disposable | undefined;
  const promise = new Promise<ExtensionMessage | undefined>((resolve) => {
    registration = context.main.on(event, (payload) => {
      const candidate = record(payload);
      if (
        candidate?.type !== type ||
        candidate.rendererId !== context.document.id ||
        candidate.nonce !== nonce
      ) {
        return;
      }
      registration?.dispose();
      resolve(payload);
    });
  });
  return {
    promise,
    dispose() {
      registration?.dispose();
    },
  };
}

function errorName(error: unknown): string {
  if (error instanceof Error && error.name.length > 0) return error.name;
  return "Error";
}

export async function activateNativeRendererProbe(
  context: RendererExtensionContext,
): Promise<void> {
  const nonce = context.document.id;
  const targeted = waitForProbeEvent(
    context,
    NATIVE_PROBE_EVENT_TARGETED,
    "targeted",
    nonce,
  );
  const broadcast = waitForProbeEvent(
    context,
    NATIVE_PROBE_EVENT_BROADCAST,
    "broadcast",
    nonce,
  );
  const cancelStarted = waitForProbeEvent(
    context,
    NATIVE_PROBE_EVENT_CANCEL_STARTED,
    "cancel-started",
    nonce,
  );
  const cancelObserved = waitForProbeEvent(
    context,
    NATIVE_PROBE_EVENT_CANCEL_OBSERVED,
    "cancel-observed",
    nonce,
  );
  const pending = [targeted, broadcast, cancelStarted, cancelObserved];

  try {
    const begin = record(
      await context.main.invoke(NATIVE_PROBE_METHOD_BEGIN, { nonce }),
    );
    if (begin?.accepted === false) return;
    if (begin?.accepted !== true || begin.nonce !== nonce) {
      throw new Error("Native Main Probe begin response is invalid");
    }
    const [targetedEvent, broadcastEvent] = await Promise.all([
      targeted.promise,
      broadcast.promise,
    ]);
    if (!record(targetedEvent) || !record(broadcastEvent)) {
      throw new Error("Native Main Probe did not receive both main events");
    }

    const controller = new AbortController();
    const cancellation = context.main
      .invoke(
        NATIVE_PROBE_METHOD_CANCEL,
        { nonce },
        { signal: controller.signal },
      )
      .then(
        () => ({ rejected: false, errorName: "" }),
        (error: unknown) => ({ rejected: true, errorName: errorName(error) }),
      );
    await cancelStarted.promise;
    controller.abort();
    const [cancelledInvoke, cancellationObservedEvent] = await Promise.all([
      cancellation,
      cancelObserved.promise,
    ]);
    if (!cancelledInvoke.rejected) {
      throw new Error("Native Main Probe cancelled invoke resolved");
    }

    const finalized = record(
      await context.main.invoke(NATIVE_PROBE_METHOD_FINALIZE, jsonObject({
        nonce,
        rendererInstanceId: context.extension.instanceId,
        targetedEvent,
        broadcastEvent,
        cancelledInvokeRejected: true,
        cancelledInvokeErrorName: cancelledInvoke.errorName,
        cancellationObservedEvent,
      })),
    );
    if (finalized?.stored !== true || finalized.nonce !== nonce) {
      throw new Error("Native Main Probe final response is invalid");
    }
    const stored = await context.storage.readTextFile(NATIVE_PROBE_EVIDENCE_FILE);
    if (!stored || record(JSON.parse(stored))?.status !== "passed") {
      throw new Error("Native Main Probe did not read back final evidence");
    }
  } finally {
    for (const event of pending) event.dispose();
  }
}
