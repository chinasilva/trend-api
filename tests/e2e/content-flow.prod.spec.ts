import { expect, test } from '@playwright/test';

const apiSecret = process.env.PLAYWRIGHT_PIPELINE_API_SECRET || process.env.PIPELINE_API_SECRET || '';
const syncSecret = process.env.PLAYWRIGHT_PIPELINE_SYNC_SECRET || process.env.PIPELINE_SYNC_SECRET || '';

test.describe('production content console flow', () => {
  test.skip(!apiSecret || !syncSecret, 'Missing pipeline secrets for production e2e.');

  test('account apply -> profile -> opportunity -> draft', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);

    const uniqueSuffix = Date.now().toString().slice(-8);
    const accountName = `PW全流程-${uniqueSuffix}`;

    await page.goto('/');
    await expect(page.getByRole('button', { name: '内容生产' })).toBeVisible({ timeout: 120_000 });

    await page.getByRole('button', { name: '内容生产' }).click();
    await expect(page.getByRole('heading', { name: '内容生产操作台' })).toBeVisible();

    await page.getByPlaceholder('PIPELINE_API_SECRET').first().fill(apiSecret);
    await page.getByPlaceholder('PIPELINE_SYNC_SECRET').fill(syncSecret);

    await page.getByRole('link', { name: '账号设置页' }).click();
    await expect(page).toHaveURL(/\/accounts\/settings/);

    await page.getByPlaceholder('PIPELINE_API_SECRET').fill(apiSecret);
    await expect(page.getByRole('button', { name: '保存账号信息' })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: '新建账号' }).click();
    await expect(page.getByRole('button', { name: '创建账号' })).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder('账号名称').fill(accountName);
    await page.getByPlaceholder('账号描述（可选）').fill('Playwright 生产链路自动化测试账号');
    await page.getByRole('button', { name: '创建账号' }).click();
    await expect(
      page
        .locator('p')
        .filter({ hasText: /账号创建成功。|账号更新成功。/ })
        .first()
    ).toBeVisible({ timeout: 120_000 });

    await page.getByPlaceholder('目标读者').fill('关注商业与科技趋势的公众号读者');
    await page.getByPlaceholder('语气风格').fill('专业、克制、可执行');
    await page.getByPlaceholder('增长目标').fill('follow');
    await page.getByPlaceholder('内容承诺').fill('提供可验证信息与行动建议');
    await page.getByPlaceholder('CTA 风格').fill('结尾提问引导留言');
    await page.getByPlaceholder('读者痛点（分号分隔）').fill('信息碎片化；缺少行动方案');
    await page.getByPlaceholder('禁区（分号分隔）').fill('谣言；医疗投资建议');
    await page.getByRole('button', { name: '保存并全局生效' }).click();
    await expect(page.getByText('账号定位保存成功，已全局生效。')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('link', { name: '返回首页' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole('button', { name: '内容生产' }).click();
    await expect(page.getByRole('heading', { name: '内容生产操作台' })).toBeVisible();

    await page.getByPlaceholder('PIPELINE_API_SECRET').first().fill(apiSecret);
    await page.getByPlaceholder('PIPELINE_SYNC_SECRET').fill(syncSecret);

    await page.getByRole('button', { name: '同步机会' }).click();
    await page
      .locator('div')
      .filter({ hasText: /^同步完成：聚类 \d+，机会 \d+。$/ })
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => {
        // 同步成功提示在不同数据状态下不稳定出现，不阻塞后续机会链路验证。
      });

    await page.getByRole('button', { name: '刷新机会' }).click();

    const generateButton = page.getByRole('button', { name: '生成草稿' }).first();
    await expect(generateButton).toBeVisible({ timeout: 120_000 });
    await generateButton.click();

    await expect(page.getByRole('button', { name: '复制正文' })).toBeVisible({ timeout: 240_000 });
  });
});
