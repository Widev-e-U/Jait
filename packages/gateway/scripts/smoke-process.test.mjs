import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { terminateChild } from './smoke-process.mjs';

function child(exitCode, signalCode) {
  const process = new EventEmitter();
  process.exitCode = exitCode;
  process.signalCode = signalCode;
  process.kill = () => { throw new Error('must not kill an exited child'); };
  return process;
}

async function boundedCleanup(process) {
  let timer;
  try {
    await Promise.race([
      terminateChild(process),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('cleanup waited for an already emitted exit')), 100); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('cleanup handles a child already terminated by a signal', async () => {
  await boundedCleanup(child(null, 'SIGTERM'));
});

test('cleanup handles a child exited with a code', async () => {
  await boundedCleanup(child(0, null));
});

test('cleanup subscribes before requesting termination', async () => {
  const process = child(null, null);
  process.kill = () => {
    process.signalCode = 'SIGTERM';
    process.emit('exit', null, 'SIGTERM');
    return true;
  };
  await boundedCleanup(process);
});

test('cleanup handles no child', async () => {
  await boundedCleanup(undefined);
});
