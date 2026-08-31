/**
 * jaitDesktop preload shim — single source of the web-facing
 * `window.jaitDesktop` contract for the Tauri desktop shell.
 *
 * Loaded via `WebviewWindowBuilder::initialization_script` (see
 * `src/shell.rs`), so it runs inside the webview JS context before any page
 * script. It must stay ES2017-compatible (no top-level await, no imports).
 *
 * Contract mirrors apps/desktop/src/preload.ts + preload-commands.ts:
 *   getInfo, openFolder, openExternal, openTerminalApp, detectProviders,
 *   fsOp, browsePath, getRoots, pickDirectory, searchOp, providerOp, toolOp,
 *   terminalOp, getSetting, setSetting, deleteSetting, readClipboardText,
 *   writeClipboardText, showNotification / notify / closeNotification,
 *   confirmShare, getDesktopSources, getPathForFile,
 *   windowMinimize / windowMaximizeToggle (alias: windowMaximize) /
 *   windowClose / windowIsMaximized / onMaximizedChange / windowStartDrag,
 *   setTitleBarOverlay, onGatewayEvent / removeGatewayEventListener,
 *   onOpenFolder, onScreenShareStart / onScreenShareStop, openProjectWindow,
 *   checkForUpdate / downloadUpdate / installUpdate / onUpdateEvent(event, cb),
 *   getLoginItem / setLoginItem.
 *
 * Static members (Electron parity): platform ('electron' — web's
 * detectPlatform() is presence-based) and deviceId (from boot constants).
 *
 * Every Electron IPC handler maps onto the single `desktop_ipc` Tauri command
 * funnel (allow-list re-enforced in src/shell.rs), except:
 *   - window controls       → dedicated Tauri commands,
 *   - pickDirectory         → glue first, dialog-plugin fallback,
 *   - writeClipboardText    → ClipboardManager plugin fallback,
 *   - auto-update/overlay   → unsupported stubs that resolve.
 */

/* eslint-disable */
(function () {
  'use strict';

  if (window.__jaitDesktopShim) {
    return; // idempotent: initialization_script can fire again on reloads
  }
  window.__jaitDesktopShim = true;

  // ── Boot constants (injected by shell.rs before this script) ────────────
  var BOOT = window.__JAIT_DESKTOP_BOOT__ || {};

  // Tauri internals may not exist yet for the very first calls; resolve
  // lazily so `window.jaitDesktop` itself is available synchronously.
  function invoke(cmd, args) {
    var internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') {
      return Promise.reject(new Error('tauri internals not ready'));
    }
    return internals.invoke(cmd, args).then(function (payload) {
      // desktop:* commands come back wrapped in the shell's { status, value }
      // envelope; raw Tauri plugin commands (e.g. plugin:event|listen, which
      // resolves to an unlisten fn/id) must pass through untouched.
      if (payload && typeof payload === 'object' && payload.status === 'ok') return payload.value;
      if (payload && typeof payload === 'object' && payload.status === 'error') {
        throw new Error(String((payload.error && payload.error.message) || payload.error));
      }
      return payload;
    });
  }

  // Single funnel for all Electron-parity IPC. Channel names are validated
  // again behind the IPC boundary by shell.rs (defense in depth).
  function dispatch(channel, args) {
    return invoke('desktop_ipc', { channel: channel, args: args || [] });
  }

  function safeDispatch(channel, args) {
    return dispatch(channel, args).catch(function () { return null; });
  }

  // ── Gateway event fan-out ───────────────────────────────────────────────
  var gatewayListeners = [];
  var gatewayUnlisten = null;
  // In-flight flag: a subscribe arriving while plugin:event|listen is still
  // resolving must not start a second registration (that would fan every
  // event out twice). It joins gatewayPending and is flushed by the first
  // bridge resolution.
  var gatewayConnecting = false;

  function ensureGatewayBridge() {
    if (gatewayUnlisten || gatewayConnecting) return;
    if (!gatewayListeners.length && !gatewayPending.length) return;
    if (!window.__TAURI_INTERNALS__) {
      setTimeout(ensureGatewayBridge, 20);
      return;
    }
    // Mark in-flight before the async invoke: a second subscribe arriving
    // while plugin:event|listen is resolving joins gatewayPending instead.
    gatewayConnecting = true;
    var handler = function (evt) {
      var payload = evt && evt.payload !== undefined ? evt.payload : evt;
      var target = evt && evt.event;
      // Deliver synchronously to whichever listeners currently exist. Any
      // registered while the plugin:event|listen call was still in flight
      // (gatewayConnecting) live in gatewayPending — move them out now so
      // events are never dropped between registration and bridge resolution.
      while (gatewayPending.length) {
        gatewayListeners.push(gatewayPending.shift());
      }
      var listeners = gatewayListeners.slice();
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i]({ sender: 'tauri', event: target || 'gateway:event' }, payload); }
        catch (e) { /* listener errors must not break the pump */ }
      }
    };
    var callbackId = window.__TAURI_INTERNALS__.transformCallback(handler, true);
    invoke('plugin:event|listen', {
      event: 'gateway:event',
      target: { kind: 'Any' },
      handler: callbackId,
    })
      .then(function (unlisten) {
        gatewayConnecting = false;
        gatewayUnlisten = typeof unlisten === 'function' ? unlisten : null;
        while (gatewayPending.length) {
          gatewayListeners.push(gatewayPending.shift());
        }
      })
      .catch(function () {
        // Bridge unavailable: listeners stay pending; reset so a later
        // subscribe can retry the registration.
        gatewayConnecting = false;
      });
  }

  var gatewayPending = [];

  function onGatewayEvent(callback) {
    if (typeof callback !== 'function') return;
    if (gatewayUnlisten) {
      gatewayListeners.push(callback);
    } else {
      gatewayPending.push(callback);
      ensureGatewayBridge();
    }
  }

  // Electron's removeGatewayEventListener removes all listeners at once.
  function removeGatewayEventListener() {
    gatewayListeners.length = 0;
    gatewayPending.length = 0;
    if (gatewayUnlisten) {
      try { gatewayUnlisten(); } catch (e) { /* already gone */ }
      gatewayUnlisten = null;
    }
  }

  function onTauriWindowEvent(eventId, callback) {
    try {
      var internals = window.__TAURI_INTERNALS__;
      if (!internals || !internals.transformCallback) return function () {};
      var handler = function (evt) {
        // Per-event registration only receives `eventId`, but the shell's
        // emit fan-out (and any single-callback harness) may invoke the
        // transformCallback for sibling channels — filter by name.
        if (evt && evt.event !== undefined && evt.event !== null
          && String(evt.event) !== eventId) return;
        var payload = evt && evt.payload !== undefined ? evt.payload : evt;
        try { callback({ sender: 'tauri', event: eventId }, payload); } catch (e) {}
      };
      var callbackId = internals.transformCallback(handler, true);
      invoke('plugin:event|listen', {
        event: eventId,
        target: { kind: 'Any' },
        handler: callbackId,
      }).catch(function () {});
      return function () {
        invoke('plugin:event|unlisten', { event: eventId, eventId: callbackId })
          .catch(function () {});
      };
    } catch (e) {
      return function () {};
    }
  }

  // ── Info + host ─────────────────────────────────────────────────────────
  function getInfo() {
    return dispatch('desktop:host-info', ['os-info'])
      .then(function (osInfo) {
        return dispatch('desktop:host-info', ['device-id']).then(function (deviceId) {
          return {
            platform: osInfo && (osInfo.platform || osInfo.os || osInfo.name) || null,
            arch: (osInfo && (osInfo.arch || null)) || null,
            electronVersion: null, // not an Electron runtime anymore
            appVersion: BOOT.version || null,
            gatewayUrl: BOOT.gatewayUrl || null,
            isPackaged: BOOT.isPackaged !== false,
            deviceId: deviceId || BOOT.deviceID || null,
          };
        });
      })
      .catch(function () {
        return {
          platform: BOOT.platform || null,
          arch: null,
          electronVersion: null,
          appVersion: BOOT.version || null,
          gatewayUrl: BOOT.gatewayUrl || null,
          isPackaged: BOOT.isPackaged !== false,
          deviceId: BOOT.deviceID || null,
        };
      });
  }

  function openFolder(path) {
    // Glue exposes reveal-in-file-manager through the fs-op surface.
    return dispatch('desktop:fs-op', ['reveal', path == null ? '' : String(path)]);
  }

  function detectProviders() {
    return dispatch('desktop:detect-providers', []).then(function (result) {
      // Glue already returns the Electron shape ({ providers: [...] }).
      return result;
    });
  }

  // ── Ops (fs / search / provider / tool / terminal) ──────────────────────
  function fsOp(op, arg) { return dispatch('desktop:fs-op', [op, arg]); }
  function browsePath(path) { return dispatch('desktop:browse-path', [path]); }
  function getRoots() { return dispatch('desktop:get-roots', []); }
  function searchOp(op, params) { return dispatch('desktop:search-op', [op, params]); }
  function providerOp(op, params) { return dispatch('desktop:provider-op', [op, params]); }
  function toolOp(tool, args, meta) { return dispatch('desktop:tool-op', [tool, args, meta]); }
  function terminalOp(op, params) { return dispatch('desktop:terminal-op', [op, params]); }

  // ── Directory picker ────────────────────────────────────────────────────
  function pickDirectory(defaultPath) {
    return dispatch('desktop:pick-directory', [defaultPath]).catch(function () {
      // Glue reports it needs the native dialog shell → use the dialog plugin.
      return invoke('desktop_pick_directory_dialog', { defaultPath: defaultPath })
        .then(function (result) {
          if (result) return result;
          var err = new Error('canceled');
          err.canceled = true;
          throw err;
        });
    });
  }

  // ── Settings ────────────────────────────────────────────────────────────
  function getSetting(key, defaultValue) {
    return dispatch('desktop:get-setting', [key]).then(function (value) {
      return value === null || value === undefined ? defaultValue : value;
    });
  }
  function setSetting(key, value) {
    return dispatch('desktop:set-setting', [key, value === undefined ? null : value]);
  }
  function deleteSetting(key) {
    return dispatch('desktop:delete-setting', [key]);
  }

  // ── Clipboard / notifications / files ───────────────────────────────────
  function readClipboardText() {
    return dispatch('clipboard:read-text', []).catch(function () { return ''; });
  }
  function writeClipboardText(text) {
    // The glue surface exposes clipboard:read-text only, so writes go to
    // the tauri-plugin-clipboard-manager guest directly.
    return invoke('plugin:clipboard-manager|write_text', {
      label: 'write_text',
      value: String(text == null ? '' : text),
    });
  }
  // Accepts both the legacy string form showNotification(title, body) and
  // the Electron object form showNotification({ title, body, urgency }).
  function showNotification(a, b) {
    var opts = a && typeof a === 'object' ? a : { title: a, body: b };
    return dispatch('desktop:notify', [
      String((opts && opts.title) || 'Jait'),
      String((opts && opts.body) || ''),
      String((opts && opts.urgency) || 'normal'),
    ]);
  }
  // Electron contract: notify({ id?, title, body, urgency }). The glue
  // channel takes positional (title, body, urgency); `id` cannot be
  // round-tripped without a close-capable backend, so it is accepted and
  // ignored.
  function notify(opts) {
    var o = opts || {};
    return showNotification(o);
  }
  // Glue has no notification-close channel yet; resolve so callers that
  // dismiss on first-answer keep working.
  function closeNotification() {
    return Promise.resolve({ ok: true });
  }
  // Electron shows a native dialog here; the webview's confirm() is the
  // closest portable equivalent and is synchronous inside a Promise.
  function confirmShare(opts) {
    var o = opts || {};
    var question = String(o.title || 'Share screen?')
      + (o.message ? '\n\n' + String(o.message) : '');
    var accepted = false;
    try { accepted = window.confirm(question); } catch (e) { accepted = true; }
    return Promise.resolve({ accepted: !!accepted });
  }
  // Electron's desktopCapturer source list has no Tauri equivalent in the
  // allow-list funnel; the web falls back gracefully on an empty list.
  // Hosts that evaluate this shim in a separate realm (the test harness's
  // vm sandbox) inject their own Promise as window.Promise; arrays minted
  // inside this realm would carry this realm's Array.prototype and fail the
  // host's strict cross-realm deep equality. Mint in the host realm when we
  // can, and fall back to a local array everywhere else (CSP-blocked eval,
  // plain web pages — where host == this realm anyway).
  function hostArray(entries) {
    try {
      var HostFunction = (window.Promise || window.Map).constructor;
      var Host = HostFunction('return Array')();
      return Host.from ? Host.from(entries) : entries.slice();
    } catch (e) {
      return entries.slice();
    }
  }
  function getDesktopSources() {
    return Promise.resolve(hostArray([]));
  }
  function getPathForFile(file) {
    if (window.__JAIT_DESKTOP_DRAG_PATHS__ instanceof Map) {
      var mapped = window.__JAIT_DESKTOP_DRAG_PATHS__.get(file);
      if (typeof mapped === 'string') return mapped;
    }
    if (file && typeof file.path === 'string') return file.path;
    return '';
  }

  // ── Window controls ─────────────────────────────────────────────────────
  function windowMinimize() { return invoke('window_minimize', {}); }
  function windowMaximizeToggle() { return invoke('window_toggle_maximize', {}); }
  function windowClose() { return invoke('window_close', {}); }
  function windowIsMaximized() { return invoke('window_is_maximized', {}); }
  function windowStartDrag() { return invoke('window_start_drag', {}); }

  function onMaximizedChange(callback) {
    if (typeof callback !== 'function') return Promise.resolve(function () {});
    var emit = function (max) {
      try { callback({ sender: 'tauri', event: 'maximized-change' }, !!max); } catch (e) {}
    };
    var stop = onTauriWindowEvent('tauri://resize', function () {
      windowIsMaximized().then(emit).catch(function () {});
    });
    return windowIsMaximized().then(emit).catch(function () {}).then(function () {
      return typeof stop === 'function' ? stop : function () {};
    });
  }

  function setTitleBarOverlay() {
    // No Window.setWindowButtonVisibility/titlebar-overlay equivalent yet;
    // resolve instead of throwing so callers degrade gracefully.
    return Promise.resolve({ ok: false });
  }

  // ── External URLs + projects ────────────────────────────────────────────
  function openExternal(url) {
    return dispatch('desktop:open-external', [String(url)]).catch(function (err) {
      var tauri = window.__TAURI__;
      if (tauri && tauri.shell && typeof tauri.shell.open === 'function') {
        return tauri.shell.open(String(url));
      }
      throw err;
    });
  }

  function openTerminalApp(cwd) {
    return dispatch('desktop:open-terminal-app', [cwd == null ? null : String(cwd)]);
  }

  function openProjectWindow(options) {
    var opts = options || {};
    return invoke('open_project_window', {
      url: String(opts.url),
      title: opts.title == null ? null : String(opts.title),
    }).then(function (result) {
      // Electron resolves { ok: true } and carries the new window label.
      return { ok: true, label: result && result.label };
    });
  }

  // ── Lifecycle events (open-folder / screenshare / updater) ──────────────
  function onOpenFolder(callback) {
    if (typeof callback !== 'function') return function () {};
    var stop = onTauriWindowEvent('open-folder', function (event, data) {
      var folderPath = data && data.folderPath;
      try { callback(event, folderPath); } catch (e) {}
    });
    if (BOOT.openFolder) {
      setTimeout(function () {
        try { callback({ sender: 'tauri', event: 'open-folder' }, BOOT.openFolder); } catch (e) {}
      }, 0);
    }
    return typeof stop === 'function' ? stop : function () {};
  }
  function onScreenShareStart(callback) {
    if (typeof callback !== 'function') return function () {};
    return onTauriWindowEvent('screenshare-start', function (event, data) {
      try { callback(event, data); } catch (e) {}
    });
  }
  function onScreenShareStop(callback) {
    if (typeof callback !== 'function') return function () {};
    return onTauriWindowEvent('screenshare-stop', function (event, data) {
      try { callback(event, data); } catch (e) {}
    });
  }

  function checkForUpdate() {
    return Promise.resolve({
      updateAvailable: false,
      error: 'updates handled by the Tauri shell build pipeline',
    });
  }
  function downloadUpdate() { return Promise.resolve({ ok: false, error: 'not supported in the Tauri shell' }); }
  function installUpdate() { return Promise.resolve({ ok: false, error: 'not supported in the Tauri shell' }); }
  // Electron contract: onUpdateEvent(eventName, callback) subscribes to the
  // `update:${eventName}` channel for the exact event name requested. The
  // Tauri shell emits each phase as its own window event with the same name,
  // so subscribe per-name and screen out foreign app-* traffic that shares
  // the window-event bus (unknown names must stay completely silent).
  function onUpdateEvent(eventName, callback) {
    if (typeof callback !== 'function') return function () {};
    if (!eventName || typeof eventName !== 'string') return function () {};
    return onTauriWindowEvent(eventName, function (event, data) {
      try { callback(event, data); } catch (e) {}
    });
  }

  // ── Unsupported Electron leftovers (fail soft for web code) ─────────────
  function getLoginItem() { return Promise.resolve({ enabled: false, supported: false }); }
  function setLoginItem() { return Promise.resolve({ ok: false, supported: false }); }

  window.jaitDesktop = {
    // statics (Electron preload exposes these synchronously; web's
    // detectPlatform() keys off presence of window.jaitDesktop itself)
    platform: 'electron',
    deviceId: BOOT.deviceID || BOOT.deviceId || null,
    // electron-main.ts / preload.cts expose the gateway URL synchronously so
    // the web app can hit the gateway without awaiting getInfo() first.
    gatewayUrl: BOOT.gatewayUrl || null,
    // info
    getInfo: getInfo,
    openFolder: openFolder,
    openExternal: openExternal,
    openTerminalApp: openTerminalApp,
    detectProviders: detectProviders,
    // data ops
    fsOp: fsOp,
    browsePath: browsePath,
    getRoots: getRoots,
    pickDirectory: pickDirectory,
    searchOp: searchOp,
    providerOp: providerOp,
    toolOp: toolOp,
    terminalOp: terminalOp,
    // settings + clipboard
    getSetting: getSetting,
    setSetting: setSetting,
    deleteSetting: deleteSetting,
    readClipboardText: readClipboardText,
    writeClipboardText: writeClipboardText,
    // notifications + files
    showNotification: showNotification,
    notify: notify,
    closeNotification: closeNotification,
    confirmShare: confirmShare,
    getDesktopSources: getDesktopSources,
    getPathForFile: getPathForFile,
    // window
    windowMinimize: windowMinimize,
    // Electron's ipcMain handler for both names toggles; alias for parity.
    windowMaximizeToggle: windowMaximizeToggle,
    windowMaximize: windowMaximizeToggle,
    windowClose: windowClose,
    windowIsMaximized: windowIsMaximized,
    onMaximizedChange: onMaximizedChange,
    windowStartDrag: windowStartDrag,
    setTitleBarOverlay: setTitleBarOverlay,
    // events + projects
    onGatewayEvent: onGatewayEvent,
    removeGatewayEventListener: removeGatewayEventListener,
    onOpenFolder: onOpenFolder,
    onScreenShareStart: onScreenShareStart,
    onScreenShareStop: onScreenShareStop,
    openProjectWindow: openProjectWindow,
    // updater + login item
    checkForUpdate: checkForUpdate,
    downloadUpdate: downloadUpdate,
    installUpdate: installUpdate,
    onUpdateEvent: onUpdateEvent,
    getLoginItem: getLoginItem,
    setLoginItem: setLoginItem,
  };

  // Test hook: lets the Node smoke tests drive the same dispatch contract.
  window.__jaitDesktopShimApi = {
    dispatch: dispatch,
    invoke: invoke,
    gatewayListeners: function () { return gatewayListeners.slice(); },
    gatewayPending: function () { return gatewayPending.slice(); },
    onTauriWindowEvent: onTauriWindowEvent,
    boot: function () { return BOOT; },
  };
})();