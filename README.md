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
6. 发布任务：`POST /api/publish/wechat`
7. 发布重试：`POST /api/publish/jobs/:id/retry`

## UI 使用方式

首页提供双模式切换：
1. `热榜浏览`：查看实时热点与历史快照
2. `内容生产`：进行同步机会、生成草稿、提交发布任务

内容生产模式操作顺序：
1. 输入 `PIPELINE_API_SECRET` 与 `PIPELINE_SYNC_SECRET`
2. 点击“同步机会”
3. 在机会列表点击“生成草稿”
4. 在草稿区域点击“提交发布任务”
5. 在发布任务区域查看状态并按需重试

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
2. `RISK_POLICY`
3. `OPPORTUNITY_MIN_SCORE`
4. `WECHAT_PUBLISH_MODE`（默认 `draftbox`）
5. `WECHAT_PUBLISH_DRY_RUN`
6. `WECHAT_PUBLISH_ENDPOINT`
7. `WECHAT_PUBLISH_TOKEN`

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

详细阶段规格见：`docs/spec-pipeline-content-engine.md`
