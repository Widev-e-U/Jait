import { describe, expect, it } from 'vitest';
import {
  chatNotificationLink,
  safeNotificationLink,
  notificationPreview,
  notificationAgentContext,
  notificationTitleWithAgent,
  notificationBodyWithAgent,
} from './notifications';

describe('notification destinations', () => {
  it('round trips chat and project IDs without interpreting them as parameters', () => {
    const link = chatNotificationLink('chat & ?/ä', 'project#1');
    expect(safeNotificationLink(link)).toBe(link);
    const url = new URL(link, 'https://jait.invalid');
    expect(url.searchParams.get('sessionId')).toBe('chat & ?/ä');
    expect(url.searchParams.get('projectId')).toBe('project#1');
  });
  it.each(['https://evil.test', '//evil.test', '/\\evil', '/chat\n', 'javascript:alert(1)', '/api/terminal', '/chat/../../api', null, '/chat?' + 'a'.repeat(4096)])('rejects unsafe destination %s', (link) => {
    expect(safeNotificationLink(link)).toBeNull();
  });
  it('produces a bounded readable preview', () => {
    expect(notificationPreview('## Done\n**Built** [Jait](https://jait.dev)\n```ts\nsecret code\n```')).toBe('Done Built Jait [code]');
    expect(notificationPreview('a'.repeat(300))).toHaveLength(200);
  });
});

describe('agent identity in notifications', () => {
  const agent = { id: 'agent-1', name: 'Lady Merge-a-Lot', role: 'Junior Software Engineer', avatar: 'Pixel' };

  it('leaves legacy text byte-identical when no agent produced the turn', () => {
    expect(notificationTitleWithAgent('Response ready · Daily standup', null)).toBe('Response ready · Daily standup');
    expect(notificationTitleWithAgent('Response ready', undefined)).toBe('Response ready');
    expect(notificationBodyWithAgent('jait · 3 files changed', undefined)).toBe('jait · 3 files changed');
    expect(notificationAgentContext(undefined)).toEqual({});
  });

  it('names the agent in the title and the role in the body', () => {
    expect(notificationTitleWithAgent('Response ready', agent)).toBe('Lady Merge-a-Lot · Response ready');
    expect(notificationBodyWithAgent('jait · 3 files changed', agent)).toBe('Junior Software Engineer · jait · 3 files changed');
  });

  it('falls back to the agent name in the body when no role is set', () => {
    expect(notificationBodyWithAgent('done', { name: 'Gandalf the Git' })).toBe('Gandalf the Git · done');
    expect(notificationTitleWithAgent('', { role: 'QA' })).toBe('');
    expect(notificationBodyWithAgent('', { role: 'QA' })).toBe('QA');
  });

  it('collapses control characters and bounds a hostile agent label', () => {
    expect(notificationTitleWithAgent('ready', { name: 'Push\n\t  a  Lot\u0000' })).toBe('Push a Lot · ready');
    const long = notificationTitleWithAgent('ready', { name: 'x'.repeat(200) });
    expect(long).toBe(`${'x'.repeat(63)}… · ready`);
    expect(notificationAgentContext({ name: '', role: '   ' })).toEqual({});
  });

  it('emits flat string agent fields for transports that only accept text metadata', () => {
    const context = notificationAgentContext(agent);
    for (const value of Object.values(context)) expect(typeof value).toBe('string');
    expect(context).toEqual({ agentId: 'agent-1', agentName: 'Lady Merge-a-Lot', agentRole: 'Junior Software Engineer', agentAvatar: 'Pixel' });
    expect(JSON.parse(JSON.stringify(context))).toEqual(context);
  });

  it('sanitizes but never truncates the agent id, unlike a display label', () => {
    const rawId = `agent:${'a'.repeat(120)}`;
    expect(notificationAgentContext({ id: `agent:\u0000${'a'.repeat(120)}` }).agentId).toBe(rawId);
    expect(notificationAgentContext({ id: '  ' })).toEqual({});
  });
});
