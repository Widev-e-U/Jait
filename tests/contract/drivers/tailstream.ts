import './tailruntime.ts';
/** Interactive fixture entrypoint. No gateway assertions are evaluated here. */
import { readLine, emit } from './tailtransport.ts';
// Node marks pipe-backed stdin nonblocking; synchronous assertion replies must
// wait for the Rust peer instead of failing with EAGAIN between observations.
(process.stdin as typeof process.stdin & { _handle?: { setBlocking?: (blocking: boolean) => void } })._handle?.setBlocking?.(true);
const request = readLine();
const log = console.log;
console.log = (...args: unknown[]) => console.error(...args);
try {
  const { dispatch } = await import('./tailstatic.ts');
  await dispatch(request);
  emit({ event: 'complete' });
  process.exit(0);
} catch (error) {
  emit({ event: 'error', message: String(error instanceof Error ? (error.stack ?? error.message) : error) });
  process.exit(1);
} finally {
  console.log = log;
}
