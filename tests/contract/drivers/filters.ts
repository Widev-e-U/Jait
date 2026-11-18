/** Test-only bridge: Rust owns inputs, expected results and comparison rules.
 * Production functions run here unchanged; this is deliberately not a production
 * RPC interface or a future Rust gateway API.
 */
import {
  commandOutputFilteringEnabled,
  compressCommandOutput,
  compressGitDiff,
  compressGitLog,
  compressGitStatus,
  compressGrepOutput,
  compressPathList,
  compressTestOutput,
  normalizeCommandForFiltering,
  resolvePrimaryCommand,
} from '../../../packages/gateway/src/tools/command-output-filters.ts';

// Compact fixture descriptions let Rust request long outputs within transport limits.
// `$range` expands a declarative template (`{i}` zero-based, `{n}` one-based) so the
// Rust-owned vector keeps the input spec instead of thousands of literal lines.
function materialize(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if ('$repeat' in value) return String(value.$repeat[0]).repeat(value.$repeat[1]);
  if ('$concat' in value) return value.$concat.map((part: any) => materialize(part)).join('');
  if ('$range' in value) {
    const { template, count } = value.$range;
    return Array.from({ length: count }, (_, i) =>
      String(template).replaceAll('{i}', String(i)).replaceAll('{n}', String(i + 1)));
  }
  if (Array.isArray(value)) {
    return value.flatMap((item: any) => {
      const done = materialize(item);
      return Array.isArray(done) ? done : [done];
    });
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item)]));
}

/** One command's captured output: explicit lines joined with newlines, or raw text. */
function text(call: any): string {
  if (call.lines !== undefined) return (materialize(call.lines) as string[]).join('\n');
  return materialize(call.input);
}

export async function dispatch(call: any): Promise<unknown> {
  switch (call.op) {
    case 'filters.normalize': return normalizeCommandForFiltering(materialize(call.input));
    case 'filters.primary-command': return resolvePrimaryCommand(materialize(call.input));
    case 'filters.enabled': return commandOutputFilteringEnabled(materialize(call.env ?? {}));
    case 'filters.git-status': return compressGitStatus(text(call));
    case 'filters.git-log': return compressGitLog(text(call));
    case 'filters.git-diff': return compressGitDiff(text(call));
    case 'filters.grep': return compressGrepOutput(text(call));
    case 'filters.tests': return compressTestOutput(text(call));
    case 'filters.path-list': return compressPathList(text(call));
    case 'filters.compress': {
      return compressCommandOutput(materialize(call.command), text(call), materialize(call.options ?? {}));
    }
    default: throw new Error('unknown filters operation');
  }
}
