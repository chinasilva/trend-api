# Trend API 项目文档

## 项目概述

独立的热榜数据爬虫服务，聚合国内主流平台的热门榜单数据。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript
- **数据库**: PostgreSQL + Prisma
- **缓存**: 内存缓存

## 数据源

| 平台 | 数据来源 | 说明 |
|-----|---------|------|
| 抖音 | TianAPI | 稳定可靠 |
| 微博 | TianAPI | 稳定可靠 |
| 知乎 | TianAPI | 稳定可靠 |
| 百度 | TianAPI | 稳定可靠 |
| 微信/公众号 | TianAPI (`wxhottopic` + `wxnew`) | 热点优先，文章精选兜底 |
| B站 | TianAPI | 稳定可靠 |
| 小红书 | ITAPI | 需配置 `ITAPI_KEY`，有免费额度与低价档 |
| 视频号 | ITAPI(微信热榜替代) + DailyHotApi + TianAPI(`wxhottopic`/`wxnew`) | 优先 ITAPI，失败后自动降级 |

## 项目结构

```
trend-api/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── trends/        # 热榜数据接口
│   │   │   └── cron/          # 定时抓取任务
│   │   ├── layout.ts
│   │   └── page.ts
│   ├── lib/
│   │   ├── scraper/           # 爬虫实现
│   │   │   ├── tianapi/       # TianAPI 爬虫
│   │   │   └── dailyhot/      # DailyHotApi 爬虫
│   │   ├── db.ts              # Prisma 数据库
│   │   └── cache.ts           # 缓存工具
│   └── types/
│       └── trend.ts
├── prisma/
│   └── schema.prisma          # 数据库模型
├── docs/                      # 项目文档
├── .env                       # 环境变量
└── package.json
```

## 环境变量

```
# TianAPI
TIANAPI_KEY=your_api_key

# ITAPI (小红书/视频号替代热榜)
ITAPI_KEY=your_api_key
# ITAPI_BASE_URL=https://api.itapi.cn

# Database
DATABASE_URL=postgresql://...

# Vercel
VERCEL_URL=...
```

## API 接口

- `GET /api/trends` - 获取所有平台热榜
- `GET /api/trends/[platform]` - 获取特定平台热榜

## 开发命令

```bash
npm run dev        # 开发服务器
npm run build      # 构建生产版本
npm run start      # 启动生产服务器
npx prisma db push # 同步数据库
```

## 定时任务

使用 GitHub Actions 每 30 分钟自动爬取最新数据：

- 工作流文件: `.github/workflows/fetch-trends.yml`
- 频率: 每 30 分钟执行一次
- 也支持手动触发: 在 GitHub Actions 页面点击 "Run workflow"

## 部署

1. 推送代码到 GitHub（已自动推送）
2. 在 Vercel 导入项目
3. 配置环境变量:
   - `TIANAPI_KEY`: TianAPI 密钥
   - `DATABASE_URL`: PostgreSQL 连接字符串
4. 部署完成后，GitHub Actions 会自动每 30 分钟触发数据爬取
