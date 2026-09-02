/**
 * Node smoke tests for the preload shim contract (no Tauri runtime needed).
 *
 * Runs the real `shim.js` inside a `vm` sandbox with a fake
 * `__TAURI_INTERNALS__` that records every `invoke` and returns canned
 * payloads, so we can assert the exact channel/arg mapping that shell.rs and
 * the glue expect.
 *
 *   node --test apps/desktop-tauri/src-tauri/guest-js/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, 'shim.js'), 'utf8');

const CONTRACT = [
  'getInfo', 'openFolder', 'openExternal', 'openTerminalApp', 'detectProviders',
  'fsOp', 'browsePath', 'getRoots', 'pickDirectory', 'searchOp', 'providerOp',
  'toolOp', 'terminalOp', 'getSetting', 'setSetting', 'deleteSetting',
  'readClipboardText', 'writeClipboardText', 'showNotification', 'getPathForFile',
  'windowMinimize', 'windowMaximizeToggle', 'windowClose', 'windowIsMaximized',
  'onMaximizedChange', 'windowStartDrag', 'setTitleBarOverlay', 'onGatewayEvent',
  'removeGatewayEventListener', 'onOpenFolder', 'onScreenShareStart',
  'onScreenShareStop', 'openProjectWindow', 'checkForUpdate', 'downloadUpdate',
  'installUpdate', 'onUpdateEvent', 'getLoginItem', 'setLoginItem',
];

/** Build a fresh sandbox around shim.js with a controllable invoke backend. */
function loadShim({ boot = {}, responder = null } = {}) {
  const log = []; // { cmd, args }
  const listeners = new Map(); // event -> Set(handlerId-ish)
  let resolver = responder || (() => ({ status: 'ok', value: null }));

  const window = {
    __JAIT_DESKTOP_BOOT__: boot,
    setTimeout,
    clearTimeout,
    Map,
    Promise,
    Date,
  };
  const internals = {
    invoke: (cmd, args) => {
      log.push({ cmd, args });
      // Emulate Tauri's event plugin for subscription assertions.
      if (cmd === 'plugin:event|listen') {
        const event = args && args.event;
        const handler = args && args.handler;
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return Promise.resolve(() => {
          listeners.get(event)?.delete(handler);
          // Real Tauri v2's unlisten tears the shell-side handler down; record
          // it as the unlisten command so tests can assert the teardown.
          log.push({ cmd: 'plugin:event|unlisten', args: { event, eventId: handler } });
          return Promise.resolve(null);
        });
      }
      if (cmd === 'plugin:event|unlisten') {
        listeners.get(args?.event)?.delete(args?.eventId);
        return Promise.resolve(null);
      }
      const out = internals.__respond(cmd, args);
      return Promise.resolve(out);
    },
    __respond(cmd, args) {
      return resolver(cmd, args, log);
    },
    transformCallback: (fn) => {
      const id = internCounter++;
      callbacks.set(id, fn);
      return id;
    },
  };
  const callbacks = new Map();
  let internCounter = 100;
  window.__TAURI_INTERNALS__ = internals;

  const context = vm.createContext({ window, setTimeout, clearTimeout, Map, Promise });
  vm.runInContext(source, context, { filename: 'shim.js' });
  assert.ok(window.__jaitDesktopShim, 'shim should set its idempotence flag');
  return {
    window,
    log,
    listeners,
    callbacks,
    internals,
    setResponder: (fn) => { resolver = fn; },
    /** Fire a shell-side event into every registered shim callback. */
    emit(event, payload) {
      const results = [];
      for (const cb of callbacks.values()) {
        try { results.push(cb({ event, payload })); } catch (e) { results.push(e); }
      }
      return results;
    },
  };
}

// ── Contract surface ────────────────────────────────────────────────────────

test('shim installs the full jaitDesktop contract', () => {
  const { window } = loadShim();
  for (const key of CONTRACT) {
    assert.equal(typeof window.jaitDesktop[key], 'function', `missing jaitDesktop.${key}`);
  }
});

test('shim is idempotent (double evaluation keeps one instance)', () => {
  const { window } = loadShim();
  const first = window.jaitDesktop;
  // Contextify `window` as the sandbox global and re-run the same source —
  // the shim must see its flag and leave the instance alone.
  const context = vm.createContext({ window });
  vm.runInContext(source, context, { filename: 'shim.js (2nd pass)' });
  assert.equal(window.jaitDesktop, first);
  assert.equal(window.__jaitDesktopShim, true);
});

// ── Channel mapping (must match shell.rs ALLOWED_CHANNELS exactly) ─────────

test('data ops map to expected desktop:* channels and args', async () => {
  const { window, log } = loadShim();
  const d = window.jaitDesktop;
  await d.fsOp('read', '/tmp/x');
  await d.browsePath('/home');
  await d.getRoots();
  await d.searchOp('glob', { pattern: '*.rs' });
  await d.providerOp('start', { provider: 'claude' });
  await d.toolOp('bash', { cmd: 'ls' }, { cwd: '/tmp' });
  await d.terminalOp('spawn', { cwd: '/tmp' });

  const channels = log.filter((l) => l.cmd === 'desktop_ipc').map((l) => l.args.channel);
  assert.deepEqual(channels, [
    'desktop:fs-op',
    'desktop:browse-path',
    'desktop:get-roots',
    'desktop:search-op',
    'desktop:provider-op',
    'desktop:tool-op',
    'desktop:terminal-op',
  ]);
  assert.deepEqual([...log[0].args.args], ['read', '/tmp/x']);
  assert.equal(log[3].args.args[0], 'glob');
  assert.deepEqual({ ...log[3].args.args[1] }, { pattern: '*.rs' });
});

test('settings round-trip and delete passthrough', async () => {
  const store = new Map([['theme', 'dark']]);
  const { window, log } = loadShim({
    responder: (cmd, args) => {
      if (cmd !== 'desktop_ipc') return { status: 'ok', value: null };
      const [channel, fnArgs = []] = [args.channel, args.args];
      if (channel === 'desktop:get-setting') {
        const has = store.has(fnArgs[0]);
        return { status: 'ok', value: has ? store.get(fnArgs[0]) : null };
      }
      if (channel === 'desktop:set-setting') {
        store.set(fnArgs[0], fnArgs[1]);
        return { status: 'ok', value: { ok: true } };
      }
      if (channel === 'desktop:delete-setting') {
        store.delete(fnArgs[0]);
        return { status: 'ok', value: { ok: true } };
      }
      return { status: 'ok', value: null };
    },
  });
  const d = window.jaitDesktop;
  assert.equal(await d.getSetting('theme'), 'dark');
  assert.equal(await d.getSetting('missing', 'fallback'), 'fallback'); // null → default
  await d.setSetting('key', 'value');
  assert.equal(await d.getSetting('key'), 'value');
  await d.deleteSetting('key');
  assert.equal(await d.getSetting('key', 'gone'), 'gone');
  assert.ok(log.some((l) => l.args.channel === 'desktop:delete-setting'));
});

test('getInfo composes os-info + device-id and fills boot constants', async () => {
  const { window } = loadShim({
    boot: { version: '1.2.3', gatewayUrl: 'http://localhost:8000' },
    responder: (cmd, args) => {
      if (cmd !== 'desktop_ipc') return { status: 'ok', value: null };
      if (args.channel === 'desktop:host-info' && args.args[0] === 'os-info') {
        return { status: 'ok', value: { os: 'ubuntu', arch: 'x86_64' } };
      }
      if (args.channel === 'desktop:host-info' && args.args[0] === 'device-id') {
        return { status: 'ok', value: 'dev-1' };
      }
      return { status: 'ok', value: null };
    },
  });
  const info = await window.jaitDesktop.getInfo();
  assert.equal(info.platform, 'ubuntu');
  assert.equal(info.arch, 'x86_64');
  assert.equal(info.electronVersion, null); // Tauri shell is honest about this
  assert.equal(info.appVersion, '1.2.3');
  assert.equal(info.gatewayUrl, 'http://localhost:8000');
  assert.equal(info.deviceId, 'dev-1');
});

test('pickDirectory falls back to the dialog plugin when glue declines', async () => {
  const { window, log } = loadShim({
    responder: (cmd, args) => {
      if (cmd === 'desktop_ipc' && args.channel === 'desktop:pick-directory') {
        return { status: 'error', error: { message: 'requires a native dialog shell' } };
      }
      if (cmd === 'desktop_pick_directory_dialog') {
        return { status: 'ok', value: '/picked/dir' };
      }
      return { status: 'ok', value: null };
    },
  });
  const dir = await window.jaitDesktop.pickDirectory('/default');
  assert.equal(dir, '/picked/dir');
  const dialogCall = log.find((l) => l.cmd === 'desktop_pick_directory_dialog');
  assert.ok(dialogCall, 'should have invoked the dialog command');
});

test('pickDirectory rejects with canceled flag when the dialog is dismissed', async () => {
  const { window } = loadShim({
    responder: (cmd) => (cmd === 'desktop_pick_directory_dialog'
      ? { status: 'ok', value: null }
      : { status: 'error', error: { message: 'nope' } }),
  });
  await assert.rejects(
    () => window.jaitDesktop.pickDirectory(),
    (err) => err && err.canceled === true,
  );
});

// ── Window controls + misc ─────────────────────────────────────────────────

test('window controls map to dedicated tauri commands', async () => {
  const { window, log } = loadShim({
    responder: (cmd) => (cmd === 'window_is_maximized'
      ? { status: 'ok', value: true }
      : { status: 'ok', value: { ok: true } }),
  });
  const d = window.jaitDesktop;
  await d.windowMinimize();
  await d.windowMaximizeToggle();
  await d.windowClose();
  assert.equal(await d.windowIsMaximized(), true);
  await d.windowStartDrag();
  const cmds = log.filter((l) => l.cmd.startsWith('window_') || l.cmd === 'window_start_drag').map((l) => l.cmd);
  assert.deepEqual(cmds, [
    'window_minimize',
    'window_toggle_maximize',
    'window_close',
    'window_is_maximized',
    'window_start_drag',
  ]);
});

test('unsupported capabilities resolve instead of throwing', async () => {
  const { window } = loadShim();
  // Cross-realm objects: assert field-by-field instead of deepEqual.
  assert.equal((await window.jaitDesktop.setTitleBarOverlay()).ok, false);
  assert.equal((await window.jaitDesktop.checkForUpdate()).updateAvailable, false);
});

test('getLoginItem maps glue results and failure to supported:false', async () => {
  // Glue reports a native autostart item.
  const ok = loadShim({
    responder: (cmd) => (cmd === 'desktop_get_login_item'
      ? { status: 'ok', value: { enabled: true, supported: true } }
      : { status: 'ok', value: null }),
  });
  const enabledRes = await ok.window.jaitDesktop.getLoginItem();
  assert.equal(enabledRes.enabled, true);
  assert.equal(enabledRes.supported, true);

  // Glue missing (older build): fall back to supported:false, never throw.
  const fail = loadShim({
    responder: (cmd) => (cmd === 'desktop_get_login_item'
      ? { status: 'error', error: { message: 'no glue' } }
      : { status: 'ok', value: null }),
  });
  const disabledRes = await fail.window.jaitDesktop.getLoginItem();
  assert.equal(disabledRes.enabled, false);
  assert.equal(disabledRes.supported, false);
});

test('writeClipboardText uses the clipboard-manager plugin fallback', async () => {
  const { window, log } = loadShim({
    responder: (cmd, args) => {
      if (cmd === 'plugin:clipboard-manager|write_text') {
        return { status: 'ok', value: null };
      }
      return { status: 'error', error: { message: 'no glue clipboard write' } };
    },
  });
  await window.jaitDesktop.writeClipboardText('hello');
  const write = log.find((l) => l.cmd === 'plugin:clipboard-manager|write_text');
  assert.ok(write, 'should have fallen back to the clipboard plugin');
  assert.equal(write.args.value, 'hello');
});

test('getPathForFile reads drag-path map then file.path', () => {
  const { window } = loadShim();
  const file = { path: '/from/file.obj' };
  assert.equal(window.jaitDesktop.getPathForFile(file), '/from/file.obj');
  const mapped = {};
  window.__JAIT_DESKTOP_DRAG_PATHS__ = new Map([[mapped, '/mapped/path']]);
  assert.equal(window.jaitDesktop.getPathForFile(mapped), '/mapped/path');
  assert.equal(window.jaitDesktop.getPathForFile({}), '');
});

// ── Gateway event pump ─────────────────────────────────────────────────────

test('gateway events fan out to all listeners and remove clears them', async () => {
  const { window, log, emit } = loadShim();
  const seen = [];
  window.jaitDesktop.onGatewayEvent((_ev, data) => seen.push(`a:${data}`));
  window.jaitDesktop.onGatewayEvent((_ev, data) => seen.push(`b:${data}`));

  // The bridge should have subscribed via the event plugin exactly once.
  await new Promise((r) => setTimeout(r, 10));
  const listenCalls = log.filter((l) => l.cmd === 'plugin:event|listen' && l.args.event === 'gateway:event');
  assert.equal(listenCalls.length, 1);

  emit('gateway:event', 'hello');
  assert.deepEqual(seen, ['a:hello', 'b:hello']);

  window.jaitDesktop.removeGatewayEventListener();
  emit('gateway:event', 'ignored');
  assert.equal(seen.length, 2); // no new deliveries

  const unlisten = log.filter((l) => l.cmd === 'plugin:event|unlisten');
  assert.equal(unlisten.length, 1, 'shell listener should be torn down');
});

test('listeners registered before the bridge becomes pending and flush', async () => {
  const { window, internals, emit } = loadShim();
  // Webviews can register listeners before __TAURI_INTERNALS__ exists; the
  // shim's 20ms retry must pick up the bridge once internals arrive.
  delete window.__TAURI_INTERNALS__;
  const seen = [];
  window.jaitDesktop.onGatewayEvent((_ev, d) => seen.push(d));
  await new Promise((r) => setTimeout(r, 25)); // retries fail silently
  assert.deepEqual(seen, []);

  window.__TAURI_INTERNALS__ = internals;
  await new Promise((r) => setTimeout(r, 40)); // retry timer connects
  emit('gateway:event', 'late');
  assert.deepEqual(seen, ['late']);
});

test('listener errors never break the gateway pump', () => {
  const { window, emit } = loadShim();
  const seen = [];
  window.jaitDesktop.onGatewayEvent(() => { throw new Error('boom'); });
  window.jaitDesktop.onGatewayEvent((_ev, d) => seen.push(d));
  emit('gateway:event', 'ok');
  assert.deepEqual(seen, ['ok']);
});

// ── Window-state subscription ──────────────────────────────────────────────

function maximizedShim() {
  let maximized = false;
  const shim = loadShim({
    responder: (cmd) => {
      if (cmd === 'window_is_maximized') return { status: 'ok', value: maximized };
      return { status: 'ok', value: null };
    },
  });
  return { shim, setMaximized: (v) => { maximized = v; }, get: () => maximized };
}

test('onMaximizedChange emits initial state and settles after resize events', async () => {
  const { shim, setMaximized } = maximizedShim();
  const { window, emit } = shim;
  const states = [];
  const stop = await window.jaitDesktop.onMaximizedChange((_ev, m) => states.push(m));
  assert.deepEqual(states, [false]);

  // A resize alone must not need a toggle: the settle re-poll (+250/+500ms)
  // picks up the new WM state even though the event fired before it applied.
  setMaximized(true);
  emit('tauri://resize', null);
  await new Promise((r) => setTimeout(r, 700));
  assert.deepEqual(states, [false, true]);

  // Duplicate resizes re-poll but stay change-deduped (no flicker).
  emit('tauri://resize', null);
  await new Promise((r) => setTimeout(r, 700));
  assert.deepEqual(states, [false, true]);
  assert.equal(typeof stop, 'function');
});

test('stale is_maximized after resize no longer wedges the maximize glyph', async () => {
  // Regression: Windows applies maximize a beat after tauri://resize, and a
  // single query on that event used to read the pre-toggle state, leaving the
  // caption button stuck on the wrong mode until the next manual resize.
  const { shim, setMaximized } = maximizedShim();
  const { window, emit } = shim;
  let firstPollAfterResize = true; // first poll reads the pre-toggle state
  shim.setResponder((cmd) => {
    if (cmd === 'window_is_maximized') {
      const value = firstPollAfterResize ? false : true;
      firstPollAfterResize = false;
      return { status: 'ok', value };
    }
    return { status: 'ok', value: null };
  });
  const states = [];
  await window.jaitDesktop.onMaximizedChange((_ev, m) => states.push(m));
  emit('tauri://resize', null); // resize arrives before the WM applies maximize
  await new Promise((r) => setTimeout(r, 700));
  assert.deepEqual(states, [false, true], 'settle re-poll must correct the stale read');
});

test('windowMaximizeToggle flips the glyph optimistically and settles', async () => {
  const { shim, setMaximized } = maximizedShim();
  const { window } = shim;
  const states = [];
  await window.jaitDesktop.onMaximizedChange((_ev, m) => states.push(m));
  assert.deepEqual(states, [false]);

  setMaximized(true);
  await window.jaitDesktop.windowMaximizeToggle();
  assert.deepEqual(states, [false, true], 'optimistic flip without waiting for the WM event');
  await new Promise((r) => setTimeout(r, 700));
  assert.deepEqual(states, [false, true], 'settle agrees, no flicker');

  setMaximized(false);
  await window.jaitDesktop.windowMaximizeToggle();
  assert.deepEqual(states, [false, true, false]);
  await new Promise((r) => setTimeout(r, 700));
  assert.deepEqual(states, [false, true, false]);
});

// ── Lifecycle / updater stubs ──────────────────────────────────────────────

test('screenshare + updater events forward payloads', async () => {
  const { window, emit } = loadShim();
  const started = [];
  const stopped = [];
  const updates = [];
  window.jaitDesktop.onScreenShareStart((_ev, d) => started.push(d));
  window.jaitDesktop.onScreenShareStop((_ev, d) => stopped.push(d));
  window.jaitDesktop.onUpdateEvent('app-update', (_ev, d) => updates.push(d));
  emit('screenshare-start', { id: 1 });
  emit('screenshare-stop', { id: 1 });
  emit('app-update', { state: 'available' });
  emit('app-install-progress', { percent: 50 }); // filtered out: different name
  assert.deepEqual(started, [{ id: 1 }]);
  assert.deepEqual(stopped, [{ id: 1 }]);
  assert.deepEqual(updates, [{ state: 'available' }]);
});

test('updater events screen by event name and unknown names stay quiet', () => {
  const { window, emit } = loadShim();
  const updates = [];
  window.jaitDesktop.onUpdateEvent('app-state', (_ev, d) => updates.push(d));
  emit('app-state', 'downloading');
  emit('app-state', 'done');
  emit('app-error', { message: 'nope' });
  assert.deepEqual(updates, ['downloading', 'done']);
});

// ── Extras: statics, notify, windowMaximize alias, desktop sources ─────────

test('statics expose platform and boot deviceId for Electron parity', () => {
  const { window } = loadShim({
    boot: { platform: 'electron', deviceID: 'dev-42', version: '9.9.9' },
  });
  assert.equal(window.jaitDesktop.platform, 'electron');
  assert.equal(window.jaitDesktop.deviceId, 'dev-42');
  assert.equal(typeof window.jaitDesktop.openFolder, 'function');
});

test('windowMaximize is an alias of windowMaximizeToggle', async () => {
  const { window, log } = loadShim();
  await window.jaitDesktop.windowMaximize();
  assert.deepEqual(
    log.filter((l) => l.cmd === 'window_toggle_maximize').length, 1,
  );
});

test('notify maps to desktop:notify with title/body/urgency args', async () => {
  const { window, log } = loadShim({
    responder: (cmd, args) => {
      if (cmd === 'desktop_ipc' && args.channel === 'desktop:notify') {
        return { status: 'ok', value: { ok: true } };
      }
      return { status: 'error', error: { message: `unexpected ${cmd}` } };
    },
  });
  const d = window.jaitDesktop;
  await d.showNotification({ title: 'Gateway up', body: 'listening', urgency: 'normal' });
  const call = log.find((l) => l.args.channel === 'desktop:notify');
  assert.ok(call, 'showNotification must hit desktop:notify');
  assert.deepEqual([...call.args.args], ['Gateway up', 'listening', 'normal']);
  await d.showNotification('Gateway up'); // string shorthand also fine
  // closeNotification has no glue channel: resolves true-style response.
  await d.closeNotification();
});

test('confirmShare bridges the web confirm() dialog into accepted flag', async () => {
  const { window } = loadShim();
  window.confirm = () => true;
  assert.deepEqual(
    { ...(await window.jaitDesktop.confirmShare({ title: 'Share?' })) },
    { accepted: true },
  );
  window.confirm = () => false;
  assert.equal((await window.jaitDesktop.confirmShare({})).accepted, false);
});

test('getDesktopSources returns an empty source list on the web', async () => {
  const { window } = loadShim();
  const sources = await window.jaitDesktop.getDesktopSources();
  assert.deepEqual(sources, []);
});

test('openExternal/openFolder hit glue channels with url/path args', async () => {
  const { window, log } = loadShim();
  const d = window.jaitDesktop;
  await d.openExternal('https://example.com');
  await d.openFolder('/home/jakob');
  const ext = log.find((l) => l.args.channel === 'desktop:open-external');
  const folder = log.find(
    (l) => l.args.channel === 'desktop:fs-op' && l.args.args[0] === 'reveal',
  );
  assert.ok(ext && folder, 'openExternal → open-external, openFolder → fs-op reveal');
  assert.equal(log[0].args.args[0], 'https://example.com');
  assert.equal(folder.args.args[1], '/home/jakob');
});