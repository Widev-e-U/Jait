import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientPathCandidates, clientRouteShape, clientShapeMatchesRoute, normalizeClientPath } from './client-inventory.mjs';

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

test('client route shapes drop glued suffixes and prose punctuation before matching routes', () => {
  assert.equal(clientRouteShape('/api/providers{}'), '/api/providers');
  assert.equal(clientRouteShape('/api/agents/{}/github-app{}'), '/api/agents/{}/github-app');
  assert.equal(clientRouteShape('/api/preview/inspect/{}{}'), '/api/preview/inspect/{}');
  assert.equal(clientRouteShape('/api/chat:'), '/api/chat');
  assert.equal(clientRouteShape('/api/chat.'), '/api/chat');
  assert.ok(clientShapeMatchesRoute('/api/{}/{}/runtime', '/api/agents/{}/runtime'));
  assert.ok(clientShapeMatchesRoute('/api/providers', '/api/providers'));
  assert.ok(clientShapeMatchesRoute('/api/security/findings', '/api/security/{}'), 'a client literal reaches a route parameter');
  assert.ok(!clientShapeMatchesRoute('/api/security/findings', '/api/security/status'), 'distinct literals do not match');
  assert.ok(!clientShapeMatchesRoute('/api/sessions/{}/messages', '/api/sessions/{}'), 'segment counts must agree');
});
