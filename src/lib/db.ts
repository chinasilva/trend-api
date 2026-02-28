import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PLATFORM_CONFIGS, type Platform, type TrendItem } from '@/types/trend';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveDatabaseUrl() {
  const rawConnectionString =
    process.env.TREND_API_POSTGRES_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;

  if (!rawConnectionString) {
    throw new Error(
      'Database URL is not configured. Set TREND_API_POSTGRES_URL, POSTGRES_URL, or DATABASE_URL.'
    );
  }

  const url = new URL(rawConnectionString);

  // pgbouncer + pg driver compatibility for SSL/prepared statements
  if (!url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'require');
  }
  if (!url.searchParams.has('uselibpqcompat')) {
    url.searchParams.set('uselibpqcompat', 'true');
  }
  if (!url.searchParams.has('preparedStatements')) {
    url.searchParams.set('preparedStatements', 'false');
  }

  return url.toString();
}

function createPrismaClient() {
  // 使用 pgbouncer 连接池 (端口 6543)
  const connectionString = resolveDatabaseUrl();
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

  const saveSingleTrend = async (trend: TrendItem) =>
    prisma.trend.upsert({
      where: {
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
    });

  const results = await Promise.allSettled(
    trends.map((trend) => saveSingleTrend(trend))
  );

  const hasSchemaMismatch = results.some(
    (result) =>
      result.status === 'rejected' &&
      result.reason instanceof Error &&
      result.reason.message.includes('no unique or exclusion constraint matching the ON CONFLICT specification')
  );

  if (hasSchemaMismatch) {
    throw new Error(
      'Trend table is missing unique constraint sourceId+title+url. Please run schema migration.'
    );
  }

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

// 将数据库数据格式化为 API 响应格式
export function formatTrendsForAPI(trends: Awaited<ReturnType<typeof getTrendsFromDB>>) {
  const result: Record<Platform, TrendItem[]> = {} as Record<Platform, TrendItem[]>;

  for (const trend of trends) {
    const platform = trend.source.platform as Platform;
    if (!result[platform]) {
      result[platform] = [];
    }

    result[platform].push({
      title: trend.title,
      hotValue: trend.hotValue ?? undefined,
      url: trend.url || undefined,
      description: trend.description ?? undefined,
      rank: trend.rank,
      thumbnail: trend.thumbnail ?? undefined,
      extra: trend.extra as Record<string, unknown> | undefined,
    });
  }

  return result;
}

// 保存快照（核心逻辑）
export async function saveSnapshot(platform: Platform, trends: TrendItem[]) {
  // 确保数据源存在
  await ensureTrendSources();

  // 获取数据源ID
  const source = await prisma.trendSource.findUnique({
    where: { platform },
  });

  if (!source) {
    throw new Error(`TrendSource not found for platform: ${platform}`);
  }

  const now = new Date();

  // 为避免大事务超时，按条目执行并统计部分成功
  const contentResults = await Promise.allSettled(
    trends.map((trend) =>
      prisma.content.upsert({
        where: {
          sourceId_title_url: {
            sourceId: source.id,
            title: trend.title,
            url: trend.url || '',
          },
        },
        update: {
          description: trend.description || null,
          thumbnail: trend.thumbnail || null,
          extra: trend.extra as Prisma.InputJsonValue | undefined,
          updatedAt: now,
        },
        create: {
          sourceId: source.id,
          title: trend.title,
          url: trend.url || '',
          description: trend.description || null,
          thumbnail: trend.thumbnail || null,
          extra: trend.extra as Prisma.InputJsonValue | undefined,
        },
      })
    )
  );

  const snapshotCreateTasks: Array<Promise<unknown>> = [];
  let contentFailCount = 0;

  contentResults.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      contentFailCount += 1;
      return;
    }

    const trend = trends[index];
    snapshotCreateTasks.push(
      prisma.snapshot.create({
        data: {
          contentId: result.value.id,
          rank: trend.rank,
          hotValue: trend.hotValue || null,
          createdAt: now,
        },
      })
    );
  });

  const snapshotResults = await Promise.allSettled(snapshotCreateTasks);
  const snapshotSuccessCount = snapshotResults.filter((r) => r.status === 'fulfilled').length;
  const snapshotFailCount = snapshotResults.length - snapshotSuccessCount;

  return {
    successCount: snapshotSuccessCount,
    failCount: contentFailCount + snapshotFailCount,
  };
}

// 按日期查询快照
export async function getTrendsByDate(platform: Platform, date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // 查找最接近指定日期的快照
  const snapshots = await prisma.snapshot.findMany({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
      content: {
        source: { platform },
      },
    },
    include: {
      content: true,
    },
    orderBy: { rank: 'asc' },
  });

  return snapshots.map((s) => ({
    title: s.content.title,
    hotValue: s.hotValue ?? undefined,
    url: s.content.url || undefined,
    description: s.content.description ?? undefined,
    rank: s.rank,
    thumbnail: s.content.thumbnail ?? undefined,
    extra: s.content.extra as Record<string, unknown> | undefined,
  }));
}

// 获取最新的快照
export async function getLatestSnapshot(platform?: Platform) {
  const where = platform ? { content: { source: { platform } } } : {};

  // 找到最新的快照时间
  const latestSnapshot = await prisma.snapshot.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      content: {
        include: {
          source: true,
        },
      },
    },
  });

  if (!latestSnapshot) {
    return { trends: {}, snapshotAt: null };
  }

  const snapshotAt = latestSnapshot.createdAt;

  // 获取同一时间点的所有快照
  const tolerance = 60 * 1000; // 1分钟容差
  const snapshots = await prisma.snapshot.findMany({
    where: {
      createdAt: {
        gte: new Date(snapshotAt.getTime() - tolerance),
        lte: new Date(snapshotAt.getTime() + tolerance),
      },
      ...where,
    },
    include: {
      content: {
        include: {
          source: true,
        },
      },
    },
    orderBy: [{ content: { source: { platform: 'asc' } } }, { rank: 'asc' }],
  });

  // 按平台分组
  const result: Record<Platform, TrendItem[]> = {} as Record<Platform, TrendItem[]>;

  for (const s of snapshots) {
    const p = s.content.source.platform as Platform;
    if (!result[p]) {
      result[p] = [];
    }

    result[p].push({
      title: s.content.title,
      hotValue: s.hotValue ?? undefined,
      url: s.content.url || undefined,
      description: s.content.description ?? undefined,
      rank: s.rank,
      thumbnail: s.content.thumbnail ?? undefined,
      extra: s.content.extra as Record<string, unknown> | undefined,
    });
  }

  return { trends: result, snapshotAt: snapshotAt.toISOString() };
}

// 按日期查询所有平台快照
export async function getAllTrendsByDate(date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // 找到最接近指定日期的快照时间
  const nearestSnapshot = await prisma.snapshot.findFirst({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!nearestSnapshot) {
    return { trends: {}, snapshotAt: null };
  }

  const snapshotAt = nearestSnapshot.createdAt;

  // 获取同一时间点的所有快照（2分钟容差）
  const tolerance = 60 * 1000;
  const snapshots = await prisma.snapshot.findMany({
    where: {
      createdAt: {
        gte: new Date(snapshotAt.getTime() - tolerance),
        lte: new Date(snapshotAt.getTime() + tolerance),
      },
    },
    include: {
      content: {
        include: {
          source: true,
        },
      },
    },
    orderBy: [{ content: { source: { platform: 'asc' } } }, { rank: 'asc' }],
  });

  // 按平台分组
  const result: Record<Platform, TrendItem[]> = {} as Record<Platform, TrendItem[]>;

  for (const s of snapshots) {
    const p = s.content.source.platform as Platform;
    if (!result[p]) {
      result[p] = [];
    }

    result[p].push({
      title: s.content.title,
      hotValue: s.hotValue ?? undefined,
      url: s.content.url || undefined,
      description: s.content.description ?? undefined,
      rank: s.rank,
      thumbnail: s.content.thumbnail ?? undefined,
      extra: s.content.extra as Record<string, unknown> | undefined,
    });
  }

  return { trends: result, snapshotAt: snapshotAt.toISOString() };
}
