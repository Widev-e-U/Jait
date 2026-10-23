/** Actual helpers; Rust owns inputs, fixtures and all assertions. */
import { commandSyntaxError } from '../../../packages/gateway/src/lib/command-syntax.ts';
import { resolveCommandYieldMs } from '../../../packages/gateway/src/lib/command-wait.ts';
export async function dispatch(call: any) {
  if (call.op === 'nativecommandhelpers.syntax') {
    return call.cases.map((c: any) => {
      const result = commandSyntaxError(c.command, c.shell);
      return result === null ? null : Array.from({length: result.length}, (_, i) => result.charCodeAt(i));
    });
  }
  if (call.op === 'nativecommandhelpers.wait') {
    const number = (value: any) => value === 'NaN' ? NaN : value === 'Infinity' ? Infinity : value === '-Infinity' ? -Infinity : value;
    return call.cases.map((c: any) => {
      const result = resolveCommandYieldMs(number(c.value), number(c.timeout));
      return Number.isNaN(result) ? 'NaN' : result;
    });
  }
  throw Error('unknown command helper operation');
}
