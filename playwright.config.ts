import { defineConfig } from '@playwright/test';

const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT || 3100);
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const browserName = (process.env.PLAYWRIGHT_BROWSER || 'webkit') as 'chromium' | 'firefox' | 'webkit';
const testDistDir = process.env.PLAYWRIGHT_NEXT_DIST_DIR || '.next-playwright';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: webBaseUrl,
    browserName,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `NEXT_DIST_DIR=${testDistDir} npm run build && NEXT_DIST_DIR=${testDistDir} PORT=${webPort} npm run start`,
    url: webBaseUrl,
    reuseExistingServer: false,
    timeout: 240000,
  },
});
