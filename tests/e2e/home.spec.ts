import { expect, test } from '@playwright/test';

test('home page can be opened', async ({ page }) => {
  await page.goto('/');

  const readyState = await Promise.race([
    page.getByRole('button', { name: '全部平台' }).waitFor({ state: 'visible', timeout: 15000 }).then(() => 'tabs').catch(() => null),
    page.getByRole('button', { name: '重新尝试' }).waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error').catch(() => null),
  ]);

  expect(readyState).not.toBeNull();
});

test('content pipeline flow can generate and submit publish job', async ({ page }) => {
  const now = '2026-03-01T00:00:00.000Z';
  let published = false;

  await page.route(/\/api\/trends\/timeline(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          items: [
            {
              snapshotAt: now,
              count: 8,
              hasData: true,
              source: 'snapshot',
            },
          ],
          pagination: {
            page: 1,
            pageSize: 12,
            total: 1,
            totalPages: 1,
            hasPrev: false,
            hasNext: false,
          },
        },
      }),
    });
  });

  await page.route(/\/api\/trends(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          douyin: [],
          weibo: [],
          zhihu: [],
          baidu: [],
          weixin: [],
          bilibili: [],
          xiaohongshu: [],
          weixinvideo: [],
        },
        snapshotAt: now,
        updatedAt: now,
        source: 'snapshot',
        hasData: true,
      }),
    });
  });

  await page.route(/\/api\/opportunities(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          items: [
            {
              id: 'opp-1',
              accountId: 'acc-1',
              topicClusterId: 'cluster-1',
              score: 86,
              reasons: ['resonance:3'],
              status: 'NEW',
              expiresAt: now,
              createdAt: now,
              updatedAt: now,
              account: {
                id: 'acc-1',
                name: '测试账号',
                platform: 'wechat',
              },
              topicCluster: {
                id: 'cluster-1',
                title: '话题测试：跨平台趋势',
                resonanceCount: 3,
                growthScore: 72.5,
                latestSnapshotAt: now,
              },
            },
          ],
          pagination: {
            page: 1,
            pageSize: 12,
            total: 1,
            totalPages: 1,
            hasPrev: false,
            hasNext: false,
          },
        },
      }),
    });
  });

  await page.route(/\/api\/drafts\/generate$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          draftId: 'draft-1',
          title: '测试草稿标题',
          status: 'READY',
          riskLevel: 'LOW',
          riskScore: 18,
          model: 'mock-llm',
        },
      }),
    });
  });

  await page.route(/\/api\/publish\/wechat$/, async (route) => {
    published = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: 'job-1',
          status: 'SUCCESS',
          deliveryStage: 'draftbox',
          attempt: 1,
          externalId: 'wx-draft-1',
        },
      }),
    });
  });

  await page.route(/\/api\/drafts\/draft-1$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: 'draft-1',
          title: '测试草稿标题',
          content: '这是一段测试正文。',
          outline: ['开头', '主体', '结尾'],
          templateVersion: 'v1',
          model: 'mock-llm',
          status: published ? 'SUBMITTED' : 'READY',
          riskLevel: 'LOW',
          riskScore: 18,
          createdAt: now,
          updatedAt: now,
          account: {
            id: 'acc-1',
            name: '测试账号',
            platform: 'wechat',
          },
          opportunity: {
            id: 'opp-1',
            score: 86,
            status: 'SELECTED',
            topicCluster: {
              id: 'cluster-1',
              title: '话题测试：跨平台趋势',
              resonanceCount: 3,
              growthScore: 72.5,
              latestSnapshotAt: now,
            },
          },
          publishJobs: published
            ? [
                {
                  id: 'job-1',
                  provider: 'wechat',
                  status: 'SUCCESS',
                  deliveryStage: 'draftbox',
                  attempt: 1,
                  externalId: 'wx-draft-1',
                  errorMessage: null,
                  queuedAt: now,
                  startedAt: now,
                  finishedAt: now,
                  createdAt: now,
                  updatedAt: now,
                },
              ]
            : [],
        },
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '内容生产' }).click();
  await page.getByPlaceholder('PIPELINE_API_SECRET').fill('api-secret');
  await page.getByPlaceholder('PIPELINE_SYNC_SECRET').fill('sync-secret');

  await page.getByRole('button', { name: '刷新机会' }).click();
  await expect(page.getByText('话题测试：跨平台趋势')).toBeVisible();

  await page.getByRole('button', { name: '生成草稿' }).click();
  await expect(page.getByRole('heading', { name: '测试草稿标题' })).toBeVisible();
  await expect(page.getByText('可提交发布任务。')).toBeVisible();

  await page.getByRole('button', { name: '提交发布任务' }).click();
  await expect(page.getByText('发布任务成功，内容已提交到公众号草稿箱。')).toBeVisible();
  await expect(page.getByText('任务ID: job-1')).toBeVisible();
});
