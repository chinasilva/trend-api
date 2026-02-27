import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PLATFORM_CONFIGS, type Platform, type TrendItem } from '@/types/trend';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // 使用 pgbouncer 连接池 (端口 6543)
  const connectionString = process.env.TREND_API_POSTGRES_URL || process.env.POSTGRES_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// 确保 TrendSource 存在
export async function ensureTrendSources() {
  const platforms = Object.keys(PLATFORM_CONFIGS) as Platform[];

  for (const platform of platforms) {
    const config = PLATFORM_CONFIGS[platform];
    await prisma.trendSource.upsert({
      where: { platform },
      update: {
        name: config.name,
        icon: config.icon,
      },
      create: {
        platform,
        name: config.name,
        icon: config.icon,
      },
    });
  }
}

// 保存热榜数据（带去重逻辑）
export async function saveTrends(platform: Platform, trends: TrendItem[]) {
  // 确保数据源存在
  await ensureTrendSources();

  // 获取数据源ID
  const source = await prisma.trendSource.findUnique({
    where: { platform },
  });

  if (!source) {
    throw new Error(`TrendSource not found for platform: ${platform}`);
  }

  // 使用 upsert 实现去重：同一来源下，标题+URL 相同则更新，否则创建
  const results = await Promise.allSettled(
    trends.map((trend) =>
      prisma.trend.upsert({
        where: {
          // 去重键：sourceId + title + url (url 为空时使用空字符串)
          sourceId_title_url: {
            sourceId: source.id,
            title: trend.title,
            url: trend.url || '',
          },
        },
        update: {
          hotValue: trend.hotValue || null,
          rank: trend.rank,
          description: trend.description || null,
          thumbnail: trend.thumbnail || null,
          extra: trend.extra as Prisma.InputJsonValue | undefined,
          updatedAt: new Date(),
        },
        create: {
          sourceId: source.id,
          title: trend.title,
          hotValue: trend.hotValue || null,
          url: trend.url || '',
          description: trend.description || null,
          rank: trend.rank,
          thumbnail: trend.thumbnail || null,
          extra: trend.extra as Prisma.InputJsonValue | undefined,
        },
      })
    )
  );

  // 统计成功和失败数量
  const successCount = results.filter((r) => r.status === 'fulfilled').length;
  const failCount = results.filter((r) => r.status === 'rejected').length;

  return { successCount, failCount };
}

// 获取数据库中的热榜数据
export async function getTrendsFromDB(platform?: Platform) {
  const where = platform ? { source: { platform } } : {};

  const trends = await prisma.trend.findMany({
    where,
    include: {
      source: true,
    },
    orderBy: [{ source: { platform: 'asc' } }, { rank: 'asc' }],
  });

  return trends;
}
