# Spec: Supabase Egress 超限排查与减流量方案

## 目标 (Goals)
- 明确当前 Supabase Free Plan 超限的具体指标、额度、超出量，以及对应项目占比。
- 基于本地配置和代码路径，判断当前超限最可能来自哪些接口和查询模式。
- 形成可执行的减流量方案，使后续实现可以用原子提交推进并验证效果。

## 非目标 (Non-goals)
- 本轮不直接升级 Supabase 付费套餐。
- 不迁移数据库供应商，也不改用其他托管 Postgres。
- 不重构整套趋势抓取或内容生产链路。
- 不在本轮处理与 Egress 无关的 UI 改动或前端样式问题。

## 约束 (Constraints)
- 当前组织处于 Supabase `Free Plan`，超出包含额度后会出现限制，且当前不是按 overage 计费。
- 当前计费周期为 `2026-02-27` 至 `2026-03-27`。
- 本地项目绑定的 Supabase project ref 为 `teykqpbtjrdhinnfxnsc`，数据库目标为 `aws-1-us-east-1.pooler.supabase.com` 上的 `trendapi-db`。
- 代码当前通过 Prisma + `pg` 连接 Supabase Postgres，不是以 `@supabase/supabase-js` 为主的接入模式。
- 当前仓库工作区非干净，已有前端相关未提交改动，后续实现应避免混入无关文件。

## 范围 (Scope)
### In Scope
- 固化本次 Usage 排查结论：
  - 组织维度超限项仅有 `Egress`。
  - `Egress` 使用量为 `6.17 GB / 5 GB`，超出 `1.17 GB`。
  - 项目 `trendapi-db` 占用 `5.71 GB`，是本次超限主来源。
  - `Database Size` 为 `147.88 MB / 0.5 GB`，未超限。
  - `Storage Size`、`MAU`、`Realtime`、`Edge Functions` 均未使用或未超限。
  - `Cached Egress` 为 `0 GB`，说明当前流量主要是未缓存的真实出站。
- 结合代码分析最可能的 Egress 来源：
  - `GET /api/trends` 在未指定平台时返回所有平台整批数据。
  - 趋势与快照查询会连带返回 `description`、`thumbnail`、`extra` 等字段。
  - 快照读取逻辑存在“快照 + Trend 表兜底补齐”的双读模式。
  - 历史/时间线相关读取可能在前端高频交互下重复触发数据库出站。
- 输出后续实现的验收标准、风险、回滚和实施清单。

### Out of Scope
- 变更 Supabase 组织或项目套餐。
- 修改第三方热点源抓取配额和上游 API 策略。
- 处理另一个项目 `shg-gateway-supabase-20260307011624` 的单独优化。

## 证据 (Evidence)
- Supabase Usage 面板显示：
  - `Egress`: `6.17 GB / 5 GB (123%)`
  - `Overage in period`: `1.17 GB`
  - `trendapi-db`: `5.71 GB`
  - `shg-gateway-supabase-20260307011624`: `0.46 GB`
  - `Cached Egress`: `0.00 GB`
- 本地环境与代码确认：
  - `.env.local` 中 `TREND_API_SUPABASE_URL` 指向 `https://teykqpbtjrdhinnfxnsc.supabase.co`
  - 运行数据库连接指向 `aws-1-us-east-1.pooler.supabase.com:6543/trendapi-db`
  - 项目内未发现 `@supabase/supabase-js` 业务使用；主要数据库访问集中在 Prisma 查询和 API 返回。

## 验收标准 (Acceptance)
- 规格明确指出当前唯一超限指标是 `Egress`，并写清准确数值、周期和项目贡献。
- 规格明确指出本项目当前不是 Auth/Storage/Realtime/Edge Functions 驱动的用量问题，而是数据库/API 出站问题。
- 给出 3-7 条后续实现清单，每条都能直接转化为一次原子改动或验证动作。
- 后续实现完成后，至少能通过代码与监控证明以下任一结果：
  - 单次 `GET /api/trends` 响应体缩小；
  - 数据库查询字段缩减；
  - 趋势接口命中缓存比例提升；
  - Supabase Usage 下个周期或后续观察窗口内 Egress 增速下降。

## 风险与回滚 (Risk / Rollback)
- 风险：若直接裁掉 `extra` 等字段，可能影响现有前端展示或内容生产流程依赖。
- 风险：若只做应用层缓存而不区分平台/时间线场景，可能返回过旧数据。
- 风险：若将多接口收缩为同一轻量响应，可能破坏现有调用方的兼容性。
- 回滚：所有减流量改动应拆成原子提交，优先采用“新增轻量模式/参数、保留旧行为”的方式，出现兼容性问题可按提交粒度回退。

## 实施清单 (3-7 条)
- [ ] 为 `GET /api/trends` 增加轻量响应模式，默认不返回 `extra` 等高体积字段，必要时通过显式参数开启完整模式。
- [ ] 将快照与趋势查询从 `include` 改为更窄的 `select`，仅返回页面实际使用字段，避免数据库无效出站。
- [ ] 为首页默认加载路径增加平台粒度或分页粒度限制，避免一次性读取全部平台全部字段。
- [ ] 审查并减少 `snapshot + database` 双读兜底触发条件，避免单次请求拉取两套数据。
- [ ] 给趋势相关接口补充响应体大小与命中路径日志，至少区分 `snapshot`、`database`、`snapshot+database`、`live-fallback`。
- [ ] 在实现完成后重新核对 Supabase Usage，并用固定观察窗口比较 `trendapi-db` 的 Egress 增速是否下降。
