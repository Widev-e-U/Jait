/** Synchronous assertion observations; the parent Rust test supplies each verdict. */
import { readSync, writeSync, writeFileSync } from 'node:fs';
export function readLine(): any {
  const bytes: number[] = [];
  const byte = Buffer.alloc(1);
  while (true) {
    if (readSync(0, byte, 0, 1, null) === 0) throw new Error('Rust assertion peer disconnected');
    if (byte[0] === 10) break;
    bytes.push(byte[0]!);
    if (bytes.length > 262144) throw new Error('Rust assertion message exceeds limit');
  }
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}
let payloadSequence = 0;
export function emit(value: unknown): void {
  let serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 16 * 1024 * 1024) throw new Error('Assertion payload exceeds 16 MiB');
  // Bun's test output can split long lines. Keep full observations in bounded
  // files in this peer's private artifact directory, then send a short envelope.
  if (Buffer.byteLength(serialized) > 8192) {
    const directory = process.env['JAIT_ASSERTION_DIR'];
    if (!directory) throw new Error('Assertion payload directory is missing');
    const file = 'payload-' + payloadSequence++ + '.json';
    writeFileSync(directory + '/' + file, serialized, { mode: 0o600 });
    serialized = JSON.stringify({ event: 'payload', file });
  }
  const text = '\x1eJAIT_ASSERTION ' + serialized + '\n';
  if (Buffer.byteLength(text) > 262144) throw new Error('Assertion observation exceeds limit');
  const bytes = Buffer.from(text);
  for (let offset = 0; offset < bytes.length;) offset += writeSync(1, bytes, offset, bytes.length - offset);
}
export function observe(observation: unknown): void {
  if (process.env['JAIT_ASSERTION_STREAM'] !== '1') return;
  emit({ event: 'assertion', observation });
  const verdict = readLine();
  if (verdict.pass !== true) throw new Error('Rust assertion failed: ' + String(verdict.message ?? 'comparison mismatch'));
}
