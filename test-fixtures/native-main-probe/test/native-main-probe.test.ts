import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import type {
  Disposable,
  ExtensionMessage,
  MainCallHandler,
  RendererDocument,
  RendererExtensionContext,
} from "@chatgptx/api";
import type { MainExtensionContext } from "@chatgptx/api/native";

import {
  NATIVE_PROBE_EVIDENCE_FILE,
  NATIVE_PROBE_FOUNDATION,
  NATIVE_PROBE_NODE_SHA256,
  NATIVE_PROBE_OBJC_INPUT,
} from "../src/contract.js";
import { activateNativeMainProbe } from "../src/native-main-probe.js";
import { activateNativeRendererProbe } from "../src/native-renderer-probe.js";

const fixtureRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function disposable(cleanup: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cleanup();
    },
  };
}

describe("Native Main Probe", () => {
  test("uses both public contexts to produce final behavioral evidence", async () => {
    const renderer: RendererDocument = Object.freeze({
      id: "document-native-main-probe",
      windowId: "window-native-main-probe",
      webContentsId: 41,
      url: "app://chatgpt.com/codex",
    });
    const webContents = Object.freeze({ id: 41, isDestroyed: () => false });
    const browserWindow = Object.freeze({
      id: 7,
      webContents,
      isDestroyed: () => false,
    });
    const blockers = new Set<number>();
    let nextBlocker = 1;
    let blockerStops = 0;
    const electron = Object.freeze({
      powerSaveBlocker: Object.freeze({
        start() {
          const id = nextBlocker++;
          blockers.add(id);
          return id;
        },
        isStarted(id: number) {
          return blockers.has(id);
        },
        stop(id: number) {
          blockerStops += 1;
          return blockers.delete(id);
        },
      }),
      webContents: Object.freeze({
        fromId: (id: number) => (id === webContents.id ? webContents : null),
      }),
      BrowserWindow: Object.freeze({
        fromWebContents: (value: unknown) =>
          value === webContents ? browserWindow : null,
      }),
    });

    const storage = new Map<string, string>();
    const storageApi = {
      async listFiles() {
        return [...storage.keys()].sort();
      },
      async readTextFile(file: string) {
        return storage.get(file);
      },
      async writeTextFile(file: string, contents: string) {
        storage.set(file, contents);
      },
      async deleteFile(file: string) {
        storage.delete(file);
      },
    };

    const handlers = new Map<string, MainCallHandler>();
    const listeners = new Map<
      string,
      Set<(payload: ExtensionMessage | undefined) => void>
    >();
    const send = (event: string, payload: ExtensionMessage | undefined): void => {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    };
    const mainChannel = {
      handle(method: string, handler: MainCallHandler) {
        handlers.set(method, handler);
        return disposable(() => handlers.delete(method));
      },
      send(rendererId: string, event: string, payload?: ExtensionMessage) {
        assert.equal(rendererId, renderer.id);
        send(event, payload);
      },
      broadcast(event: string, payload?: ExtensionMessage) {
        send(event, payload);
      },
      listRenderers() {
        return [renderer];
      },
      onRendererChange() {
        return disposable(() => {});
      },
    };
    const rendererChannel = {
      invoke<TResult extends ExtensionMessage | undefined>(
        method: string,
        parameters?: ExtensionMessage,
        options?: { readonly signal?: AbortSignal },
      ): Promise<TResult> {
        const handler = handlers.get(method);
        if (!handler) return Promise.reject(new Error(`Missing handler: ${method}`));
        const controller = new AbortController();
        const abort = (): void => {
          controller.abort(new DOMException("The renderer cancelled the call", "AbortError"));
        };
        options?.signal?.addEventListener("abort", abort, { once: true });
        const operation = Promise.resolve().then(() =>
          handler(parameters, { renderer, signal: controller.signal }),
        );
        const cancellation = new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(controller.signal.reason),
            { once: true },
          );
        });
        return Promise.race([operation, cancellation]).finally(() => {
          options?.signal?.removeEventListener("abort", abort);
        }) as Promise<TResult>;
      },
      on(
        event: string,
        listener: (payload: ExtensionMessage | undefined) => void,
      ) {
        const entries = listeners.get(event) ?? new Set();
        entries.add(listener);
        listeners.set(event, entries);
        return disposable(() => entries.delete(listener));
      },
    };

    const mainIdentity = Object.freeze({
      id: "native-main-probe",
      instanceId: "main-instance",
      version: "0.1.0",
      manifestDigest: "a".repeat(64),
    });
    const trackedDisposables: Disposable[] = [];
    const mainContext = {
      extension: mainIdentity,
      storage: storageApi,
      lifetime: new AbortController().signal,
      electron,
      objc: {
        NobjcLibrary: class {
          readonly NSString: {
            stringWithUTF8String$(input: string): { toString(): string };
          };

          constructor(framework: string) {
            assert.equal(framework, NATIVE_PROBE_FOUNDATION);
            this.NSString = {
              stringWithUTF8String$(input: string) {
                return { toString: () => input };
              },
            };
          }
        },
      },
      renderers: mainChannel,
      owned: {
        powerSaveBlocker(type: string) {
          assert.equal(type, "prevent-app-suspension");
          const id = electron.powerSaveBlocker.start();
          let released = false;
          return {
            id,
            type,
            get released() {
              return released;
            },
            dispose() {
              if (released) return;
              released = true;
              electron.powerSaveBlocker.stop(id);
            },
          };
        },
      },
      disposables: {
        own<T extends Disposable>(value: T): T {
          trackedDisposables.push(value);
          return value;
        },
        defer(cleanup: () => void): Disposable {
          const value = disposable(cleanup);
          trackedDisposables.push(value);
          return value;
        },
      },
      runtime: {
        async getInfo() {
          return {
            apiVersion: "0.2.0",
            appVersion: "26.825.51511",
            appBuild: "7377",
            electronVersion: "42.3.0",
            chromiumVersion: "151.0.0.0",
            nodeVersion: process.versions.node,
            nodeModuleAbi: process.versions.modules ?? "143",
            nodeApiVersion: process.versions.napi ?? "10",
            objcJsVersion: "1.5.0",
            architecture: "arm64" as const,
            platform: "macos" as const,
            binding: {
              adapterVersion: "1.0.0",
              targetAppVersion: "26.825.51511",
              targetAppBuild: "7377",
              adapterDigest: "b".repeat(64),
              publicApiDigest: "c".repeat(64),
              evidenceDigest: "d".repeat(64),
            },
            extension: mainIdentity,
            hosts: [],
            windows: [{ id: renderer.windowId, kind: "primary" as const }],
          };
        },
      },
      getOwner(windowId: string) {
        assert.equal(windowId, renderer.windowId);
        return {
          windowId,
          getWebContents: () => webContents,
          getWindow: () => browserWindow,
        };
      },
    } as unknown as MainExtensionContext;
    const rendererContext = {
      extension: {
        ...mainIdentity,
        instanceId: "renderer-instance",
      },
      storage: storageApi,
      lifetime: new AbortController().signal,
      document: renderer,
      main: rendererChannel,
    } as unknown as RendererExtensionContext;

    await Promise.all([
      activateNativeMainProbe(
        mainContext,
        electron as unknown as typeof import("electron/main"),
      ),
      activateNativeRendererProbe(rendererContext),
    ]);

    const stored = storage.get(NATIVE_PROBE_EVIDENCE_FILE);
    assert.ok(stored);
    const evidence = JSON.parse(stored);
    assert.equal(evidence.status, "passed");
    assert.equal(evidence.main.electron.sameSingleton, true);
    assert.deepEqual(evidence.main.objc, {
      framework: NATIVE_PROBE_FOUNDATION,
      className: "NSString",
      input: NATIVE_PROBE_OBJC_INPUT,
      output: NATIVE_PROBE_OBJC_INPUT,
      roundTrip: true,
    });
    assert.equal(evidence.main.node.sha256, NATIVE_PROBE_NODE_SHA256);
    assert.equal(evidence.main.runtime.appBuild, "7377");
    assert.deepEqual(evidence.channel.rendererToMainInvokes, [
      "begin",
      "cancel",
      "finalize",
    ]);
    assert.equal(evidence.channel.connectedRenderers[0].id, renderer.id);
    assert.equal(evidence.channel.owner.ownerWebContentsIsElectronLookup, true);
    assert.equal(evidence.channel.owner.ownerWindowIsElectronLookup, true);
    assert.equal(evidence.channel.owner.ownerWindowContainsWebContents, true);
    assert.equal(evidence.channel.targetedEvent.type, "targeted");
    assert.equal(evidence.channel.broadcastEvent.type, "broadcast");
    assert.equal(evidence.channel.cancellation.invokeRejected, true);
    assert.equal(evidence.channel.cancellation.observedByMain, true);
    assert.equal(evidence.main.resources.blocker.released, true);
    assert.equal(evidence.main.resources.blocker.stopped, true);
    assert.equal(evidence.main.resources.deferredCleanup.runs, 1);
    assert.equal(blockerStops, 1);
  });

  test("the normal builder keeps only host imports external in main", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureRoot, "dist", "package.json"), "utf8"),
    );
    assert.equal(manifest.chatgptx.main, "main.cjs");
    assert.equal(manifest.chatgptx.renderer, "renderer.cjs");

    const metadata = JSON.parse(
      fs.readFileSync(path.join(fixtureRoot, "dist", "build-meta.json"), "utf8"),
    );
    const mainEntry = metadata.main.inputs[
      "test-fixtures/native-main-probe/src/main.ts"
    ];
    assert.deepEqual(
      mainEntry.imports.find((entry: { path: string }) => entry.path === "electron/main"),
      { path: "electron/main", kind: "require-call", external: true },
    );
    const mainBundle = fs.readFileSync(
      path.join(fixtureRoot, "dist", "main.cjs"),
      "utf8",
    );
    const rendererBundle = fs.readFileSync(
      path.join(fixtureRoot, "dist", "renderer.cjs"),
      "utf8",
    );
    assert.match(mainBundle, /require\("electron\/main"\)/);
    assert.match(mainBundle, /require\("node:crypto"\)/);
    assert.equal(mainBundle.includes("require(\"objc-js\")"), false);
    assert.equal(rendererBundle.includes("electron/main"), false);
    assert.equal(rendererBundle.includes("node:crypto"), false);
  });
});
