import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backgroundInventory, backgroundSitesIn, walkGatewaySource } from './services-inventory.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const gatewaySrc = join(here, '../../gateway/src');

test('finds setInterval, self re-arming timers, literal loops and index.ts starts, and not one-shot timers', () => {
  const sites = backgroundSitesIn(
    'services/x.ts',
    `
    class Poller {
      start() { this.timer = setInterval(() => this.poll(), 5000); }
      schedule() { setTimeout(() => this.schedule(), 1000); }
      once() { setTimeout(() => done(), 10); }
      drain() { while (true) { if (!next()) break; } }
    }
    `,
  );
  assert.deepEqual(
    sites.map((s) => [s.kind, s.key]),
    [
      ['setInterval', 'services/x.ts|Poller.start'],
      ['rearming-timeout', 'services/x.ts|Poller.schedule'],
      ['loop', 'services/x.ts|Poller.drain'],
    ],
  );
  const boot = backgroundSitesIn(
    'index.ts',
    'async function main() { primaryLink.start(); queueThing.startSomething(); el.startsWith("x"); }',
  );
  assert.deepEqual(boot.map((s) => s.callee), ['primaryLink.start', 'queueThing.startSomething']);
});

test('the reviewed inventory covers every background site in the real gateway source', () => {
  const { services, excluded } = backgroundInventory(walkGatewaySource(gatewaySrc));
  assert.equal(services.length, 21);
  // The composition root's start call and the setInterval inside the service.
  assert.equal(services.find((s) => s.name === 'scheduler').nodeSites.length, 2);
  assert.equal(services.find((s) => s.name === 'primaryLink').nodeSites.length, 2);
  assert.ok(excluded.some((e) => e.key === 'routes/chat.ts|registerChatRoutes' && e.sites.length === 8));
});

test('an unreviewed background site in the real gateway source makes the inventory throw', () => {
  const files = walkGatewaySource(gatewaySrc);
  const withLoop = [...files, { path: 'services/new-loop.ts', text: 'class N { start() { setInterval(() => {}, 1); } }' }];
  assert.throws(() => backgroundInventory(withLoop), /unreviewed background site: services\/new-loop\.ts\|N\.start/);
  const withStart = files.map((f) =>
    f.path === 'index.ts' ? { ...f, text: `${f.text}\nasync function extra() { mystery.start(); }` } : f,
  );
  assert.throws(() => backgroundInventory(withStart), /unreviewed composition start: mystery\.start/);
});
