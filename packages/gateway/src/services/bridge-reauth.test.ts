import { describe, expect, it } from 'vitest';
import { applyCommand, pickRefreshToken, removeCommand } from './bridge-reauth.js';

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
