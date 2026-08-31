import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import mainHostModule from "./main-extension-host.cjs";

const { createMainExtensionHost } = mainHostModule;

function extension(id) {
  return Object.freeze({
    id,
    name: id.toUpperCase(),
    description: `${id} extension`,
    version: "1.2.3",
    manifestDigest: id[0].repeat(64),
    packageDirectory: `/extensions/${id}`,
    enabled: true,
    required: false,
    capabilities: Object.freeze(["native.electron", "runtime.info"]),
    main: `/extensions/${id}/main.cjs`,
  });
}

function launch(extensions) {
  return Object.freeze({
    file: "/tmp/chatgptx-v5-launch.json",
    apiVersion: "0.2.0",
    appVersion: "26.825.51511",
    appBuild: "7377",
    appAsarSha256: "a".repeat(64),
    binding: Object.freeze({
      adapterVersion: "1.0.0",
      hostFile: "/binding/host.js",
      hostDigest: "b".repeat(64),
    }),
    storageDirectory: "/tmp/chatgptx-v5-storage",
    extensions: Object.freeze(extensions),
  });
}

function fakeElectron() {
  const state = {
    applicationMenu: { id: "host-application-menu" },
    dockBadge: "host-badge",
    dockIcon: { id: "host-icon" },
    dockMenu: { id: "host-dock-menu" },
    shortcuts: new Map(),
    blockers: new Set(),
    stoppedBlockers: [],
  };
  let nextBlocker = 10;
  const webContents = Object.freeze({ id: 41, isDestroyed: () => false });
  const window = Object.freeze({ id: 7, isDestroyed: () => false });
  const electron = Object.freeze({
    app: Object.freeze({
      dock: Object.freeze({
        getBadge: () => state.dockBadge,
        setBadge: (value) => {
          state.dockBadge = value;
        },
        getIcon: () => state.dockIcon,
        setIcon: (value) => {
          state.dockIcon = value;
        },
        getMenu: () => state.dockMenu,
        setMenu: (value) => {
          state.dockMenu = value;
        },
      }),
    }),
    Menu: Object.freeze({
      getApplicationMenu: () => state.applicationMenu,
      setApplicationMenu: (value) => {
        state.applicationMenu = value;
      },
    }),
    globalShortcut: Object.freeze({
      register(accelerator, callback) {
        if (state.shortcuts.has(accelerator)) return false;
        state.shortcuts.set(accelerator, callback);
        return true;
      },
      unregister(accelerator) {
        state.shortcuts.delete(accelerator);
      },
    }),
    powerSaveBlocker: Object.freeze({
      start() {
        const id = nextBlocker++;
        state.blockers.add(id);
        return id;
      },
      isStarted: (id) => state.blockers.has(id),
      stop(id) {
        state.stoppedBlockers.push(id);
        return state.blockers.delete(id);
      },
    }),
    webContents: Object.freeze({
      fromId: (id) => (id === webContents.id ? webContents : null),
    }),
    BrowserWindow: Object.freeze({
      fromWebContents: (value) => (value === webContents ? window : null),
    }),
  });
  return { electron, state, webContents, window };
}

function fakeStorage() {
  const values = new Map();
  const calls = [];
  const key = (extensionId, file) => `${extensionId}/${file}`;
  return {
    calls,
    storage: Object.freeze({
      listFiles(extensionId) {
        calls.push(["listFiles", extensionId]);
        return [...values.keys()]
          .filter((value) => value.startsWith(`${extensionId}/`))
          .map((value) => value.slice(extensionId.length + 1));
      },
      readTextFile(extensionId, file) {
        calls.push(["readTextFile", extensionId, file]);
        return values.get(key(extensionId, file)) ?? null;
      },
      writeTextFile(extensionId, file, contents) {
        calls.push(["writeTextFile", extensionId, file, contents]);
        values.set(key(extensionId, file), contents);
      },
      deleteFile(extensionId, file) {
        calls.push(["deleteFile", extensionId, file]);
        values.delete(key(extensionId, file));
      },
    }),
  };
}

function installed(currentLaunch) {
  return Object.freeze(
    currentLaunch.extensions.map((item) =>
      Object.freeze({
        id: item.id,
        name: item.name,
        description: item.description,
        version: item.version,
        enabled: item.enabled,
        required: item.required,
      }),
    ),
  );
}

function staticExtensionState(currentLaunch) {
  return Object.freeze({
    async list() {
      return installed(currentLaunch);
    },
    async setEnabled() {
      return installed(currentLaunch);
    },
  });
}

const renderer = Object.freeze({
  id: "document-1",
  windowId: "window-1",
  webContentsId: 41,
  url: "app://chatgpt.com/codex",
});

test("main extensions get isolated channels, scoped services, and native leases", async () => {
  const alpha = extension("alpha");
  const beta = extension("beta");
  const currentLaunch = launch([alpha, beta]);
  const { electron, state, webContents, window } = fakeElectron();
  const { storage, calls: storageCalls } = fakeStorage();
  const objc = Object.freeze({ name: "host-objc" });
  const events = [];
  const connectionEvents = { alpha: [], beta: [] };
  const contexts = {};
  const deactivationChecks = [];
  let deferredCleanup = false;
  let cancellationSignal;
  let cancellationStarted;
  const cancellationReady = new Promise((resolve) => {
    cancellationStarted = resolve;
  });
  const hostApplicationMenu = state.applicationMenu;
  const hostDockBadge = state.dockBadge;
  const hostDockIcon = state.dockIcon;
  const hostDockMenu = state.dockMenu;

  const modules = {
    [alpha.main]: {
      async activate(context) {
        contexts.alpha = context;
        assert.equal(context.electron, electron);
        assert.equal(context.objc, objc);
        assert.equal(context.extension.id, "alpha");
        assert.match(context.extension.instanceId, /^[0-9a-f-]{36}$/);
        assert.equal(context.extension.manifestDigest, alpha.manifestDigest);
        assert.equal(context.lifetime.aborted, false);
        assert.deepEqual((await context.extensions.list()).map((item) => item.id), [
          "alpha",
          "beta",
        ]);
        const runtime = await context.runtime.getInfo();
        assert.equal(runtime.extension, context.extension);
        assert.equal(runtime.apiVersion, "0.2.0");
        assert.equal(runtime.appBuild, "7377");
        assert.equal(runtime.binding.adapterDigest, "b".repeat(64));
        assert.equal(
          (await context.runtime.capabilities.get("native.electron")).state,
          "available",
        );
        await context.storage.writeTextFile("state.json", "alpha-state");

        context.renderers.onRendererChange((event) =>
          connectionEvents.alpha.push(event),
        );
        context.renderers.handle("identify", (parameters, call) => ({
          extension: "alpha",
          parameters,
          rendererId: call.renderer.id,
        }));
        assert.throws(
          () => context.renderers.handle("identify", () => undefined),
          /Duplicate renderer method/,
        );
        context.renderers.handle("cancel-me", (_parameters, call) => {
          cancellationSignal = call.signal;
          cancellationStarted();
          return new Promise(() => {});
        });
        context.renderers.handle("invalid-result", () => new Date());

        context.owned.applicationMenu({ id: "alpha-application-menu" });
        context.owned.dockBadge("alpha-badge");
        context.owned.dockIcon({ id: "alpha-icon" });
        context.owned.dockMenu({ id: "alpha-dock-menu" });
        assert.ok(context.owned.globalShortcut("CommandOrControl+Shift+A", () => {}));
        assert.equal(
          context.owned.globalShortcut("CommandOrControl+Shift+A", () => {}),
          null,
        );
        const blocker = context.owned.powerSaveBlocker("prevent-app-suspension");
        assert.equal(blocker.type, "prevent-app-suspension");
        context.disposables.defer(() => {
          deferredCleanup = true;
        });
      },
      deactivate() {
        deactivationChecks.push({
          id: "alpha",
          aborted: contexts.alpha.lifetime.aborted,
          applicationMenu: state.applicationMenu,
          shortcuts: state.shortcuts.size,
          blockers: state.blockers.size,
          deferredCleanup,
        });
      },
    },
    [beta.main]: {
      activate(context) {
        contexts.beta = context;
        context.renderers.onRendererChange((event) =>
          connectionEvents.beta.push(event),
        );
        context.renderers.handle("identify", () => ({ extension: "beta" }));
        context.owned.applicationMenu({ id: "beta-application-menu" });
      },
      deactivate() {
        deactivationChecks.push({
          id: "beta",
          aborted: contexts.beta.lifetime.aborted,
          applicationMenu: state.applicationMenu,
          shortcuts: state.shortcuts.size,
          blockers: state.blockers.size,
          deferredCleanup,
        });
      },
    },
  };

  const host = createMainExtensionHost({
    launch: currentLaunch,
    electron,
    objc,
    storage,
    extensions: staticExtensionState(currentLaunch),
    loadModule: (file) => modules[file],
    sendRendererEvent: (rendererId, message) =>
      events.push({ rendererId, message }),
  });

  assert.deepEqual(await host.activate(), [
    { extensionId: "alpha", status: "active" },
    { extensionId: "beta", status: "active" },
  ]);
  assert.equal(state.applicationMenu.id, "beta-application-menu");
  assert.equal(state.dockBadge, "alpha-badge");
  assert.equal(state.dockIcon.id, "alpha-icon");
  assert.equal(state.dockMenu.id, "alpha-dock-menu");
  assert.equal(state.shortcuts.size, 1);
  assert.equal(state.blockers.size, 1);
  assert.deepEqual(storageCalls[0], [
    "writeTextFile",
    "alpha",
    "state.json",
    "alpha-state",
  ]);

  assert.deepEqual(host.rendererConnected(renderer), renderer);
  assert.equal(connectionEvents.alpha[0].type, "connected");
  assert.equal(connectionEvents.beta[0].type, "connected");
  assert.deepEqual(contexts.alpha.renderers.listRenderers()[0], renderer);
  assert.equal(contexts.alpha.getOwner("window-1").getWebContents(), webContents);
  assert.equal(contexts.alpha.getOwner("window-1").getWindow(), window);

  const alphaResult = await host.handleRendererRequest(
    "main-channel.invoke",
    {
      extensionId: "alpha",
      documentId: renderer.id,
      callId: "alpha-call",
      method: "identify",
      parameters: { value: 1 },
    },
    renderer,
    webContents,
  );
  const betaResult = await host.handleRendererRequest(
    "main-channel.invoke",
    {
      extensionId: "beta",
      documentId: renderer.id,
      callId: "beta-call",
      method: "identify",
    },
    renderer,
    webContents,
  );
  assert.deepEqual(alphaResult, {
    extension: "alpha",
    parameters: { value: 1 },
    rendererId: renderer.id,
  });
  assert.deepEqual(betaResult, { extension: "beta" });

  contexts.alpha.renderers.send(renderer.id, "one", { value: 1 });
  contexts.beta.renderers.broadcast("all", [1, 2]);
  assert.deepEqual(events, [
    {
      rendererId: renderer.id,
      message: { extensionId: "alpha", event: "one", payload: { value: 1 } },
    },
    {
      rendererId: renderer.id,
      message: { extensionId: "beta", event: "all", payload: [1, 2] },
    },
  ]);
  assert.throws(
    () => contexts.alpha.renderers.send(renderer.id, "bad", new Date()),
    /must contain only JSON objects/,
  );
  await assert.rejects(
    host.handleRendererRequest(
      "main-channel.invoke",
      {
        extensionId: "alpha",
        documentId: renderer.id,
        callId: "bad-result",
        method: "invalid-result",
      },
      renderer,
      webContents,
    ),
    /must contain only JSON objects/,
  );

  const pending = host.handleRendererRequest(
    "main-channel.invoke",
    {
      extensionId: "alpha",
      documentId: renderer.id,
      callId: "cancelled-call",
      method: "cancel-me",
    },
    renderer,
    webContents,
  );
  await cancellationReady;
  assert.equal(
    host.handleRendererRequest(
      "main-channel.cancel",
      {
        extensionId: "alpha",
        documentId: renderer.id,
        callId: "cancelled-call",
      },
      renderer,
      webContents,
    ),
    true,
  );
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancellationSignal.aborted, true);

  assert.equal(host.rendererDisconnected(renderer.id), true);
  assert.equal(connectionEvents.alpha.at(-1).type, "disconnected");
  assert.equal(connectionEvents.beta.at(-1).type, "disconnected");
  assert.equal(contexts.alpha.getOwner("window-1"), null);

  const shutdown = host.shutdown();
  // Electron does not await before-quit listeners. Native cleanup is immediate.
  assert.equal(state.applicationMenu, hostApplicationMenu);
  assert.equal(state.dockBadge, hostDockBadge);
  assert.equal(state.dockIcon, hostDockIcon);
  assert.equal(state.dockMenu, hostDockMenu);
  assert.equal(state.shortcuts.size, 0);
  assert.equal(state.blockers.size, 0);
  await shutdown;
  assert.equal(state.stoppedBlockers.length, 1);
  assert.equal(deferredCleanup, true);
  assert.deepEqual(
    deactivationChecks.map((value) => value.id),
    ["beta", "alpha"],
  );
  for (const check of deactivationChecks) {
    assert.equal(check.aborted, true);
    assert.equal(check.applicationMenu, hostApplicationMenu);
    assert.equal(check.shortcuts, 0);
    assert.equal(check.blockers, 0);
    assert.equal(check.deferredCleanup, true);
  }
});

test("renderer disconnect aborts pending calls and JSON input is strict", async () => {
  const alpha = extension("alpha");
  const { electron } = fakeElectron();
  const { storage } = fakeStorage();
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const currentLaunch = launch([alpha]);
  const host = createMainExtensionHost({
    launch: currentLaunch,
    electron,
    objc: {},
    storage,
    extensions: staticExtensionState(currentLaunch),
    sendRendererEvent() {},
    loadModule: () => ({
      activate(context) {
        context.renderers.handle("wait", (_parameters, call) => {
          started(call.signal);
          return new Promise(() => {});
        });
      },
    }),
  });
  await host.activate();
  host.rendererConnected(renderer);

  assert.throws(
    () =>
      host.handleRendererRequest(
        "main-channel.invoke",
        {
          extensionId: "alpha",
          documentId: renderer.id,
          callId: "invalid-json",
          method: "wait",
          parameters: { invalid: undefined },
        },
        renderer,
        {},
      ),
    /must be JSON/,
  );
  assert.throws(
    () =>
      host.handleRendererRequest(
        "main-channel.cancel",
        {
          extensionId: "alpha",
          documentId: "foreign-document",
          callId: "call",
        },
        renderer,
        {},
      ),
    /does not match the caller/,
  );

  const pending = host.handleRendererRequest(
    "main-channel.invoke",
    {
      extensionId: "alpha",
      documentId: renderer.id,
      callId: "disconnect-call",
      method: "wait",
    },
    renderer,
    {},
  );
  const signal = await ready;
  host.rendererDisconnected(renderer.id);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(signal.aborted, true);
  await host.shutdown();
});

test("main extension management reads and updates the shared launch state", async () => {
  const alpha = extension("alpha");
  let sharedLaunch = launch([alpha]);
  const callers = [];
  const { electron } = fakeElectron();
  const { storage } = fakeStorage();
  let context;
  const extensions = Object.freeze({
    async list(callerExtensionId) {
      callers.push(["list", callerExtensionId]);
      return installed(sharedLaunch);
    },
    async setEnabled(callerExtensionId, targetExtensionId, enabled) {
      callers.push(["set", callerExtensionId, targetExtensionId, enabled]);
      sharedLaunch = Object.freeze({
        ...sharedLaunch,
        extensions: Object.freeze(
          sharedLaunch.extensions.map((item) =>
            item.id === targetExtensionId
              ? Object.freeze({ ...item, enabled })
              : item,
          ),
        ),
      });
      return installed(sharedLaunch);
    },
  });
  const host = createMainExtensionHost({
    launch: sharedLaunch,
    electron,
    objc: {},
    storage,
    extensions,
    sendRendererEvent() {},
    loadModule: () => ({
      activate(value) {
        context = value;
      },
    }),
  });

  await host.activate();
  sharedLaunch = Object.freeze({
    ...sharedLaunch,
    extensions: Object.freeze([
      Object.freeze({ ...sharedLaunch.extensions[0], enabled: false }),
    ]),
  });
  assert.equal((await context.extensions.list())[0].enabled, false);
  assert.equal(
    (await context.extensions.setEnabled("alpha", true))[0].enabled,
    true,
  );
  assert.equal(installed(sharedLaunch)[0].enabled, true);
  assert.deepEqual(callers, [
    ["list", "alpha"],
    ["set", "alpha", "alpha", true],
  ]);
  await host.shutdown();
});

test("main capabilities honor scope, cursor reset, structured errors, and lifetime", async () => {
  const alpha = Object.freeze({
    ...extension("alpha"),
    capabilities: Object.freeze([
      "native.electron",
      "runtime.info",
      "threads.read",
    ]),
  });
  const currentLaunch = launch([alpha]);
  const { electron } = fakeElectron();
  const { storage } = fakeStorage();
  let context;
  const errors = [];
  const host = createMainExtensionHost({
    launch: currentLaunch,
    electron,
    objc: {},
    storage,
    extensions: staticExtensionState(currentLaunch),
    sendRendererEvent() {},
    onError: (error, detail) => errors.push({ error, detail }),
    loadModule: () => ({
      activate(value) {
        context = value;
      },
    }),
  });

  await host.activate();
  assert.ok(context);
  const capabilities = context.runtime.capabilities;
  assert.deepEqual((await capabilities.getSnapshot()).scope, { kind: "global" });
  const runtimeInfo = await capabilities.get("runtime.info");
  assert.equal(runtimeInfo.state, "available");
  assert.deepEqual(runtimeInfo.operations, ["getInfo"]);

  const windowScope = Object.freeze({ kind: "window", windowId: "window-1" });
  const scopedStatus = await capabilities.get("native.electron", {
    scope: windowScope,
  });
  assert.deepEqual(scopedStatus.scope, windowScope);
  assert.equal(scopedStatus.state, "available");
  const unavailableStatus = await capabilities.get("threads.read", {
    scope: windowScope,
  });
  assert.deepEqual(unavailableStatus.scope, windowScope);
  assert.equal(unavailableStatus.state, "unavailable");
  assert.equal(unavailableStatus.unavailableReason, "renderer-unavailable");
  const scopedSnapshot = await capabilities.getSnapshot({ scope: windowScope });
  assert.deepEqual(scopedSnapshot.scope, windowScope);
  assert.ok(
    scopedSnapshot.statuses.every(
      (status) => status.scope.kind === "window",
    ),
  );
  assert.equal(
    scopedSnapshot.statuses.find((status) => status.id === "threads.read")
      ?.state,
    "unavailable",
  );
  await assert.rejects(
    capabilities.require("threads.read", { scope: windowScope }),
    (error) => {
      assert.equal(error.name, "ChatGPTXApiError");
      assert.equal(error.code, "capability-unavailable");
      assert.equal(error.retryable, false);
      assert.deepEqual(error.details, {
        capabilityId: "threads.read",
        reason: "renderer-unavailable",
      });
      return true;
    },
  );

  const resumed = [];
  const unsubscribe = capabilities.changed.subscribe(
    (message) => resumed.push(message),
    { afterCursor: "old" },
  );
  await Promise.resolve();
  assert.deepEqual(
    resumed.map(({ type, cursor, reason }) => ({ type, cursor, reason })),
    [
      { type: "reset", cursor: "1", reason: "cursor-expired" },
      { type: "snapshot", cursor: "1", reason: undefined },
    ],
  );
  unsubscribe();

  const cancelled = [];
  const controller = new AbortController();
  capabilities.changed.subscribe((message) => cancelled.push(message), {
    signal: controller.signal,
  });
  controller.abort();
  await Promise.resolve();
  assert.deepEqual(cancelled, []);

  const stopped = [];
  capabilities.changed.subscribe((message) => stopped.push(message));
  const shutdown = host.shutdown();
  await Promise.resolve();
  assert.deepEqual(stopped, []);
  await shutdown;

  const inactiveRuntimeInfo = await capabilities.get("runtime.info");
  assert.equal(inactiveRuntimeInfo.state, "unavailable");
  assert.equal(inactiveRuntimeInfo.unavailableReason, "extension-deactivated");
  assert.deepEqual(inactiveRuntimeInfo.operations, []);
  const inactiveSnapshot = await capabilities.getSnapshot();
  assert.ok(
    inactiveSnapshot.statuses.every(
      (status) =>
        status.state === "unavailable" &&
        status.unavailableReason === "extension-deactivated" &&
        status.operations.length === 0,
    ),
  );
  await assert.rejects(capabilities.require("runtime.info"), (error) => {
    assert.equal(error.name, "ChatGPTXApiError");
    assert.equal(error.code, "capability-unavailable");
    assert.equal(error.retryable, false);
    assert.deepEqual(error.details, {
      capabilityId: "runtime.info",
      reason: "extension-deactivated",
    });
    return true;
  });
  assert.deepEqual(errors, []);
});

test("all main entries can wait for the first renderer connection", async () => {
  const alpha = extension("alpha");
  const beta = extension("beta");
  const currentLaunch = launch([alpha, beta]);
  const { electron } = fakeElectron();
  const { storage } = fakeStorage();
  const modules = Object.fromEntries(
    [alpha, beta].map((item) => [
      item.main,
      {
        activate(context) {
          return new Promise((resolve) => {
            const registration = context.renderers.onRendererChange((event) => {
              if (event.type !== "connected") return;
              registration.dispose();
              resolve();
            });
          });
        },
      },
    ]),
  );
  const host = createMainExtensionHost({
    launch: currentLaunch,
    electron,
    objc: {},
    storage,
    extensions: staticExtensionState(currentLaunch),
    sendRendererEvent() {},
    loadModule: (file) => modules[file],
  });

  const activation = host.activate();
  host.rendererConnected(renderer);
  assert.deepEqual(await activation, [
    { extensionId: "alpha", status: "active" },
    { extensionId: "beta", status: "active" },
  ]);
  await host.shutdown();
});

test("a failed activation releases native state before deactivate", async () => {
  const alpha = extension("alpha");
  const { electron, state } = fakeElectron();
  const { storage } = fakeStorage();
  const originalBadge = state.dockBadge;
  let context;
  let badgeDuringDeactivate;
  const errors = [];
  const currentLaunch = launch([alpha]);
  const host = createMainExtensionHost({
    launch: currentLaunch,
    electron,
    objc: {},
    storage,
    extensions: staticExtensionState(currentLaunch),
    sendRendererEvent() {},
    onError: (error, detail) => errors.push({ error, detail }),
    loadModule: () => ({
      activate(value) {
        context = value;
        value.owned.dockBadge("temporary");
        throw new Error("activation failed");
      },
      deactivate() {
        badgeDuringDeactivate = state.dockBadge;
      },
    }),
  });

  const results = await host.activate();
  assert.equal(results[0].status, "failed");
  assert.match(results[0].error.message, /activation failed/);
  assert.equal(context.lifetime.aborted, true);
  assert.equal(state.dockBadge, originalBadge);
  assert.equal(badgeDuringDeactivate, originalBadge);
  assert.equal(errors.some((item) => item.detail.phase === "activate"), true);
  await host.shutdown();
});

test("resources acquired after shutdown are disposed immediately", async () => {
  const alpha = extension("alpha");
  const { electron, state } = fakeElectron();
  const { storage } = fakeStorage();
  const originalBadge = state.dockBadge;
  const cleanupFailure = new Error("late cleanup failed");
  const errors = [];
  let continueActivation;
  const activationGate = new Promise((resolve) => {
    continueActivation = resolve;
  });
  let activationStarted;
  const activationReady = new Promise((resolve) => {
    activationStarted = resolve;
  });
  let invalidResourceError;
  let lateResourceDisposed = false;

  const currentLaunch = launch([alpha]);
  const host = createMainExtensionHost({
    launch: currentLaunch,
    electron,
    objc: {},
    storage,
    extensions: staticExtensionState(currentLaunch),
    sendRendererEvent() {},
    onError: (error, detail) => errors.push({ error, detail }),
    loadModule: () => ({
      async activate(context) {
        activationStarted();
        await activationGate;

        try {
          context.disposables.own({});
        } catch (error) {
          invalidResourceError = error;
        }
        try {
          context.disposables.own({
            dispose() {
              lateResourceDisposed = true;
              throw cleanupFailure;
            },
          });
        } catch {}

        context.owned.dockBadge("late-badge");
      },
    }),
  });

  const activation = host.activate();
  await activationReady;
  const shutdown = host.shutdown();
  continueActivation();

  const results = await activation;
  await shutdown;
  assert.equal(results[0].status, "failed");
  assert.match(results[0].error.message, /Extension alpha is inactive/);
  assert.match(invalidResourceError.message, /must have a dispose method/);
  assert.equal(lateResourceDisposed, true);
  assert.equal(state.dockBadge, originalBadge);
  assert.equal(
    errors.some(
      (item) =>
        item.error === cleanupFailure && item.detail.phase === "native-cleanup",
    ),
    true,
  );
});

test("the default loader activates a normal bundled main.cjs module", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chatgptx-v5-main-"));
  const mainFile = path.join(directory, "main.cjs");
  const captureKey = `__chatgptxMainTest${Date.now()}`;
  const deactivateKey = `${captureKey}Deactivated`;
  fs.writeFileSync(
    mainFile,
    `module.exports = {
  activate(context) { globalThis[${JSON.stringify(captureKey)}] = context; },
  deactivate() { globalThis[${JSON.stringify(deactivateKey)}] = true; }
};\n`,
  );
  const alpha = Object.freeze({ ...extension("alpha"), main: mainFile });
  const { electron } = fakeElectron();
  const { storage } = fakeStorage();

  try {
    const currentLaunch = launch([alpha]);
    const host = createMainExtensionHost({
      launch: currentLaunch,
      electron,
      objc: {},
      storage,
      extensions: staticExtensionState(currentLaunch),
      sendRendererEvent() {},
    });
    assert.deepEqual(await host.activate(), [
      { extensionId: "alpha", status: "active" },
    ]);
    assert.equal(globalThis[captureKey].extension.id, "alpha");
    assert.equal(globalThis[captureKey].electron, electron);
    await host.shutdown();
    assert.equal(globalThis[deactivateKey], true);
  } finally {
    delete globalThis[captureKey];
    delete globalThis[deactivateKey];
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Dock icon leases restore the native AppKit icon when Electron has no getter", async () => {
  const alpha = extension("alpha");
  const fake = fakeElectron();
  const { getIcon: _getIcon, ...dockWithoutGetter } = fake.electron.app.dock;
  const electron = Object.freeze({
    ...fake.electron,
    app: Object.freeze({ dock: Object.freeze(dockWithoutGetter) }),
  });
  const nativeIcon = Object.freeze({ id: "native-host-icon" });
  let restoredIcon;
  const application = Object.freeze({
    applicationIconImage: () => nativeIcon,
    setApplicationIconImage$: (image) => {
      restoredIcon = image;
    },
  });
  class NobjcLibrary {
    constructor() {
      return {
        NSApplication: {
          sharedApplication: () => application,
        },
      };
    }
  }
  const { storage } = fakeStorage();
  const currentLaunch = launch([alpha]);
  const host = createMainExtensionHost({
    launch: currentLaunch,
    electron,
    objc: { NobjcLibrary },
    storage,
    extensions: staticExtensionState(currentLaunch),
    sendRendererEvent() {},
    loadModule: () => ({
      activate(context) {
        context.owned.dockIcon({ id: "extension-icon" });
      },
    }),
  });

  await host.activate();
  assert.equal(fake.state.dockIcon.id, "extension-icon");
  await host.shutdown();
  assert.equal(restoredIcon, nativeIcon);
});
