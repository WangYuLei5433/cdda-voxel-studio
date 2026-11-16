import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:5181', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev -- --port 5181 --strictPort', url: 'http://127.0.0.1:5181', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
