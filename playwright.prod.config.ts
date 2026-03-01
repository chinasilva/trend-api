import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_PROD_BASE_URL || 'https://trend.binaryworks.app';
const browserName = (process.env.PLAYWRIGHT_BROWSER || 'chromium') as
  | 'chromium'
  | 'firefox'
  | 'webkit';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.prod.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    browserName,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
