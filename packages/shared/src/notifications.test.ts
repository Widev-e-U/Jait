import { describe, expect, it } from 'vitest';
import { chatNotificationLink, safeNotificationLink, notificationPreview } from './notifications';

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
