---
name: persona-content-dispatch
description: 账号定位驱动的全链路内容分发技能。用于执行热点同步、分层加权机会构建、自动选题、深搜、成文、定时触发与故障降级。
---

# Persona Content Dispatch

## 何时使用

当用户要求以下任意任务时使用本技能：
1. 根据账号定位自动选题并生成文章。
2. 执行或排查定时自动生成链路。
3. 检查“来源、归并理由、选题理由”追溯信息。
4. 修复自动选题/深搜/成文任一环节故障。

## 单入口流程

按顺序执行，不跳步：
1. 运行机会同步：`POST /api/pipeline/opportunities/sync`，优先使用 `windows`。
2. 自动生成：`POST /api/drafts/auto-generate`。
3. 追溯报告：`GET /api/drafts/:id/synthesis-report`。
4. 定时执行：`POST /api/pipeline/auto-generate/run`。

## 默认策略

1. 时间窗权重：24h=0.65，3d=0.25，7d=0.10。
2. 账号约束：硬过滤 + 软加权。
3. 深搜故障：先重试，再降级到库内证据。
4. 风控命中：降级改写后继续。
5. 证据展示：仅后台可见，不外显正文。

## 快速排障

1. 查看自动任务状态：`AutoGenerateJob`。
2. 查看选题追溯：`TopicSynthesisReport`。
3. 查看深搜降级：`TopicResearch.fallbackUsed`。
4. 查看草稿注入：`Draft.metadata.topicSynthesis/deepResearch`。

## 资源

1. API 合约：`references/api-contracts.md`
2. 评分策略：`references/scoring-policy.md`
3. 执行脚本：`scripts/run_auto_generate.sh`
4. 留痕校验：`scripts/validate_trace.sh`
