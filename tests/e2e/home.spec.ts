import { expect, test } from '@playwright/test';

test('home page responds with app shell', async ({ request }) => {
  const response = await request.get('/');
  expect(response.ok()).toBeTruthy();

  const html = await response.text();
  expect(html).toContain('加载数据中');
  expect(html).toContain('min-h-screen');
});
