import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./preload.cjs", import.meta.url), "utf8");

function runPreload({ bootstrap, executeJavaScript, isMainFrame = true }) {
  const eventListeners = new Map();
  const ipcListeners = new Map();
  const invoked = [];
  const sent = [];
  const scripts = [];
  let sendSyncCalls = 0;
  let exposed;
  const electron = {
    contextBridge: {
      exposeInMainWorld(_name, value) {
        exposed = value;
      },
    },
    ipcRenderer: {
      invoke: async (channel, request) => {
        invoked.push([channel, request]);
        return "accepted";
      },
      on(channel, listener) {
        ipcListeners.set(channel, listener);
      },
      send(channel, ...values) {
        sent.push([channel, ...values]);
      },
      sendSync() {
        sendSyncCalls += 1;
        return bootstrap;
      },
    },
    webFrame: {
      executeJavaScript(script) {
        scripts.push(script);
        return executeJavaScript?.(script, scripts.length) ?? Promise.resolve();
      },
    },
  };
  const context = vm.createContext({
    console,
    process: { isMainFrame },
    require(name) {
      assert.equal(name, "electron");
      return electron;
    },
    addEventListener(event, listener) {
      eventListeners.set(event, listener);
    },
  });
  context.globalThis = context;

  new vm.Script(source, { filename: "preload.cjs" }).runInContext(context);
  return {
    eventListeners,
    exposed,
    invoked,
    ipcListeners,
    scripts,
    sendSyncCalls: () => sendSyncCalls,
    sent,
  };
}

test("preload deactivates renderer entries and notifies main once on pagehide", async () => {
  const state = runPreload({
    bootstrap: {
      document: {
        id: "document-pagehide",
        windowId: "window-1",
        webContentsId: 1,
        url: "app://chatgpt.com/",
      },
      hostSource: "void 0",
    },
    executeJavaScript(_script, count) {
      return count === 2
        ? Promise.reject(new Error("deactivation failed"))
        : Promise.resolve();
    },
  });
  const {
    eventListeners,
    exposed,
    invoked,
    ipcListeners,
    scripts,
    sent,
  } = state;
  assert.equal(typeof exposed.request, "function");
  assert.equal(state.sendSyncCalls(), 1);
  assert.equal(scripts.length, 1);
  assert.equal(await exposed.request("runtime.info", { extensionId: "test" }), "accepted");
  assert.equal(invoked.length, 1);
  assert.equal(invoked[0][0], "chatgptx:v5:runtime");
  assert.deepEqual(JSON.parse(JSON.stringify(invoked[0][1])), {
    documentId: "document-pagehide",
    method: "runtime.info",
    parameters: { extensionId: "test" },
  });
  let eventCount = 0;
  exposed.subscribe("test", "changed", () => {
    eventCount += 1;
  });
  ipcListeners.get("chatgptx:v5:main-event")({}, {
    extensionId: "test",
    event: "changed",
  });
  assert.equal(eventCount, 1);

  eventListeners.get("pagehide")();
  eventListeners.get("pagehide")();
  await assert.rejects(
    exposed.request("runtime.info", { extensionId: "test" }),
    /renderer document is no longer active/,
  );
  assert.throws(
    () => exposed.subscribe("test", "changed", () => {}),
    /renderer document is no longer active/,
  );
  ipcListeners.get("chatgptx:v5:main-event")({}, {
    extensionId: "test",
    event: "changed",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(sent, [
    ["chatgptx:v5:renderer-pagehide", "document-pagehide"],
    [
      "chatgptx:v5:renderer-bootstrap-error",
      "document-pagehide",
      "Error: deactivation failed",
    ],
  ]);
  assert.equal(scripts.length, 2);
  assert.equal(invoked.length, 1);
  assert.equal(eventCount, 1);
  assert.match(scripts[1], /deactivateRendererEntries/);
  assert.equal(ipcListeners.has("chatgptx:v5:main-event"), true);
});

test("a preload without a bootstrap document has no runtime or event path", async () => {
  const state = runPreload({ bootstrap: null, isMainFrame: false });
  await assert.rejects(
    state.exposed.request("runtime.info", { extensionId: "test" }),
    /renderer document is unavailable/,
  );
  assert.throws(
    () => state.exposed.subscribe("test", "changed", () => {}),
    /renderer document is unavailable/,
  );
  const privateEvent = new Proxy({}, {
    get() {
      throw new Error("A renderer without a document inspected a main event");
    },
  });
  assert.doesNotThrow(() =>
    state.ipcListeners.get("chatgptx:v5:main-event")({}, privateEvent),
  );

  assert.equal(state.sendSyncCalls(), 0);
  assert.equal(state.invoked.length, 0);
  assert.equal(state.eventListeners.size, 0);
  assert.equal(state.scripts.length, 0);
  assert.deepEqual(state.sent, []);
});
