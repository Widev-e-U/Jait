/** Differential bridge: execute the real provider accounting exports. */
import { parseAcpUsage, parseCodexUsage, TurnUsageAccumulator, summarizeUsage } from '../../../packages/gateway/src/providers/usage.ts';

export async function dispatch(call: any): Promise<any> {
  switch (call.op) {
    case 'nativeusage.codex': return parseCodexUsage(call.value) ?? null;
    case 'nativeusage.acp': return parseAcpUsage(call.value, call.id) ?? null;
    case 'nativeusage.summary': return summarizeUsage(call.rounds) ?? null;
    case 'nativeusage.accumulate': {
      const accumulator = new TurnUsageAccumulator(call.baseline, call.fresh ?? false);
      const snapshots: any[] = [];
      for (const action of call.actions) {
        if (action.op === 'add') accumulator.add(action.usage);
        else if (action.op !== 'snapshot') throw new Error('unknown accounting action');
        snapshots.push({ baseline: accumulator.baseline ?? null, metrics: accumulator.metrics(action.durationMs ?? 0) ?? null });
      }
      return snapshots;
    }
    default: throw new Error('unknown accounting operation');
  }
}
