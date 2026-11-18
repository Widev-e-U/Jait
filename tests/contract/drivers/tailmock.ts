/** Reuse Vitest's standalone spy library for dependency-injected fixture call traces. */
const { mock: bunMock, spyOn: bunSpyOn } = typeof globalThis.Bun !== 'undefined'
  ? await import('bun:test')
  : { mock: { module() { throw new Error('Module mocks require the Bun peer'); } }, spyOn() { throw new Error('Module spies require the Bun peer'); } };
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve('vitest/package.json'));
const spies = await import(vitestRequire.resolve('@vitest/spy'));
const globals = new Map<string, PropertyDescriptor | undefined>();
const env = new Map<string, string | undefined>();
const fakeTimers = await import(vitestRequire.resolve('@sinonjs/fake-timers'));
const realNow = Date.now.bind(Date);
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
let clock: any;
const nativeSpies = new Set<any>();
let moduleEpoch = 0;
const originalModules = new Map<string, any>();
const moduleVersions = new Map<string, number>();

export const vi = {
  fn: spies.fn,
  hoisted: <T>(factory: () => T): T => factory(),
  async mock(id: string, factory: (...args: any[]) => any) {
    if (typeof factory !== 'function') throw new Error('Module automocking requires a manual fixture');
    // Copy live exports before Bun replaces them, so importOriginal closures stay original.
    const original = factory.length ? { ...await import(id) } : undefined;
    if (original) originalModules.set(id, original);
    const exports = await factory(() => Promise.resolve(original));
    await bunMock.module(id, () => exports);
    if (id.startsWith('node:')) {
      const mocked = await import(id);
      for (const [key, value] of Object.entries(exports)) {
        if (mocked[key] !== value) throw new Error('Fixture module mock was not applied: ' + id + '.' + key);
      }
    }
  },
  async doMock(id: string, factory: (...args: any[]) => any) { return vi.mock(id, factory); },
  async importActual<T>(id: string): Promise<T> { return (originalModules.get(id) ?? await import(id)) as T; },
  useFakeTimers(options: any = {}) { const now = clock?.now ?? Date.now(); if (clock) clock.uninstall(); clock = fakeTimers.install({ now, ...options }); return vi; },
  useRealTimers() { if (clock) { clock.uninstall(); clock = undefined; } return vi; },
  setSystemTime(value: any) { if (!clock) clock = fakeTimers.install({ toFake: ['Date'] }); clock.setSystemTime(value); return vi; },
  advanceTimersByTime(time: number) { if (!clock) throw new Error('Fake timers are not enabled'); clock.tick(time); return vi; },
  async advanceTimersByTimeAsync(time: number) { if (!clock) throw new Error('Fake timers are not enabled'); await clock.tickAsync(time); return vi; },
  getTimerCount() { if (!clock) throw new Error('Fake timers are not enabled'); return clock.countTimers(); },
  async waitFor(callback: () => unknown, options: any = {}) {
    const timeout = typeof options === 'number' ? options : options.timeout ?? 1000;
    const interval = typeof options === 'number' ? 50 : options.interval ?? 50;
    const deadline = realNow() + timeout;
    let failure: unknown;
    do {
      try { return await callback(); } catch (error) { failure = error; }
      if (clock) await clock.tickAsync(interval);
      else await new Promise(resolve => realSetTimeout(resolve, interval));
    } while (realNow() <= deadline);
    throw failure ?? new Error('Fixture waitFor timed out');
  },
  spyOn: (...args: any[]) => {
    // Bun mutates method functions in place, which also changes saved bound
    // originals; descriptor spies preserve the original callable and accessors.
    if (args[2] || Object.prototype.toString.call(args[0]) !== '[object Module]') {
      return (spies.spyOn as any)(...args);
    }
    const spy = (bunSpyOn as any)(...args); nativeSpies.add(spy); return spy;
  },
  resetModules() { moduleEpoch += 1; },
  async importFresh<T>(url: string): Promise<T> { const id = require.resolve(new URL(url).pathname); if (moduleVersions.get(id) !== moduleEpoch) { delete require.cache[id]; moduleVersions.set(id, moduleEpoch); } return await import(id) as T; },
  mocked: <T>(value: T): T => value,
  restoreAllMocks() { for (const mock of spies.mocks) mock.mockRestore(); for (const spy of nativeSpies) spy.mockRestore(); },
  clearAllMocks() { for (const mock of spies.mocks) mock.mockClear(); for (const spy of nativeSpies) spy.mockClear(); },
  resetAllMocks() { for (const mock of spies.mocks) mock.mockReset(); for (const spy of nativeSpies) spy.mockReset(); },
  stubGlobal(key: string, value: unknown) {
    if (!globals.has(key)) globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  },
  unstubAllGlobals() {
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    globals.clear();
  },
  stubEnv(key: string, value: string | undefined) {
    if (!env.has(key)) env.set(key, process.env[key]);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  },
  unstubAllEnvs() {
    for (const [key, value] of env) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    env.clear();
  },
};
