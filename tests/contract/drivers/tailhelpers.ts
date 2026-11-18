/** Deterministic input bridge. Assertions and expected values live in Rust vectors. */
import * as tokens from '../../../packages/gateway/src/tools/token-estimator.ts';
import { validateToolInput } from '../../../packages/gateway/src/tools/validate.ts';

function materialize(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (value.$fixture === 'undefined') return undefined;
  if (value.$fixture === 'function') return () => 'ignored';
  if (value.$fixture === 'circular') { const result: any = {}; result.self = result; return result; }
  if (value.$fixture === 'nan') return Number.NaN;
  if (value.$fixture === 'infinity') return Number.POSITIVE_INFINITY;
  if (value.$fixture === 'repeat') return value.text.repeat(value.count);
  if (Array.isArray(value)) return value.map(materialize);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, materialize(child)]));
}

export async function dispatch(call: any): Promise<unknown> {
  switch (call.op) {
    case 'tailhelpers.text': return tokens.estimateTokens(materialize(call.value));
    case 'tailhelpers.json': return tokens.estimateJsonTokens(materialize(call.value));
    case 'tailhelpers.message': return tokens.estimateMessageTokens(materialize(call.message));
    case 'tailhelpers.history': return tokens.estimateHistoryTokens(materialize(call.messages));
    case 'tailhelpers.schemas': return tokens.estimateToolSchemaTokens(materialize(call.schemas));
    case 'tailhelpers.usage': return tokens.computeContextUsage(materialize(call.messages), call.schemas, call.limit);
    case 'tailhelpers.validate': {
      const input = materialize(call.input);
      const result = validateToolInput(call.schema, input);
      return { result, input };
    }
    default: throw new Error('unknown tailhelpers operation');
  }
}
