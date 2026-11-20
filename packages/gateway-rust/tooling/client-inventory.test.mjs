import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientPathCandidates, clientRequestSites, clientRouteShape, clientShapeMatchesRoute, normalizeClientPath, reviewClientRequests } from './client-inventory.mjs';

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

test('a request path is literal only when its text carries /api, so computed and non-/api paths are reviewed', () => {
  const sites = clientRequestSites('apps/web/src/x.tsx', [
    'const a = fetch(`${API_URL}/api/projects/${id}`);',
    'const b = fetch(url);',
    'const c = this.request("/command", "POST");',
    'const d = getJson(`${baseUrl}/surfaces`);',
    'const e = navigator.locks.request(name, {});',
    'const f = git.fetch(cwd);',
    'const g = apiFetch("/api/x");',
    'function Comp() { return fetch(`/health`); }',
  ].join('\n'));
  assert.deepEqual(sites.map((site) => site.literal), [true, false, false, false, true, false]);
  assert.equal(sites.at(-1).key, 'apps/web/src/x.tsx|Comp');
});

test('an unreviewed non-literal request path fails review, and a changed count or stale entry fails it too', () => {
  const sites = [{ key: 'apps/web/src/x.tsx|Comp', literal: false }];
  assert.throws(() => reviewClientRequests(sites, []), /unreviewed non-literal request path in apps\/web\/src\/x\.tsx\|Comp \(1 call/);
  assert.throws(() => reviewClientRequests(sites, [{ key: 'apps/web/src/x.tsx|Comp', count: 2, reason: 'x' }]), /reviewed 2, found 1/);
  assert.throws(() => reviewClientRequests([], [{ key: 'apps/web/src/x.tsx|Comp', count: 1, reason: 'x' }]), /reviewed but absent/);
  assert.doesNotThrow(() => reviewClientRequests([{ key: 'apps/web/src/x.tsx|Comp', literal: true }], []));
});
