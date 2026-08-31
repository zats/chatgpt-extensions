"use strict";

const { contextBridge, ipcRenderer, webFrame } = require("electron");

const BOOTSTRAP_CHANNEL = "chatgptx:v5:renderer-bootstrap";
const BOOTSTRAP_ERROR_CHANNEL = "chatgptx:v5:renderer-bootstrap-error";
const MAIN_EVENT_CHANNEL = "chatgptx:v5:main-event";
const PAGEHIDE_CHANNEL = "chatgptx:v5:renderer-pagehide";

const bootstrap = process.isMainFrame
  ? ipcRenderer.sendSync(BOOTSTRAP_CHANNEL)
  : null;
const listeners = new Map();
let pageHidden = false;

function reportError(error) {
  ipcRenderer.send(BOOTSTRAP_ERROR_CHANNEL, String(error));
}

function deactivatePage() {
  if (pageHidden) return;
  pageHidden = true;
  listeners.clear();
  ipcRenderer.send(PAGEHIDE_CHANNEL, bootstrap?.document?.id ?? null);
  try {
    void webFrame
      .executeJavaScript(
        "globalThis.__CHATGPTX_V5_RENDERER_HOST__?.deactivateRendererEntries?.(); void 0",
      )
      .catch(reportError);
  } catch (error) {
    reportError(error);
  }
}

if (process.isMainFrame) {
  globalThis.addEventListener("pagehide", deactivatePage, { once: true });
}

ipcRenderer.on(MAIN_EVENT_CHANNEL, (_event, message) => {
  if (!message || typeof message !== "object") return;
  const key = `${message.extensionId}:${message.event}`;
  for (const listener of listeners.get(key) ?? []) {
    try {
      listener(message.payload);
    } catch (error) {
      reportError(error);
    }
  }
});

contextBridge.exposeInMainWorld(
  "__CGPTX_RUNTIME__",
  Object.freeze({
    document: bootstrap?.document ?? null,
    request(method, parameters = {}) {
      return ipcRenderer.invoke("chatgptx:v5:runtime", { method, parameters });
    },
    subscribe(extensionId, event, listener) {
      if (
        typeof extensionId !== "string" ||
        typeof event !== "string" ||
        typeof listener !== "function"
      ) {
        throw new TypeError("Invalid main-channel subscription");
      }
      const key = `${extensionId}:${event}`;
      const values = listeners.get(key) ?? new Set();
      values.add(listener);
      listeners.set(key, values);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        values.delete(listener);
        if (values.size === 0) listeners.delete(key);
      };
    },
  }),
);

if (
  process.isMainFrame &&
  typeof bootstrap?.hostSource === "string" &&
  bootstrap.hostSource.length > 0
) {
  void webFrame.executeJavaScript(bootstrap.hostSource).catch((error) => {
    reportError(error);
  });
}
