// Lexical candidates from the gateway WebSocket hub, not proof of runtime parity.
// Switch arms are inbound candidates; literal type properties are outbound
// candidates. Both may include unrelated objects or switches. Other emitters
// and dynamic message types are not scanned.
export function websocketCandidates(nodeSource, rustSource) {
  const inbound = new Set([...nodeSource.matchAll(/\bcase\s+["']([a-z][\w.:-]*)["']\s*:/g)].map((m) => m[1]));
  const outbound = new Set([...nodeSource.matchAll(/\btype\s*:\s*["'`]([a-z][\w.:-]*)["'`]/g)].map((m) => m[1]));
  const rustInbound = new Set();
  for (const arm of rustSource.matchAll(/("(?:[a-z][\w.:-]*)"(?:\s*\|\s*"(?:[a-z][\w.:-]*)")*)\s*=>/g)) {
    for (const value of arm[1].matchAll(/"([a-z][\w.:-]*)"/g)) rustInbound.add(value[1]);
  }
  const rustOutbound = new Set([...rustSource.matchAll(/["']type["']\s*:\s*["']([a-z][\w.:-]*)["']/g)].map((m) => m[1]));
  return [
    ...[...inbound].map((type) => ({ type, direction: 'client-to-server-candidate', rustReference: rustInbound.has(type) })),
    ...[...outbound].map((type) => ({ type, direction: 'server-to-client-candidate', rustReference: rustOutbound.has(type) })),
  ].sort((a, b) => a.direction.localeCompare(b.direction) || a.type.localeCompare(b.type));
}
