import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./preload.cjs", import.meta.url), "utf8");

test("preload deactivates renderer entries and notifies main once on pagehide", async () => {
  const eventListeners = new Map();
  const ipcListeners = new Map();
  const sent = [];
  const scripts = [];
  let exposed;
  const electron = {
    contextBridge: {
      exposeInMainWorld(_name, value) {
        exposed = value;
      },
    },
    ipcRenderer: {
      invoke: async () => null,
      on(channel, listener) {
        ipcListeners.set(channel, listener);
      },
      send(channel, ...values) {
        sent.push([channel, ...values]);
      },
      sendSync() {
        return {
          document: {
            id: "document-pagehide",
            windowId: "window-1",
            webContentsId: 1,
            url: "app://chatgpt.com/",
          },
          hostSource: "void 0",
        };
      },
    },
    webFrame: {
      executeJavaScript(script) {
        scripts.push(script);
        return Promise.resolve();
      },
    },
  };
  const context = vm.createContext({
    console,
    process: { isMainFrame: true },
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
  assert.equal(typeof exposed.request, "function");
  assert.equal(scripts.length, 1);

  eventListeners.get("pagehide")();
  eventListeners.get("pagehide")();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(sent, [
    ["chatgptx:v5:renderer-pagehide", "document-pagehide"],
  ]);
  assert.equal(scripts.length, 2);
  assert.match(scripts[1], /deactivateRendererEntries/);
  assert.equal(ipcListeners.has("chatgptx:v5:main-event"), true);
});
