import { describe, expect, it } from 'vitest';
import { normaliseAccounts } from './bridge-status.js';

describe('Teams tenant status', () => {
  it('reads a valid sign-in email or an email used as the account name', () => {
    const accounts = normaliseAccounts([
      { id: 'first', name: 'Sam', signInEmail: 'sam@example.com' },
      { id: 'second', name: 'legacy@example.com' },
      { id: 'third', name: 'Guest', signInEmail: 'sam_example.com#EXT#@tenant.onmicrosoft.com' },
    ]);
    expect(accounts?.map(account => account.signInEmail)).toEqual(['sam@example.com', 'legacy@example.com', undefined]);
  });

  it('preserves the per-tenant probe result and does not turn unknown into connected', () => {
    const tenants = normaliseAccounts([{ id: 'account', tenants: [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Expired', state: 'expired', connected: true },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Unknown', state: 'unknown', connected: false },
      { id: '33333333-3333-3333-3333-333333333333', name: 'New', state: 'disconnected', connected: false },
      { id: '44444444-4444-4444-4444-444444444444', name: 'Legacy', connected: true },
    ] }])?.[0]?.tenants;
    expect(tenants?.map(({ state, connected }) => [state, connected])).toEqual([
      ['expired', false], ['unknown', false], ['disconnected', false], [undefined, true],
    ]);
  });
});
