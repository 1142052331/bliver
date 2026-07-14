import { defineConfig, mergeConfig } from 'vitest/config';

import { baseVitestConfig } from '../../packages/config/vitest.base.js';

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    test: {
      environment: 'node',
      testTimeout: 30_000,
    },
  }),
);
