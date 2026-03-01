# Trend API

基于 Next.js App Router 的热点聚合与内容生产服务。  
项目分两阶段：
1. 第一阶段：多平台热点抓取与快照存储（已完成）
2. 第二阶段：基于实时数据生成内容并进入发布流程（进行中，核心链路已可用）

## 核心链路

1. 热点快照：`/api/trends`、`/api/trends/timeline`
2. 机会同步：`POST /api/pipeline/opportunities/sync`
3. 机会查询：`GET /api/opportunities`
4. 草稿生成：`POST /api/drafts/generate`
5. 草稿详情：`GET /api/drafts/:id`
6. 草稿重生：`POST /api/drafts/:id/regenerate`
7. 配图占位规划：`POST /api/drafts/:id/assets/plan`
8. 账号定位读取/更新/回滚：
   - `GET /api/accounts/:id/profile`
   - `PUT /api/accounts/:id/profile`
   - `POST /api/accounts/:id/profile/rollback`
9. 发布任务：`POST /api/publish/wechat`
10. 发布重试：`POST /api/publish/jobs/:id/retry`

## 热点平台查询

支持的热点平台包含：
`douyin`、`weibo`、`zhihu`、`baidu`、`networkhot`、`weixin`、`weixinarticle`、`bilibili`、`xiaohongshu`、`weixinvideo`。

示例：
```bash
curl http://localhost:3000/api/trends/networkhot
curl http://localhost:3000/api/trends/weixinarticle
```

## UI 使用方式

首页提供双模式切换：
1. `热榜浏览`：查看实时热点与历史快照
2. `内容生产`：进行同步机会、生成草稿、提交发布任务

内容生产模式操作顺序：
1. 输入 `PIPELINE_API_SECRET` 与 `PIPELINE_SYNC_SECRET`
2. 点击“同步机会”
3. 在“账号定位”卡片确认并保存账号策略（全局生效）
4. 在机会列表点击“生成草稿”
5. 对当前草稿可执行“重新生成”获取全新版本
6. 人工满意后点击“生成配图占位”
7. 在草稿区域点击“提交发布任务”
8. 在发布任务区域查看状态并按需重试

## 微信个人号限制说明

当前流程支持完整执行“提交发布任务”，但微信公众号个人号未认证时通常无法直接自动发布。  
系统默认按草稿箱投递语义执行（`deliveryStage = draftbox`），即：
1. 任务成功
2. 内容进入公众号草稿箱
3. 仍需在公众号后台人工发布

如需自动发布，需要目标账号与发布通道具备对应能力，并将 `WECHAT_PUBLISH_MODE` 配置为 `published`。

## 环境变量

最低要求：
1. `DATABASE_URL`
2. `PIPELINE_API_SECRET`
3. `PIPELINE_SYNC_SECRET`

内容生产相关（按需）：
1. `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`
2. `LLM_API_STYLE`（`chat-completions` 或 `responses`）
3. `LLM_AUTH_MODE`（`bearer` 或 `api-key`）
2. `LLM_STRICT_MODE`（建议生产开启）
4. `RISK_POLICY`
5. `OPPORTUNITY_MIN_SCORE`
6. `WECHAT_PUBLISH_MODE`（默认 `draftbox`）
7. `WECHAT_PUBLISH_DRY_RUN`
8. `WECHAT_PUBLISH_ENDPOINT`
9. `WECHAT_PUBLISH_TOKEN`

## 本地运行

```bash
npm install
npm run db:migrate
npm run dev
```

## 校验命令

```bash
npm run lint
npx tsc --noEmit
npm test
```

## 参考文档

1. 新会话快速入口：`docs/SESSION-BOOTSTRAP.md`
2. 当前阶段规格：`docs/spec-pipeline-content-engine.md`
3. 工作流 Spec 模板：`docs/workflow/spec-template.md`
4. 周复盘模板：`docs/weekly-workflow-review.md`
