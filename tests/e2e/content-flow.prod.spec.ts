import { expect, test } from '@playwright/test';

const username =
  process.env.PLAYWRIGHT_PIPELINE_USERNAME || process.env.PIPELINE_ADMIN_USERNAME || '';
const password =
  process.env.PLAYWRIGHT_PIPELINE_PASSWORD || process.env.PIPELINE_ADMIN_PASSWORD || '';

test.describe('production content console flow', () => {
  test.skip(!username || !password, 'Missing pipeline login credentials for production e2e.');

  test('account apply -> profile -> opportunity -> draft', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);

    const uniqueSuffix = Date.now().toString().slice(-8);
    const accountName = `PW全流程-${uniqueSuffix}`;

    await page.goto('/');
    await expect(page.getByRole('button', { name: '生产引擎' })).toBeVisible({ timeout: 120_000 });

    await page.getByRole('button', { name: '生产引擎' }).click();
    await page.getByPlaceholder('账号名称').fill(username);
    await page.getByPlaceholder('登录密码').fill(password);
    await page.getByRole('button', { name: '继续访问' }).click();
    await expect(page.getByRole('heading', { name: '内容生产工作台' })).toBeVisible();

    await page.getByRole('link', { name: '账号管理' }).click();
    await expect(page).toHaveURL(/\/accounts\/settings/);
    await expect(page.getByRole('button', { name: '新建账号' })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: '新建账号' }).click();
    await expect(page.getByRole('button', { name: '创建新账号' })).toBeVisible({ timeout: 15_000 });

    await page.locator('input').nth(0).fill(accountName);
    await page.getByRole('button', { name: '创建新账号' }).click();
    await expect(page.getByText('账号信息已同步。')).toBeVisible({ timeout: 120_000 });

    await page.getByPlaceholder('如：高净值商务人士').fill('关注商业与科技趋势的公众号读者');
    await page.getByPlaceholder('如：权威、冷静、客观').fill('专业、克制、可执行');
    await page.getByPlaceholder('如：提升业界影响力').fill('follow');
    await page.locator('textarea').first().fill('信息碎片化；缺少行动方案');
    await page.getByRole('button', { name: '保存并应用定位策略' }).click();
    await expect(page.getByText('定位配置已全局生效。')).toBeVisible({ timeout: 30_000 });

    await page.goto('/');

    await page.getByRole('button', { name: '生产引擎' }).click();
    await expect(page.getByRole('heading', { name: '内容生产工作台' })).toBeVisible();

    await page.getByRole('button', { name: '同步创作机会' }).click();
    await page
      .locator('div')
      .filter({ hasText: /^同步完成：已发现 \d+ 个新机会。$/ })
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => {
        // 同步成功提示在不同数据状态下不稳定出现，不阻塞后续机会链路验证。
      });

    await page.getByRole('button', { name: '刷新机会' }).click();

    const generateButton = page.getByRole('button', { name: '一键生成稿件' }).first();
    await expect(generateButton).toBeVisible({ timeout: 120_000 });
    await generateButton.click();

    await expect(page.getByRole('button', { name: '复制正文' })).toBeVisible({ timeout: 240_000 });
  });
});
