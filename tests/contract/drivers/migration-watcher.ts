import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectWatcher, type FileChangeEvent } from '../../../packages/gateway/src/services/project-watcher.ts';

export async function watchCaseSensitiveFiles() {
  const root = join(process.env.JAIT_STATE_DIR!, 'watched');
  await mkdir(join(root, 'ignored'), { recursive: true });
  const watcher = new ProjectWatcher({ coalesceMs: 200, ignore: ['**/ignored/**'], allowGeneratedRoot: true });
  const events: FileChangeEvent[] = [];
  const paths = ['A.ts', 'a.ts'];
  let failure: unknown;
  watcher.on('changes', batch => events.push(...batch));
  watcher.on('error', error => { failure = error; });
  try {
    await watcher.watch(root);
    await writeFile(join(root, 'ignored', 'noise.txt'), 'ignored');
    for (const path of paths) await writeFile(join(root, path), path);
    const deadline = Date.now() + 5_000;
    while (!paths.every(path => events.some(event => event.path === path)) && !failure && Date.now() < deadline) {
      await Bun.sleep(10);
    }
  } finally {
    await watcher.stop();
  }
  if (failure) throw failure;
  return events;
}
