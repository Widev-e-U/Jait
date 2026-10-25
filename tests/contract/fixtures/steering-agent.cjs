// Local ACP peer for the Rust-owned steering contracts. Never contacts a model.
const fs = require('node:fs');
const path = require('node:path');
const directory = process.argv[2];
const fixture = JSON.parse(fs.readFileSync(path.join(directory, 'fixture.json'), 'utf8'));
const log = value => fs.appendFileSync(path.join(directory, 'wire.jsonl'), JSON.stringify(value) + '\n');
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const exists = name => fs.existsSync(path.join(directory, name));
let firstPrompt;
let steeringRequest;
let prompts = 0;
let buffer = '';
function ack(request) {
  log({ kind: 'ack', outcome: fixture.outcome ?? 'injected' });
  if (fixture.error) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }) + '\n');
  else reply(request.id, { outcome: fixture.outcome ?? 'injected', ...(fixture.outcome === 'promptRequired' ? { reason: 'noRunningTurn' } : {}) });
}
setInterval(() => {
  if (firstPrompt && exists('finish')) {
    log({ kind: 'completed', turn: 1 });
    reply(firstPrompt.id, { stopReason: 'end_turn' });
    firstPrompt = undefined;
  }
  if (steeringRequest && exists('ack')) {
    ack(steeringRequest);
    steeringRequest = undefined;
  }
}, 5);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    const request = JSON.parse(line);
    if (request.method === 'initialize') {
      reply(request.id, { protocolVersion: 1, agentCapabilities: fixture.capabilities ?? {}, _meta: fixture.meta ?? {} });
    } else if (request.method === 'session/new') {
      reply(request.id, { sessionId: 'acp-wire-session' });
    } else if (request.method === 'session/prompt') {
      prompts++;
      log({ kind: 'prompt', turn: prompts, text: request.params.prompt[0].text });
      if (prompts === 1) {
        firstPrompt = request;
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'acp-wire-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'working' } } } }) + '\n');
      } else {
        log({ kind: 'completed', turn: prompts });
        reply(request.id, { stopReason: 'end_turn' });
      }
    } else if (request.method === '_session/steering') {
      log({ kind: 'steer', params: request.params });
      if (fixture.holdAck && !exists('ack')) steeringRequest = request;
      else ack(request);
    } else if (request.id !== undefined) reply(request.id, {});
  }
});
