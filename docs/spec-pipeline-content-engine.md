# Spec: 趋势数据驱动的多账号内容生产引擎（第二阶段）

## 背景
当前项目第一阶段已完成：多平台热点搜索与存储（Trend / Content / Snapshot）。
第二阶段目标是将热点数据转化为多账号可持续内容产能，逐步实现自动发布与效果回流。

## 目标
1. 建立跨平台热点聚类与机会评分，形成账号级机会池。
2. 按账号赛道生成结构化草稿（模板 + LLM）。
3. 接入公众号发布任务流，支持重试与审计。
4. 保留风控分流（放行 / 复核 / 阻断）。
5. 形成可追踪数据闭环（机会 -> 草稿 -> 发布 -> 指标）。

## 非目标
1. 本阶段不接入多平台自动发布（仅微信发布通道）。
2. 不做复杂多模态素材自动生产。
3. 不做全量 AB 实验平台化。

## 范围与实现
### 数据模型
新增模型与枚举：
1. Account / Category / AccountCategory
2. TopicCluster / Opportunity
3. Draft / PublishJob / PerformanceMetric
4. OpportunityStatus / DraftStatus / PublishJobStatus / RiskLevel

### 核心服务
1. Opportunity Engine
- 窗口聚类（默认 2 小时）
- 跨平台共振 + 热度增长 + 时效 + 赛道匹配评分
- 机会 upsert 与状态维护

2. Draft Engine
- 模板构建公众号提示词
- LLM provider 抽象（OpenAI 兼容）
- 无 LLM Key 时自动降级模板生成

3. Risk Engine
- 关键词风控：`strict` / `balanced` / `growth`
- 输出风控等级与建议状态

4. Publish Engine
- 微信发布 provider（支持 dry-run）
- 发布任务状态机：queued/running/review/success/failed
- 支持失败重试与复核放行

5. Performance Query
- 指标分页查询与聚合汇总

### API
1. `POST /api/pipeline/opportunities/sync`
2. `GET /api/opportunities`
3. `POST /api/drafts/generate`
4. `POST /api/publish/wechat`
5. `POST /api/publish/jobs/:id/retry`
6. `GET /api/performance`

## 安全与鉴权
1. Pipeline 读写接口统一使用 `x-pipeline-secret`。
2. `PIPELINE_API_SECRET`：用于 opportunities/drafts/publish/performance。
3. `PIPELINE_SYNC_SECRET`：用于 opportunities/sync。
4. 未配置密钥时接口返回 500，防止误开放。

## 环境变量
1. `PIPELINE_API_SECRET`
2. `PIPELINE_SYNC_SECRET`
3. `OPPORTUNITY_MIN_SCORE`
4. `RISK_POLICY`
5. `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`
6. `WECHAT_PUBLISH_DRY_RUN`, `WECHAT_PUBLISH_ENDPOINT`, `WECHAT_PUBLISH_TOKEN`

## 数据库迁移
1. 迁移目录：`prisma/migrations/20260301010000_add_pipeline_content_engine/`
2. 命令：`npm run db:migrate`

## 验收标准
1. 新增 API 构建与类型检查通过。
2. 发布任务可创建、执行、重试。
3. 风控可将草稿分流到 READY/REVIEW/BLOCKED。
4. 机会同步不回滚终态（EXPIRED / DISCARDED）。
5. 可通过 metrics 接口查询发布后指标。

## 当前状态
已完成核心代码落地与回归验证：
1. `npm run lint` 通过
2. `npx tsc --noEmit` 通过
3. `npm test` 通过
4. `npm run build` 通过
5. `npx playwright test` 通过
