import { join } from 'node:path';

/** The full contract suite includes every migration target. Execute it once. */
export function validationCommands(root, targets, fullContracts = false) {
  const path = file => join(root, file);
  return [
    [path('packages/gateway-rust/run.mjs'), 'fmt'],
    [path('packages/gateway-rust/run.mjs'), 'clippy', '--all-targets', '--', '-D', 'warnings'],
    [path('packages/gateway-rust/run.mjs'), 'test', '--lib'],
    [path('tests/contract/run.mjs'), 'test', ...(fullContracts ? [] : targets.flatMap(target => ['--test', target]))],
  ];
}
