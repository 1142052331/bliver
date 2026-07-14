import { defineConfig } from 'vitest/config';

export const baseVitestConfig = defineConfig({
  test: {
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
  },
});
