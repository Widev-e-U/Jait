import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import original from '../../../vitest.config';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = fileURLToPath(new URL('../../../.jait/artifacts/rust-continuation/component-baseline/', import.meta.url));
// Replace arrays after merging: the original suites/aliases/assertions remain intact.
const config = mergeConfig(original, defineConfig({
  root,
  test: {
    maxWorkers: 2,
    minWorkers: 1,
    coverage: {
      enabled: true,
      provider: 'istanbul',
      all: true,
      reportOnFailure: true,
      reportsDirectory: `${output}/coverage`,
      reporter: ['json-summary', 'json', 'text-summary'],
    },
    reporters: ['default', 'json'],
    outputFile: { json: `${output}/tests.json` },
  },
}));
config.test!.include = ['packages/{gateway,shared,api-client}/src/**/*.test.ts'];
config.test!.coverage!.include = ['packages/{gateway,shared,api-client}/src/**/*.ts'];
config.test!.coverage!.exclude = ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts'];
export default config;
