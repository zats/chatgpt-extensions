"use strict";

const crypto = require("node:crypto");

const {
  createExtensionStorageMain,
} = require("./extension-storage-main.cjs");

const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/;
const powerSaveBlockerTypes = new Set([
  "prevent-app-suspension",
  "prevent-display-sleep",
]);

function plainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertExtensionId(value) {
  if (typeof value !== "string" || !extensionIdPattern.test(value)) {
    throw new TypeError("Invalid extension id");
  }
}

function assertJson(value, name, allowUndefined = true, active = new Set()) {
  if (value === undefined && allowUndefined) return;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new TypeError(`${name} must be JSON`);
  }
  if (typeof value !== "object") {
    throw new TypeError(`${name} must be JSON`);
  }
  if (active.has(value)) {
    throw new TypeError(`${name} must not contain a cycle`);
  }

  active.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) assertJson(item, name, false, active);
      return;
    }
    if (!plainObject(value)) {
      throw new TypeError(`${name} must contain only JSON objects`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(value, key)) {
        throw new TypeError(`${name} must contain only JSON properties`);
      }
      assertJson(value[key], name, false, active);
    }
  } finally {
    active.delete(value);
  }
}

function abortError(message) {
  return new DOMException(message, "AbortError");
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw abortError("The operation was cancelled");
}

function checkOptions(options) {
  if (options === undefined) return undefined;
  if (!plainObject(options)) throw new TypeError("Request options must be an object");
  return options.signal;
}

const globalCapabilityScope = Object.freeze({ kind: "global" });
const capabilityScopeKinds = new Set([
  "global",
  "host",
  "account",
  "window",
  "thread",
  "cloud-workspace",
]);

function checkCapabilityOptions(options) {
  const signal = checkOptions(options);
  const value = options?.scope;
  if (value === undefined) {
    return Object.freeze({ signal, scope: globalCapabilityScope });
  }
  if (!plainObject(value) || !capabilityScopeKinds.has(value.kind)) {
    throw new TypeError("Capability scope is invalid");
  }
  return Object.freeze({ signal, scope: Object.freeze({ ...value }) });
}

function frozenDisposable(cleanup) {
  let disposed = false;
  return Object.freeze({
    get released() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cleanup();
    },
  });
}

function report(onError, error, detail) {
  try {
    onError(error, Object.freeze({ ...detail }));
  } catch {}
}

function createResourceBag(onError, extensionId) {
  const resources = [];
  let released = false;

  function own(resource) {
    if (!resource || typeof resource.dispose !== "function") {
      throw new TypeError("An owned resource must have a dispose method");
    }
    if (released) {
      try {
        resource.dispose();
      } catch (error) {
        report(onError, error, {
          extensionId,
          phase: "native-cleanup",
        });
      }
      throw new Error(`Extension ${extensionId} is inactive`);
    }
    resources.push(resource);
    return resource;
  }

  function defer(cleanup) {
    if (typeof cleanup !== "function") {
      throw new TypeError("A cleanup callback is required");
    }
    let resource;
    resource = frozenDisposable(() => {
      const index = resources.lastIndexOf(resource);
      if (index >= 0) resources.splice(index, 1);
      cleanup();
    });
    own(resource);
    return resource;
  }

  function releaseAll() {
    if (released) return;
    released = true;
    const pending = resources.splice(0).reverse();
    for (const resource of pending) {
      try {
        resource.dispose();
      } catch (error) {
        report(onError, error, {
          extensionId,
          phase: "native-cleanup",
        });
      }
    }
  }

  return Object.freeze({
    api: Object.freeze({ own, defer }),
    own,
    releaseAll,
  });
}

function createValueLeaseCoordinator({ name, read, write, restore, onError }) {
  const leases = [];
  let baseline;
  let hasBaseline = false;

  function acquire(value) {
    if (leases.length === 0) {
      if (typeof read === "function") {
        baseline = read();
        hasBaseline = true;
      } else if (typeof restore !== "function") {
        throw new Error(`${name} cannot be restored by this host`);
      }
    }

    let record;
    const lease = frozenDisposable(() => {
      const index = leases.indexOf(record);
      if (index < 0) return;
      leases.splice(index, 1);
      try {
        if (leases.length > 0) {
          write(leases.at(-1).value);
        } else if (typeof restore === "function") {
          restore(hasBaseline ? baseline : undefined);
        } else {
          write(baseline);
        }
      } catch (error) {
        report(onError, error, { phase: "native-restore", resource: name });
      }
    });
    record = { lease, value };
    leases.push(record);
    try {
      write(value);
    } catch (error) {
      leases.pop();
      throw error;
    }
    return lease;
  }

  return Object.freeze({ acquire });
}

function createNativeLeaseCoordinator(options, onError) {
  const electron = options.electron;
  const dock = electron.app?.dock;

  function objcDockIconAccess() {
    let application;
    return Object.freeze({
      read() {
        if (typeof options.objc.NobjcLibrary !== "function") {
          throw new Error("The host cannot capture the current Dock icon");
        }
        const appKit = new options.objc.NobjcLibrary(
          "/System/Library/Frameworks/AppKit.framework/AppKit",
        );
        application = appKit.NSApplication.sharedApplication();
        return application.applicationIconImage();
      },
      restore(image) {
        if (!application) {
          throw new Error("The host did not capture the current Dock icon");
        }
        application.setApplicationIconImage$(image);
      },
    });
  }

  const applicationMenu = createValueLeaseCoordinator({
    name: "application menu",
    read: () => electron.Menu.getApplicationMenu(),
    write: (value) => electron.Menu.setApplicationMenu(value),
    onError,
  });
  const dockBadge = createValueLeaseCoordinator({
    name: "Dock badge",
    read: dock && typeof dock.getBadge === "function" ? () => dock.getBadge() : undefined,
    write: (value) => {
      if (!dock || typeof dock.setBadge !== "function") {
        throw new Error("The macOS Dock API is unavailable");
      }
      dock.setBadge(value);
    },
    onError,
  });
  const dockMenu = createValueLeaseCoordinator({
    name: "Dock menu",
    read: dock && typeof dock.getMenu === "function" ? () => dock.getMenu() : undefined,
    write: (value) => {
      if (!dock || typeof dock.setMenu !== "function") {
        throw new Error("The macOS Dock API is unavailable");
      }
      dock.setMenu(value);
    },
    onError,
  });

  const suppliedDockIcon = Object.prototype.hasOwnProperty.call(options, "initialDockIcon");
  const nativeDockIcon = objcDockIconAccess();
  const usesObjcDockIcon =
    typeof options.getDockIcon !== "function" &&
    !(dock && typeof dock.getIcon === "function") &&
    !suppliedDockIcon;
  const dockIcon = createValueLeaseCoordinator({
    name: "Dock icon",
    read:
      typeof options.getDockIcon === "function"
        ? options.getDockIcon
        : dock && typeof dock.getIcon === "function"
          ? () => dock.getIcon()
          : suppliedDockIcon
            ? () => options.initialDockIcon
            : nativeDockIcon.read,
    write: (value) => {
      if (!dock || typeof dock.setIcon !== "function") {
        throw new Error("The macOS Dock API is unavailable");
      }
      dock.setIcon(value);
    },
    restore:
      typeof options.restoreDockIcon === "function"
        ? options.restoreDockIcon
        : usesObjcDockIcon
          ? nativeDockIcon.restore
          : undefined,
    onError,
  });

  const shortcutLeases = new Map();

  function globalShortcut(accelerator, callback, extensionId) {
    assertNonEmptyString(accelerator, "Global shortcut accelerator");
    if (typeof callback !== "function") {
      throw new TypeError("Global shortcut callback must be a function");
    }
    if (shortcutLeases.has(accelerator)) return null;
    const shortcuts = electron.globalShortcut;
    if (!shortcuts || typeof shortcuts.register !== "function") {
      throw new Error("Electron globalShortcut is unavailable");
    }
    const registered = shortcuts.register(accelerator, () => {
      try {
        callback();
      } catch (error) {
        report(onError, error, {
          extensionId,
          phase: "global-shortcut-callback",
          accelerator,
        });
      }
    });
    if (!registered) return null;

    let lease;
    const base = frozenDisposable(() => {
      if (shortcutLeases.get(accelerator) !== lease) return;
      shortcutLeases.delete(accelerator);
      shortcuts.unregister(accelerator);
    });
    lease = Object.freeze({
      get accelerator() {
        return accelerator;
      },
      get released() {
        return base.released;
      },
      dispose: base.dispose,
    });
    shortcutLeases.set(accelerator, lease);
    return lease;
  }

  function powerSaveBlocker(type) {
    if (!powerSaveBlockerTypes.has(type)) {
      throw new TypeError("Invalid power-save blocker type");
    }
    const blockers = electron.powerSaveBlocker;
    if (!blockers || typeof blockers.start !== "function") {
      throw new Error("Electron powerSaveBlocker is unavailable");
    }
    const id = blockers.start(type);
    const base = frozenDisposable(() => {
      if (typeof blockers.isStarted !== "function" || blockers.isStarted(id)) {
        blockers.stop(id);
      }
    });
    return Object.freeze({
      get id() {
        return id;
      },
      get type() {
        return type;
      },
      get released() {
        return base.released;
      },
      dispose: base.dispose,
    });
  }

  function forExtension(extensionId, bag) {
    return Object.freeze({
      applicationMenu(menu) {
        return bag.own(applicationMenu.acquire(menu));
      },
      dockBadge(text) {
        if (typeof text !== "string") throw new TypeError("Dock badge must be a string");
        return bag.own(dockBadge.acquire(text));
      },
      dockIcon(image) {
        if (typeof image !== "string" && (!image || typeof image !== "object")) {
          throw new TypeError("Dock icon must be a NativeImage or path");
        }
        return bag.own(dockIcon.acquire(image));
      },
      dockMenu(menu) {
        if (!menu || typeof menu !== "object") {
          throw new TypeError("Dock menu must be an Electron Menu");
        }
        return bag.own(dockMenu.acquire(menu));
      },
      globalShortcut(accelerator, callback) {
        const lease = globalShortcut(accelerator, callback, extensionId);
        return lease ? bag.own(lease) : null;
      },
      powerSaveBlocker(type) {
        return bag.own(powerSaveBlocker(type));
      },
    });
  }

  return Object.freeze({ forExtension });
}

function validateRendererDocument(renderer) {
  if (!plainObject(renderer)) throw new TypeError("Invalid renderer document");
  for (const key of ["id", "windowId", "url"]) {
    assertNonEmptyString(renderer[key], `Renderer ${key}`);
  }
  if (!Number.isSafeInteger(renderer.webContentsId) || renderer.webContentsId <= 0) {
    throw new TypeError("Renderer webContentsId must be a positive integer");
  }
  return Object.freeze({
    id: renderer.id,
    windowId: renderer.windowId,
    webContentsId: renderer.webContentsId,
    url: renderer.url,
  });
}

function createMainExtensionHost(options) {
  if (!plainObject(options)) throw new TypeError("Main extension host options are required");
  if (!plainObject(options.launch) || !Array.isArray(options.launch.extensions)) {
    throw new TypeError("A loaded v5 launch configuration is required");
  }
  if (!options.electron || typeof options.electron !== "object") {
    throw new TypeError("The captured Electron main namespace is required");
  }
  if (!options.objc || typeof options.objc !== "object") {
    throw new TypeError("The host objc-js module is required");
  }
  if (typeof options.sendRendererEvent !== "function") {
    throw new TypeError("A renderer event transport is required");
  }
  if (
    !plainObject(options.extensions) ||
    typeof options.extensions.list !== "function" ||
    typeof options.extensions.setEnabled !== "function"
  ) {
    throw new TypeError("A shared extension-state service is required");
  }

  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const loadModule = typeof options.loadModule === "function" ? options.loadModule : require;
  const storage = options.storage ?? createExtensionStorageMain(options.launch.storageDirectory);
  const extensionState = options.extensions;
  const nativeLeases = createNativeLeaseCoordinator(options, onError);
  const channels = new Map();
  const states = new Map();
  const activeExtensions = new Map(
    options.launch.extensions
      .filter((extension) => extension.enabled)
      .map((extension) => [extension.id, extension]),
  );
  const launch = options.launch;
  let activationPromise;
  let shuttingDown = false;
  let shutdownPromise;

  function requireExtension(extensionId) {
    assertExtensionId(extensionId);
    const extension = activeExtensions.get(extensionId);
    if (!extension) {
      throw new Error(`Extension is not active: ${extensionId}`);
    }
    return extension;
  }

  function notifyRendererChange(channel, event) {
    for (const listener of [...channel.listeners]) {
      try {
        listener(event);
      } catch (error) {
        report(onError, error, {
          extensionId: channel.extensionId,
          phase: "renderer-change-listener",
        });
      }
    }
  }

  function abortPending(channel, predicate, reason) {
    for (const [key, pending] of channel.pending) {
      if (!predicate(pending)) continue;
      channel.pending.delete(key);
      pending.controller.abort(reason);
    }
  }

  function makeChannel(extensionId) {
    const channel = {
      extensionId,
      handlers: new Map(),
      listeners: new Set(),
      renderers: new Map(),
      pending: new Map(),
      registrationsReleased: false,
    };

    const api = Object.freeze({
      handle(method, handler) {
        assertNonEmptyString(method, "Renderer method");
        if (typeof handler !== "function") {
          throw new TypeError("Renderer method handler must be a function");
        }
        if (channel.registrationsReleased) {
          throw new Error(`Extension ${extensionId} is inactive`);
        }
        if (channel.handlers.has(method)) {
          throw new Error(`Duplicate renderer method: ${method}`);
        }
        channel.handlers.set(method, handler);
        return frozenDisposable(() => {
          if (channel.handlers.get(method) === handler) channel.handlers.delete(method);
        });
      },
      send(rendererId, event, payload) {
        assertNonEmptyString(rendererId, "Renderer id");
        assertNonEmptyString(event, "Renderer event");
        assertJson(payload, "Renderer event payload");
        const renderer = channel.renderers.get(rendererId);
        if (!renderer) throw new Error(`Renderer is not connected: ${rendererId}`);
        options.sendRendererEvent(
          renderer.id,
          Object.freeze({ extensionId, event, payload }),
        );
      },
      broadcast(event, payload) {
        assertNonEmptyString(event, "Renderer event");
        assertJson(payload, "Renderer event payload");
        for (const renderer of [...channel.renderers.values()]) {
          options.sendRendererEvent(
            renderer.id,
            Object.freeze({ extensionId, event, payload }),
          );
        }
      },
      listRenderers() {
        return Object.freeze([...channel.renderers.values()]);
      },
      onRendererChange(listener) {
        if (typeof listener !== "function") {
          throw new TypeError("Renderer change listener must be a function");
        }
        if (channel.registrationsReleased) {
          throw new Error(`Extension ${extensionId} is inactive`);
        }
        channel.listeners.add(listener);
        const existing = [...channel.renderers.values()];
        if (existing.length > 0) {
          queueMicrotask(() => {
            if (!channel.listeners.has(listener)) return;
            for (const renderer of existing) {
              try {
                listener(Object.freeze({ type: "connected", renderer }));
              } catch (error) {
                report(onError, error, {
                  extensionId,
                  phase: "renderer-change-listener",
                });
              }
            }
          });
        }
        return frozenDisposable(() => channel.listeners.delete(listener));
      },
    });

    channel.api = api;
    channels.set(extensionId, channel);
    return channel;
  }

  for (const extension of activeExtensions.values()) makeChannel(extension.id);

  function scopedStorage(extensionId) {
    return Object.freeze({
      async listFiles(requestOptions) {
        const signal = checkOptions(requestOptions);
        throwIfAborted(signal);
        const files = storage.listFiles(extensionId);
        throwIfAborted(signal);
        return Object.freeze([...files]);
      },
      async readTextFile(file, requestOptions) {
        const signal = checkOptions(requestOptions);
        throwIfAborted(signal);
        const contents = storage.readTextFile(extensionId, file);
        throwIfAborted(signal);
        return contents === null ? undefined : contents;
      },
      async writeTextFile(file, contents, requestOptions) {
        const signal = checkOptions(requestOptions);
        throwIfAborted(signal);
        storage.writeTextFile(extensionId, file, contents);
        throwIfAborted(signal);
      },
      async deleteFile(file, requestOptions) {
        const signal = checkOptions(requestOptions);
        throwIfAborted(signal);
        storage.deleteFile(extensionId, file);
        throwIfAborted(signal);
      },
    });
  }

  function extensionsApi(callerExtensionId) {
    return Object.freeze({
      async list(requestOptions) {
        const signal = checkOptions(requestOptions);
        throwIfAborted(signal);
        const result = await extensionState.list(callerExtensionId);
        throwIfAborted(signal);
        return result;
      },
      async setEnabled(extensionId, enabled, requestOptions) {
        const signal = checkOptions(requestOptions);
        throwIfAborted(signal);
        const result = await extensionState.setEnabled(
          callerExtensionId,
          extensionId,
          enabled,
        );
        throwIfAborted(signal);
        return result;
      },
    });
  }

  function connectedWindows() {
    const byWindow = new Map();
    for (const channel of channels.values()) {
      for (const renderer of channel.renderers.values()) {
        if (!byWindow.has(renderer.windowId)) {
          byWindow.set(
            renderer.windowId,
            Object.freeze({ id: renderer.windowId, kind: "primary" }),
          );
        }
      }
    }
    return Object.freeze([...byWindow.values()]);
  }

  function capabilityApi(extension, lifetime) {
    const available = new Set([
      "native.electron",
      "native.macos",
      "native.node",
      "native.objc",
      "runtime.info",
    ]);
    const operations = new Map([
      ["runtime.info", Object.freeze(["getInfo"])],
    ]);
    const noOperations = Object.freeze([]);
    const requested = new Set([...(extension.capabilities ?? []), ...available]);

    function status(id, scope = globalCapabilityScope) {
      const isAvailable = available.has(id) && !lifetime.aborted;
      return Object.freeze({
        id,
        scope,
        state: isAvailable ? "available" : "unavailable",
        ...(!isAvailable
          ? {
              unavailableReason: lifetime.aborted
                ? "extension-deactivated"
                : "renderer-unavailable",
              detail: lifetime.aborted
                ? "The main extension is inactive."
                : "This product capability is available only in a renderer entry.",
            }
          : {}),
        operations: isAvailable ? (operations.get(id) ?? noOperations) : noOperations,
      });
    }

    function snapshot(scope = globalCapabilityScope) {
      return Object.freeze({
        revision: 1,
        generatedAt: new Date().toISOString(),
        scope,
        statuses: Object.freeze([...requested].sort().map((id) => status(id, scope))),
      });
    }

    function unavailableError(value) {
      return Object.assign(
        new Error(`Capability is unavailable: ${value.id}`),
        {
          name: "ChatGPTXApiError",
          code: "capability-unavailable",
          retryable: false,
          details: Object.freeze({
            capabilityId: value.id,
            reason: value.unavailableReason,
          }),
        },
      );
    }

    return Object.freeze({
      async getSnapshot(requestOptions) {
        const { signal, scope } = checkCapabilityOptions(requestOptions);
        throwIfAborted(signal);
        return snapshot(scope);
      },
      async get(id, requestOptions) {
        assertNonEmptyString(id, "Capability id");
        const { signal, scope } = checkCapabilityOptions(requestOptions);
        throwIfAborted(signal);
        return status(id, scope);
      },
      async require(id, requestOptions) {
        const value = await this.get(id, requestOptions);
        if (value.state === "available") return;
        throw unavailableError(value);
      },
      changed: Object.freeze({
        subscribe(listener, requestOptions) {
          if (typeof listener !== "function") {
            throw new TypeError("Capability listener must be a function");
          }
          const signal = checkOptions(requestOptions);
          throwIfAborted(signal);
          let active = true;
          const unsubscribe = () => {
            if (!active) return;
            active = false;
            signal?.removeEventListener("abort", unsubscribe);
            lifetime.removeEventListener("abort", unsubscribe);
          };
          const emit = (message) => {
            if (!active) return;
            try {
              listener(Object.freeze(message));
            } catch (error) {
              report(onError, error, {
                extensionId: extension.id,
                phase: "capability-listener",
              });
            }
          };
          signal?.addEventListener("abort", unsubscribe, { once: true });
          lifetime.addEventListener("abort", unsubscribe, { once: true });
          if (lifetime.aborted) unsubscribe();
          queueMicrotask(() => {
            if (requestOptions?.afterCursor !== undefined) {
              emit({ type: "reset", cursor: "1", reason: "cursor-expired" });
            }
            emit({ type: "snapshot", cursor: "1", value: snapshot() });
          });
          return unsubscribe;
        },
      }),
    });
  }

  function runtimeApi(extension, identity, lifetime) {
    const capabilities = capabilityApi(extension, lifetime);
    return Object.freeze({
      async getInfo(requestOptions) {
        const signal = checkOptions(requestOptions);
        throwIfAborted(signal);
        const base =
          typeof options.getRuntimeInfo === "function"
            ? options.getRuntimeInfo(identity, connectedWindows())
            : options.runtimeInfo ?? {};
        return Object.freeze({
          apiVersion: launch.apiVersion,
          appVersion: launch.appVersion,
          appBuild: launch.appBuild,
          electronVersion: process.versions.electron ?? "unknown",
          chromiumVersion: process.versions.chrome ?? "unknown",
          nodeVersion: process.versions.node,
          nodeModuleAbi: process.versions.modules ?? "unknown",
          ...(process.versions.napi ? { nodeApiVersion: process.versions.napi } : {}),
          objcJsVersion: options.objcJsVersion ?? "1.5.0",
          architecture: process.arch === "arm64" ? "arm64" : "x64",
          platform: "macos",
          binding: Object.freeze({
            adapterVersion: launch.binding.adapterVersion,
            targetAppVersion: launch.appVersion,
            targetAppBuild: launch.appBuild,
            adapterDigest: launch.binding.hostDigest,
            publicApiDigest: options.publicApiDigest ?? "not-provided",
            evidenceDigest: options.evidenceDigest ?? "not-provided",
          }),
          hosts: Object.freeze([]),
          windows: connectedWindows(),
          ...base,
          extension: identity,
        });
      },
      capabilities,
    });
  }

  function defaultOwner(windowId) {
    let document;
    for (const channel of channels.values()) {
      document = [...channel.renderers.values()].find(
        (renderer) => renderer.windowId === windowId,
      );
      if (document) break;
    }
    if (!document) return null;
    const getWebContents = () => {
      const value = options.electron.webContents?.fromId?.(document.webContentsId) ?? null;
      return value?.isDestroyed?.() ? null : value;
    };
    return Object.freeze({
      windowId,
      getWindow() {
        const webContents = getWebContents();
        if (!webContents) return null;
        const window = options.electron.BrowserWindow?.fromWebContents?.(webContents) ?? null;
        return window?.isDestroyed?.() ? null : window;
      },
      getWebContents,
    });
  }

  async function deactivateState(state, failurePhase) {
    if (state.deactivated) return;
    state.deactivated = true;
    if (typeof state.module?.deactivate !== "function") return;
    try {
      await state.module.deactivate();
    } catch (error) {
      report(onError, error, {
        extensionId: state.extension.id,
        phase: failurePhase ?? "deactivate",
      });
    }
  }

  function releaseState(state, reason) {
    if (!state.controller.signal.aborted) state.controller.abort(reason);
    abortPending(
      state.channel,
      () => true,
      reason instanceof Error ? reason : abortError("The extension is inactive"),
    );
    state.ownedBag.releaseAll();
    state.disposableBag.releaseAll();
    state.channel.handlers.clear();
    state.channel.listeners.clear();
    state.channel.registrationsReleased = true;
  }

  async function activateOne(extension) {
    const channel = channels.get(extension.id);
    const controller = new AbortController();
    const ownedBag = createResourceBag(onError, extension.id);
    const disposableBag = createResourceBag(onError, extension.id);
    const identity = Object.freeze({
      id: extension.id,
      instanceId: crypto.randomUUID(),
      version: extension.version,
      manifestDigest: extension.manifestDigest,
    });
    const state = {
      extension,
      channel,
      controller,
      identity,
      ownedBag,
      disposableBag,
      module: undefined,
      deactivated: false,
      status: "loading",
    };
    states.set(extension.id, state);

    try {
      const module = loadModule(extension.main);
      if (!module || typeof module.activate !== "function") {
        throw new TypeError(`Extension ${extension.id} main.cjs must export activate`);
      }
      if (module.deactivate !== undefined && typeof module.deactivate !== "function") {
        throw new TypeError(`Extension ${extension.id} deactivate export must be a function`);
      }
      state.module = module;
      const context = Object.freeze({
        extension: identity,
        storage: scopedStorage(extension.id),
        extensions: extensionsApi(extension.id),
        lifetime: controller.signal,
        runtime: runtimeApi(extension, identity, controller.signal),
        electron: options.electron,
        objc: options.objc,
        renderers: channel.api,
        owned: nativeLeases.forExtension(extension.id, ownedBag),
        disposables: disposableBag.api,
        getOwner(windowId) {
          assertNonEmptyString(windowId, "Window id");
          return typeof options.getOwner === "function"
            ? options.getOwner(windowId)
            : defaultOwner(windowId);
        },
      });
      await module.activate(context);
      if (shuttingDown || controller.signal.aborted) {
        releaseState(state, abortError("The main extension host is shutting down"));
        state.status = "stopped";
      } else {
        state.status = "active";
      }
      return Object.freeze({ extensionId: extension.id, status: state.status });
    } catch (error) {
      state.status = "failed";
      releaseState(state, error);
      await deactivateState(state, "failed-activation-cleanup");
      report(onError, error, { extensionId: extension.id, phase: "activate" });
      return Object.freeze({ extensionId: extension.id, status: "failed", error });
    }
  }

  function activate() {
    if (activationPromise) return activationPromise;
    if (shuttingDown) return Promise.reject(new Error("The main extension host is shutting down"));
    activationPromise = (async () => {
      const results = [];
      for (const extension of activeExtensions.values()) {
        if (!extension.main || shuttingDown) continue;
        results.push(await activateOne(extension));
      }
      return Object.freeze(results);
    })();
    return activationPromise;
  }

  function connectRenderer(extensionId, rendererValue) {
    requireExtension(extensionId);
    const channel = channels.get(extensionId);
    const renderer = validateRendererDocument(rendererValue);
    if (channel.renderers.has(renderer.id)) {
      throw new Error(`Renderer is already connected: ${renderer.id}`);
    }
    channel.renderers.set(renderer.id, renderer);
    notifyRendererChange(
      channel,
      Object.freeze({ type: "connected", renderer }),
    );
    return renderer;
  }

  function disconnectRenderer(extensionId, rendererId) {
    requireExtension(extensionId);
    assertNonEmptyString(rendererId, "Renderer id");
    const channel = channels.get(extensionId);
    const renderer = channel.renderers.get(rendererId);
    if (!renderer) return false;
    channel.renderers.delete(rendererId);
    abortPending(
      channel,
      (pending) => pending.rendererId === rendererId,
      abortError("The renderer disconnected"),
    );
    notifyRendererChange(
      channel,
      Object.freeze({ type: "disconnected", renderer }),
    );
    return true;
  }

  async function invokeRenderer(extensionId, rendererId, callId, method, parameters) {
    requireExtension(extensionId);
    assertNonEmptyString(rendererId, "Renderer id");
    assertNonEmptyString(callId, "Renderer call id");
    assertNonEmptyString(method, "Renderer method");
    assertJson(parameters, "Renderer call parameters");
    const channel = channels.get(extensionId);
    const renderer = channel.renderers.get(rendererId);
    if (!renderer) throw new Error(`Renderer is not connected: ${rendererId}`);
    const handler = channel.handlers.get(method);
    if (!handler) throw new Error(`No main handler for ${extensionId}:${method}`);
    const key = `${rendererId}\0${callId}`;
    if (channel.pending.has(key)) {
      throw new Error(`Duplicate renderer call id: ${callId}`);
    }

    const controller = new AbortController();
    const pending = { controller, rendererId, callId };
    channel.pending.set(key, pending);
    try {
      const handlerOperation = Promise.resolve().then(() =>
        handler(parameters, Object.freeze({ renderer, signal: controller.signal })),
      );
      const cancellation = new Promise((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(controller.signal.reason ?? abortError("The renderer call was cancelled")),
          { once: true },
        );
      });
      const result = await Promise.race([handlerOperation, cancellation]);
      assertJson(result, "Renderer call result");
      return result;
    } finally {
      if (channel.pending.get(key) === pending) channel.pending.delete(key);
    }
  }

  function cancelRendererCall(extensionId, rendererId, callId) {
    requireExtension(extensionId);
    assertNonEmptyString(rendererId, "Renderer id");
    assertNonEmptyString(callId, "Renderer call id");
    const channel = channels.get(extensionId);
    const key = `${rendererId}\0${callId}`;
    const pending = channel.pending.get(key);
    if (!pending) return false;
    channel.pending.delete(key);
    pending.controller.abort(abortError("The renderer cancelled the call"));
    return true;
  }

  function rendererConnected(rendererValue) {
    const renderer = validateRendererDocument(rendererValue);
    if (
      [...channels.values()].some((channel) =>
        channel.renderers.has(renderer.id),
      )
    ) {
      rendererDisconnected(renderer.id);
    }
    for (const extension of activeExtensions.values()) {
      connectRenderer(extension.id, renderer);
    }
    return renderer;
  }

  function rendererDisconnected(rendererId) {
    assertNonEmptyString(rendererId, "Renderer id");
    let disconnected = false;
    for (const extension of activeExtensions.values()) {
      disconnected = disconnectRenderer(extension.id, rendererId) || disconnected;
    }
    return disconnected;
  }

  function assertMainChannelRequest(parameters, document) {
    if (!plainObject(parameters)) {
      throw new TypeError("Main-channel parameters must be an object");
    }
    for (const key of ["extensionId", "documentId", "callId"]) {
      assertNonEmptyString(parameters[key], `Main-channel ${key}`);
    }
    assertExtensionId(parameters.extensionId);
    if (parameters.documentId !== document.id) {
      throw new Error("The main-channel document does not match the caller");
    }
  }

  function handleRendererRequest(method, parameters, documentValue, _webContents) {
    assertNonEmptyString(method, "Renderer request method");
    const document = validateRendererDocument(documentValue);
    assertMainChannelRequest(parameters, document);
    const connected = channels
      .get(parameters.extensionId)
      ?.renderers.get(document.id);
    if (!connected || connected.webContentsId !== document.webContentsId) {
      throw new Error(`Renderer is not connected: ${document.id}`);
    }

    if (method === "main-channel.invoke") {
      assertNonEmptyString(parameters.method, "Main-channel method");
      assertJson(parameters.parameters, "Main-channel parameters");
      return invokeRenderer(
        parameters.extensionId,
        document.id,
        parameters.callId,
        parameters.method,
        parameters.parameters,
      );
    }
    if (method === "main-channel.cancel") {
      return cancelRendererCall(
        parameters.extensionId,
        document.id,
        parameters.callId,
      );
    }
    throw new Error(`Unknown renderer request method: ${method}`);
  }

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    const reason = abortError("The main extension host is shutting down");
    for (const state of states.values()) {
      if (!state.controller.signal.aborted) state.controller.abort(reason);
    }
    for (const channel of channels.values()) {
      abortPending(channel, () => true, reason);
      for (const renderer of [...channel.renderers.values()]) {
        channel.renderers.delete(renderer.id);
        notifyRendererChange(
          channel,
          Object.freeze({ type: "disconnected", renderer }),
        );
      }
    }
    // Electron does not wait for a before-quit Promise. Release native state
    // synchronously before the first asynchronous deactivation step.
    for (const state of [...states.values()].reverse()) {
      releaseState(state, reason);
    }

    shutdownPromise = (async () => {
      if (activationPromise) await activationPromise;
      const activeStates = [...states.values()].reverse();
      for (const state of activeStates) releaseState(state, reason);
      for (const state of activeStates) await deactivateState(state);
    })();
    return shutdownPromise;
  }

  return Object.freeze({
    activate,
    handleRendererRequest,
    rendererConnected,
    rendererDisconnected,
    shutdown,
  });
}

module.exports = {
  createMainExtensionHost,
};
