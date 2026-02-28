import { expect, test } from '@playwright/test';

test('home page can be opened', async ({ page }) => {
  await page.goto('/');

  const readyState = await Promise.race([
    page.getByRole('button', { name: '全部平台' }).waitFor({ state: 'visible', timeout: 15000 }).then(() => 'tabs').catch(() => null),
    page.getByRole('button', { name: '重新尝试' }).waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error').catch(() => null),
  ]);

  expect(readyState).not.toBeNull();
});
