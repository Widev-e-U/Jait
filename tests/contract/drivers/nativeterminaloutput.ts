import { describeTerminalOutputFlood, measureTerminalOutput, terminalOutputStatsFor } from '../../../packages/gateway/src/tools/terminal-tools.ts';

interface OutputRequest {
  op: 'nativeterminaloutput.measure';
  parts: Array<{ text: string; repeat?: number }>;
}

export function dispatch(call: OutputRequest) {
  if (call.op !== 'nativeterminaloutput.measure') throw new Error('unknown terminal-output operation');
  const output = call.parts.map(part => part.text.repeat(part.repeat ?? 1)).join('');
  const stats = measureTerminalOutput(output);
  const admitted = terminalOutputStatsFor(output);
  return {
    stats,
    admitted,
    flood: describeTerminalOutputFlood(stats),
    admittedFlood: admitted ? describeTerminalOutputFlood(admitted) : null,
  };
}
