import { expect, test } from '@playwright/test';

test('home page responds with app shell', async ({ request }) => {
  const response = await request.get('/');
  expect(response.ok()).toBeTruthy();

  const html = await response.text();
  expect(html).toContain('Syncing Trends...');
  expect(html).toContain('min-h-screen');
});
