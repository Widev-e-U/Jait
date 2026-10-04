import { once } from 'node:events';

export function hasExited(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

export async function terminateChild(child) {
  if (hasExited(child)) return;
  // Signal exits leave exitCode null. Subscribe before kill so neither an
  // already signalled process nor a fast exit can leave an unsettled await.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const exited = once(child, 'exit', { signal: controller.signal });
  try {
    child.kill();
    await exited;
  } finally {
    clearTimeout(timer);
  }
}
