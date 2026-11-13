import { describe, expect, it } from 'vitest';
import { applyCommand, pickRefreshToken, removeCommand, tenantApplyCommand, TeamsReauthService } from './bridge-reauth.js';

const CID = '5e3ce6c0-2b1f-4285-8d4b-75ee78787346';
const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const token = 'r'.repeat(120);
const entry = (over: Record<string, unknown> = {}) => ({
  url, status: 200,
  requestBody: { text: `client_id=${CID}&grant_type=authorization_code` },
  responseBody: { text: JSON.stringify({ refresh_token: token }) },
  ...over,
});

describe('pickRefreshToken', () => {
  it('returns the refresh token of the Teams web client', () => {
    expect(pickRefreshToken([entry()])).toBe(token);
  });
  it('waits for a response for the selected tenant instead of accepting the home tenant', () => {
    const guest = '11111111-1111-1111-1111-111111111111';
    const home = '22222222-2222-2222-2222-222222222222';
    const idToken = (tid: string) => `header.${Buffer.from(JSON.stringify({ tid })).toString('base64url')}.signature`;
    const response = (tid: string) => ({ text: JSON.stringify({ refresh_token: token, id_token: idToken(tid) }) });
    expect(pickRefreshToken([entry({ responseBody: response(home) })], guest)).toBeNull();
    expect(pickRefreshToken([entry({ responseBody: response(home) }), entry({ responseBody: response(guest) })], guest)).toBe(token);
    expect(pickRefreshToken([entry({ url: `https://login.microsoftonline.com/${guest}/oauth2/v2.0/token` })], guest)).toBe(token);
    expect(pickRefreshToken([entry({ url: `https://login.microsoftonline.com/${guest}/oauth2/v2.0/token`, responseBody: response(home) })], guest)).toBeNull();
    expect(pickRefreshToken([entry()], guest)).toBeNull();
    expect(pickRefreshToken([entry({ responseBody: response(guest), requestBody: null })], guest)).toBeNull();
    expect(pickRefreshToken([entry({ url: `https://example.com/${guest}/oauth2/v2.0/token`, responseBody: response(guest) })], guest)).toBeNull();
    expect(pickRefreshToken([entry({ responseBody: { text: JSON.stringify({ refresh_token: token, id_token: 'bad' }) } })], guest)).toBeNull();
  });
  it('ignores other clients, failures and short tokens', () => {
    expect(pickRefreshToken([entry({ requestBody: { text: 'client_id=other' } })])).toBeNull();
    expect(pickRefreshToken([entry({ status: 400 })])).toBeNull();
    expect(pickRefreshToken([entry({ responseBody: { text: '{"refresh_token":"short"}' } })])).toBeNull();
    expect(pickRefreshToken([entry({ responseBody: { text: '{"refresh' } })])).toBeNull();
  });
});

describe('removeCommand', () => {
  it('derives the remove script next to the apply script', () => {
    expect(removeCommand({ JAIT_TEAMS_REAUTH_CMD: 'ssh a@b /x/teams-reauth.sh' })).toBe('ssh a@b /x/teams-remove-login.sh');
    expect(removeCommand({ JAIT_TEAMS_REMOVE_CMD: 'rm-it' })).toBe('rm-it');
    expect(removeCommand({})).toBeUndefined();
  });
});

describe('applyCommand', () => {
  it('derives the apply script from the reauth command', () => {
    expect(applyCommand({ JAIT_TEAMS_REAUTH_CMD: 'ssh a@b /x/teams-reauth.sh' })).toBe('ssh a@b /x/teams-apply-token.sh');
    expect(applyCommand({ JAIT_TEAMS_APPLY_CMD: 'foo' })).toBe('foo');
    expect(applyCommand({})).toBeUndefined();
  });
});


describe('tenant sign-in', () => {
  it('uses only a dedicated tenant importer', () => {
    expect(tenantApplyCommand({ JAIT_TEAMS_REAUTH_CMD: 'ssh a@b /x/teams-reauth.sh' })).toBe('ssh a@b /x/teams-apply-tenant.sh');
    expect(tenantApplyCommand({ JAIT_TEAMS_APPLY_CMD: 'custom-generic' })).toBeUndefined();
    expect(tenantApplyCommand({ JAIT_TEAMS_TENANT_APPLY_CMD: 'tenant-import' })).toBe('tenant-import');
  });
  it('rejects malformed tenant IDs without starting a browser', async () => {
    const registry = { stopSurface: () => { throw new Error('should not start'); } };
    const service = new TeamsReauthService(registry as never);
    const state = await service.start('user', { accountId: 'invalid', tenantId: 'invalid' });
    expect(state.phase).toBe('error');
  });
});
