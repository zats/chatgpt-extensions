import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import type {
  JsonObject,
  RendererDocument,
  RuntimeInfo,
} from "@chatgptx/api";
import type {
  MainExtensionContext,
  NativeObjcObject,
} from "@chatgptx/api/native";

import {
  NATIVE_PROBE_EVENT_BROADCAST,
  NATIVE_PROBE_EVENT_CANCEL_OBSERVED,
  NATIVE_PROBE_EVENT_CANCEL_STARTED,
  NATIVE_PROBE_EVENT_TARGETED,
  NATIVE_PROBE_EVIDENCE_FILE,
  NATIVE_PROBE_FOUNDATION,
  NATIVE_PROBE_METHOD_BEGIN,
  NATIVE_PROBE_METHOD_CANCEL,
  NATIVE_PROBE_METHOD_FINALIZE,
  NATIVE_PROBE_NODE_INPUT,
  NATIVE_PROBE_NODE_SHA256,
  NATIVE_PROBE_OBJC_INPUT,
  NATIVE_PROBE_SCHEMA_VERSION,
  jsonObject,
  record,
  requiredNonce,
} from "./contract.js";

type ElectronMain = typeof import("electron/main");

interface PrimaryRendererState {
  readonly renderer: RendererDocument;
  readonly nonce: string;
  readonly connectedRenderers: readonly RendererDocument[];
  readonly owner: JsonObject;
  cancellationObserved: boolean;
  runtime?: JsonObject;
}

function runtimeEvidence(runtime: RuntimeInfo): JsonObject {
  return jsonObject({
    apiVersion: runtime.apiVersion,
    appVersion: runtime.appVersion,
    appBuild: runtime.appBuild,
    electronVersion: runtime.electronVersion,
    chromiumVersion: runtime.chromiumVersion,
    nodeVersion: runtime.nodeVersion,
    nodeModuleAbi: runtime.nodeModuleAbi,
    ...(runtime.nodeApiVersion === undefined
      ? {}
      : { nodeApiVersion: runtime.nodeApiVersion }),
    objcJsVersion: runtime.objcJsVersion,
    architecture: runtime.architecture,
    platform: runtime.platform,
    binding: runtime.binding,
    extension: runtime.extension,
    hosts: runtime.hosts,
    windows: runtime.windows,
  });
}

function rendererEvidence(renderer: RendererDocument): JsonObject {
  return jsonObject({
    id: renderer.id,
    windowId: renderer.windowId,
    webContentsId: renderer.webContentsId,
    url: renderer.url,
  });
}

function ownerEvidence(
  context: MainExtensionContext,
  renderer: RendererDocument,
): JsonObject {
  const owner = context.getOwner(renderer.windowId);
  if (!owner) throw new Error("Native Main Probe did not find the renderer owner");
  const ownerWebContents = owner.getWebContents();
  if (!ownerWebContents) {
    throw new Error("Native Main Probe owner has no WebContents");
  }
  const ownerWindow = owner.getWindow();
  if (!ownerWindow) throw new Error("Native Main Probe owner has no BrowserWindow");
  const electronWebContents = context.electron.webContents.fromId(
    renderer.webContentsId,
  );
  const electronWindow = context.electron.BrowserWindow.fromWebContents(
    ownerWebContents,
  );
  const evidence = jsonObject({
    windowId: owner.windowId,
    webContentsId: ownerWebContents.id,
    ownerWebContentsIsElectronLookup: ownerWebContents === electronWebContents,
    ownerWindowIsElectronLookup: ownerWindow === electronWindow,
    ownerWindowContainsWebContents: ownerWindow.webContents === ownerWebContents,
  });
  if (
    evidence.ownerWebContentsIsElectronLookup !== true ||
    evidence.ownerWindowIsElectronLookup !== true ||
    evidence.ownerWindowContainsWebContents !== true
  ) {
    throw new Error("Native Main Probe owner identity is inconsistent");
  }
  return evidence;
}

async function collectMainEvidence(
  context: MainExtensionContext,
  directElectron: ElectronMain,
): Promise<JsonObject> {
  if (context.electron !== directElectron) {
    throw new Error("MainExtensionContext.electron is not the electron/main singleton");
  }

  const foundation = new context.objc.NobjcLibrary(NATIVE_PROBE_FOUNDATION);
  const nsString = foundation["NSString"] as unknown as NativeObjcObject;
  const createString = nsString["stringWithUTF8String$"];
  if (typeof createString !== "function") {
    throw new Error("Native Main Probe did not find NSString");
  }
  const nativeString = createString(NATIVE_PROBE_OBJC_INPUT) as NativeObjcObject;
  const objcOutput = nativeString.toString();
  if (objcOutput !== NATIVE_PROBE_OBJC_INPUT) {
    throw new Error("Native Main Probe NSString round trip failed");
  }

  const nodeSha256 = createHash("sha256")
    .update(NATIVE_PROBE_NODE_INPUT)
    .digest("hex");
  if (nodeSha256 !== NATIVE_PROBE_NODE_SHA256) {
    throw new Error("Native Main Probe Node hash is inconsistent");
  }

  const blocker = context.owned.powerSaveBlocker("prevent-app-suspension");
  const blockerStarted = context.electron.powerSaveBlocker.isStarted(blocker.id);
  await delay(10);
  blocker.dispose();
  blocker.dispose();
  const blockerStopped = !context.electron.powerSaveBlocker.isStarted(blocker.id);

  let deferredCleanupRuns = 0;
  const deferred = context.disposables.defer(() => {
    deferredCleanupRuns += 1;
  });
  deferred.dispose();
  deferred.dispose();
  if (
    !blockerStarted ||
    !blocker.released ||
    !blockerStopped ||
    deferredCleanupRuns !== 1
  ) {
    throw new Error("Native Main Probe resource release failed");
  }

  const processType = (process as NodeJS.Process & { type?: string }).type;
  return jsonObject({
    electron: {
      sameSingleton: true,
    },
    objc: {
      framework: NATIVE_PROBE_FOUNDATION,
      className: "NSString",
      input: NATIVE_PROBE_OBJC_INPUT,
      output: objcOutput,
      roundTrip: true,
    },
    node: {
      input: NATIVE_PROBE_NODE_INPUT,
      sha256: nodeSha256,
      processType: processType ?? "unknown",
      version: process.versions.node,
    },
    resources: {
      blocker: {
        id: blocker.id,
        type: blocker.type,
        started: blockerStarted,
        released: blocker.released,
        stopped: blockerStopped,
      },
      deferredCleanup: {
        runs: deferredCleanupRuns,
      },
    },
  });
}

function eventMatches(
  value: unknown,
  type: string,
  state: PrimaryRendererState,
): boolean {
  const candidate = record(value);
  return (
    candidate?.type === type &&
    candidate.rendererId === state.renderer.id &&
    candidate.nonce === state.nonce
  );
}

export async function activateNativeMainProbe(
  context: MainExtensionContext,
  directElectron: ElectronMain,
): Promise<void> {
  let primary: PrimaryRendererState | undefined;
  let mainEvidencePromise!: Promise<JsonObject>;

  context.disposables.own(
    context.renderers.handle(NATIVE_PROBE_METHOD_BEGIN, async (parameters, call) => {
      const nonce = requiredNonce(parameters);
      if (!primary) {
        const connectedRenderers = context.renderers.listRenderers();
        const listedCallerByIdentity = connectedRenderers.some(
          (renderer) => renderer === call.renderer,
        );
        if (!listedCallerByIdentity) {
          throw new Error("Native Main Probe caller is absent from listRenderers()");
        }
        primary = {
          renderer: call.renderer,
          nonce,
          connectedRenderers,
          owner: ownerEvidence(context, call.renderer),
          cancellationObserved: false,
        };
      }
      if (primary.renderer.id !== call.renderer.id) {
        return jsonObject({ accepted: false });
      }
      if (primary.nonce !== nonce) {
        throw new Error("Native Main Probe primary nonce changed");
      }

      await mainEvidencePromise;
      primary.runtime = runtimeEvidence(await context.runtime.getInfo());
      const targeted = jsonObject({
        type: "targeted",
        rendererId: call.renderer.id,
        nonce,
      });
      const broadcast = jsonObject({
        type: "broadcast",
        rendererId: call.renderer.id,
        nonce,
      });
      context.renderers.send(
        call.renderer.id,
        NATIVE_PROBE_EVENT_TARGETED,
        targeted,
      );
      context.renderers.broadcast(NATIVE_PROBE_EVENT_BROADCAST, broadcast);
      return jsonObject({ accepted: true, nonce });
    }),
  );

  context.disposables.own(
    context.renderers.handle(NATIVE_PROBE_METHOD_CANCEL, (parameters, call) => {
      const nonce = requiredNonce(parameters);
      if (
        !primary ||
        primary.renderer.id !== call.renderer.id ||
        primary.nonce !== nonce
      ) {
        throw new Error("Native Main Probe cancellation came from a non-primary renderer");
      }
      context.renderers.send(
        call.renderer.id,
        NATIVE_PROBE_EVENT_CANCEL_STARTED,
        jsonObject({ type: "cancel-started", rendererId: call.renderer.id, nonce }),
      );
      return new Promise<undefined>((resolve) => {
        const observeCancellation = (): void => {
          primary!.cancellationObserved = true;
          context.renderers.send(
            call.renderer.id,
            NATIVE_PROBE_EVENT_CANCEL_OBSERVED,
            jsonObject({
              type: "cancel-observed",
              rendererId: call.renderer.id,
              nonce,
            }),
          );
          resolve(undefined);
        };
        if (call.signal.aborted) {
          observeCancellation();
        } else {
          call.signal.addEventListener("abort", observeCancellation, {
            once: true,
          });
        }
      });
    }),
  );

  context.disposables.own(
    context.renderers.handle(NATIVE_PROBE_METHOD_FINALIZE, async (parameters, call) => {
      const nonce = requiredNonce(parameters);
      const final = record(parameters);
      if (
        !primary ||
        primary.renderer.id !== call.renderer.id ||
        primary.nonce !== nonce ||
        !primary.runtime ||
        !primary.cancellationObserved ||
        final?.cancelledInvokeRejected !== true ||
        typeof final.cancelledInvokeErrorName !== "string" ||
        final.cancelledInvokeErrorName.length === 0 ||
        !eventMatches(final.targetedEvent, "targeted", primary) ||
        !eventMatches(final.broadcastEvent, "broadcast", primary) ||
        !eventMatches(final.cancellationObservedEvent, "cancel-observed", primary)
      ) {
        throw new Error("Native Main Probe renderer evidence is incomplete");
      }

      const evidence = jsonObject({
        schemaVersion: NATIVE_PROBE_SCHEMA_VERSION,
        status: "passed",
        extension: context.extension,
        main: {
          ...(await mainEvidencePromise),
          runtime: primary.runtime,
        },
        renderer: {
          document: rendererEvidence(call.renderer),
          extensionInstanceId: final.rendererInstanceId,
        },
        channel: {
          rendererToMainInvokes: ["begin", "cancel", "finalize"],
          connectedRenderers: primary.connectedRenderers.map(rendererEvidence),
          listedCallerByIdentity: true,
          owner: primary.owner,
          targetedEvent: final.targetedEvent,
          broadcastEvent: final.broadcastEvent,
          cancellation: {
            invokeRejected: true,
            rendererErrorName: final.cancelledInvokeErrorName,
            observedByMain: true,
            observedEvent: final.cancellationObservedEvent,
          },
        },
      });
      await context.storage.writeTextFile(
        NATIVE_PROBE_EVIDENCE_FILE,
        `${JSON.stringify(evidence, null, 2)}\n`,
      );
      return jsonObject({ stored: true, nonce });
    }),
  );

  mainEvidencePromise = collectMainEvidence(context, directElectron);
  await mainEvidencePromise;
}
