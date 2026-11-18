import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientPathCandidates, normalizeClientPath } from './client-inventory.mjs';

test('collects lexical API path candidates and normalizes template segments', () => {
  const source = [
    'fetch(`/api/sessions/${id}/messages?limit=3`)',
    'fetch("/api/settings")',
    'fetch(`/api/threads/${encodeURIComponent(id)}/events`)',
    'fetch(`/api/choice/${ok ? a : b}/details`)',
    '// /api/comment-is-a-candidate',
    'fetch(`/api/sessions/${id}/messages`)',
  ].join('\n');
  assert.deepEqual(clientPathCandidates(source), [
    '/api/choice/{}/details', '/api/comment-is-a-candidate', '/api/sessions/{}/messages', '/api/settings', '/api/threads/{}/events',
  ]);
  assert.equal(normalizeClientPath('/api/sessions/:sessionId/messages'), '/api/sessions/{}/messages');
});
