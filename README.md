# Trend API

基于 Next.js App Router 的热点聚合与内容生产服务。  
项目分两阶段：
1. 第一阶段：多平台热点抓取与快照存储（已完成）
2. 第二阶段：基于实时数据生成内容并进入发布流程（进行中，核心链路已可用）

## 核心链路

1. 热点快照：`/api/trends`、`/api/trends/timeline`
2. 实时候选计算：`POST /api/pipeline/opportunities/realtime/compute`
3. 基于候选生成：`POST /api/pipeline/opportunities/realtime/generate`
4. 机会预计算（定时任务）：`POST /api/pipeline/opportunities/precompute`
5. 机会同步（已废弃）：`POST /api/pipeline/opportunities/sync`
6. 机会查询：`GET /api/opportunities`
7. 草稿生成：`POST /api/drafts/generate`
4.1 自动选题并生成：`POST /api/drafts/auto-generate`
5. 草稿详情：`GET /api/drafts/:id`
5.1 选题追溯报告：`GET /api/drafts/:id/synthesis-report`
6. 草稿重生：`POST /api/drafts/:id/regenerate`
7. 配图占位规划：`POST /api/drafts/:id/assets/plan`
8. 账号定位读取/更新/回滚：
   - `GET /api/accounts`
   - `POST /api/accounts`
   - `PATCH /api/accounts/:id`
   - `GET /api/accounts/:id/profile`
   - `PUT /api/accounts/:id/profile`
   - `POST /api/accounts/:id/profile/rollback`
   - `GET /api/accounts/:id/automation`
   - `PUT /api/accounts/:id/automation`
12. 定时自动生成执行：`POST /api/pipeline/auto-generate/run`
10. 发布任务：`POST /api/publish/wechat`
11. 发布重试：`POST /api/publish/jobs/:id/retry`

## 热点平台查询

支持的热点平台包含：
`douyin`、`weibo`、`zhihu`、`baidu`、`networkhot`、`weixin`、`weixinarticle`、`bilibili`、`xiaohongshu`、`weixinvideo`、`signal`。

示例：
```bash
curl http://localhost:3000/api/trends/networkhot
curl http://localhost:3000/api/trends/weixinarticle
curl http://localhost:3000/api/trends/signal
```

## UI 使用方式

首页提供双模式切换：
1. `热榜浏览`：查看实时热点与历史快照
2. `内容生产`：进行实时候选计算、生成草稿、提交发布任务

内容生产模式操作顺序：
1. 先使用已配置的控制台账号密码登录（不支持注册）
2. 打开“账号定位设置”页创建账号（首版支持新增、编辑、激活/停用）
3. 在“账号定位”卡片确认并保存账号策略（全局生效）
4. 返回首页点击“获取候选”（复用 30 分钟会话）
5. 需要拉最新数据时点击“刷新候选”
6. 点击“候选生成草稿”
7. 对当前草稿可执行“重新生成”获取全新版本
8. 人工满意后点击“生成配图占位”
9. 在草稿区域点击“提交发布任务”
10. 在发布任务区域查看状态并按需重试

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
2. `PIPELINE_ADMIN_USERNAME`
3. `PIPELINE_ADMIN_PASSWORD`

服务端调用（可选保留）：
1. `PIPELINE_API_SECRET`
2. `PIPELINE_SYNC_SECRET`
3. `PIPELINE_AUTH_SECRET`
4. `SIGNAL_API_KEY`（接入 Signal 高价值来源时必填）

内容生产相关（按需）：
1. `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`
2. `LLM_API_STYLE`（`chat-completions` 或 `responses`）
3. `LLM_AUTH_MODE`（`bearer` 或 `api-key`）
4. `LLM_STRICT_MODE`（建议生产开启）
5. `REALTIME_OPPORTUNITY_SESSION_TTL_MINUTES`（默认 30，范围 5-180）
6. `RISK_POLICY`
7. `OPPORTUNITY_MIN_SCORE`
8. `SNAPSHOT_DEDUP_WINDOW_MINUTES`（默认 120，短期重复快照去重窗口）
9. `OPPORTUNITY_PRECOMPUTE_LOOKBACK_HOURS`（默认 168）
10. `OPPORTUNITY_PRECOMPUTE_BUCKET_MINUTES`（默认 30）
11. `OPPORTUNITY_PRECOMPUTE_TOP_N`（默认 50，预留参数）
12. `AUTO_GENERATE_TRIGGER_WINDOW_MINUTES`（默认 9，需与工作流调度频率匹配）
13. `WECHAT_PUBLISH_MODE`（默认 `draftbox`）
14. `WECHAT_PUBLISH_DRY_RUN`
15. `WECHAT_PUBLISH_ENDPOINT`
16. `WECHAT_PUBLISH_TOKEN`

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
npm run workflow:check
npm run gate:db
npm run diag:db-target
npm test
# 需要先设置 PIPELINE_SECRET 和 ACCOUNT_ID
tools/pipeline-smoke.sh <account_id>
```

`npm run gate:db` 约定：
- 返回码 `0`：通过
- 返回码 `42`：`GATE_DB_UNREACHABLE`（数据库不可达，需按“高风险”处理）

## 参考文档

1. 新会话快速入口：`docs/SESSION-BOOTSTRAP.md`
2. 当前阶段规格：`docs/spec-pipeline-content-engine.md`
3. 工作流 Spec 模板：`docs/workflow/spec-template.md`
4. 周复盘模板：`docs/weekly-workflow-review.md`
