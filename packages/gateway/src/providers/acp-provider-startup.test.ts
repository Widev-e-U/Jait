import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { AcpProvider } from './acp-provider.js';
import { ProviderSnapshotCache } from './provider-snapshot.js';
import { ProviderRegistry } from './registry.js';

it('disables an installed ACP launcher after initialization fails and recovers after refresh', async () => {
  const root = join(import.meta.dirname, '../../../../.jait/artifacts');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'acp-startup-'));
  const script = join(directory, 'agent.cjs');
  const agentScript = (fail: boolean) => `
    require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
      const request = JSON.parse(line);
      const response = ${fail}
        ? { error: { code: -32603, message: 'Junie startup failed' } }
        : { result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } };
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...response }) + '\\n');
    });
  `;
  writeFileSync(script, agentScript(true));
  const provider = new AcpProvider({ id: 'junie-account', providerType: 'junie', name: 'Junie', description: '', command: process.execPath, args: [script], auth: 'acp' });
  const registry = new ProviderRegistry();
  registry.register(provider);
  const cache = new ProviderSnapshotCache(registry);
  try {
    const [failed] = await cache.get(true);
    expect(failed).toMatchObject({ installed: true, available: false, auth: { login: false, logout: false, authenticated: null } });
    expect(failed.unavailableReason).toContain('Junie startup failed');
    expect(failed.auth?.detail).toBe(failed.unavailableReason);
    // A second launcher check must not erase the cached startup failure.
    expect((await cache.get(true))[0].available).toBe(false);
    writeFileSync(script, agentScript(false));
    provider.resetModels();
    expect((await cache.get(true))[0]).toMatchObject({ installed: true, available: true, unavailableReason: undefined });
  } finally {
    await provider.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
});
