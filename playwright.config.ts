import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    { command: 'npx.cmd tsx apps/api/src/bootstrap/e2e-server.ts', url: 'http://127.0.0.1:5100/healthz', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: 'npm.cmd --workspace @bliver/web run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
