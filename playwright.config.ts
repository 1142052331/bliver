import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  outputDir: './test-results',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-360x800', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 800 } } },
    { name: 'mobile-390x844', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-430x932', use: { ...devices['Pixel 5'], viewport: { width: 430, height: 932 } } },
    { name: 'desktop-1440x1000', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    { command: 'npx.cmd tsx apps/api/src/bootstrap/e2e-server.ts', url: 'http://127.0.0.1:5100/healthz', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: 'npm.cmd --workspace @bliver/web run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
