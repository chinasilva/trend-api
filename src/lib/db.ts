import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PLATFORM_CONFIGS, type Platform, type TrendItem } from '@/types/trend';

const SNAPSHOT_TOLERANCE_MS = 60 * 1000; // 1 minute

export interface TimelineItem {
  snapshotAt: string;
  count: number;
  hasData: boolean;
  source: 'snapshot';
}

export interface TimelinePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

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
  const snapshots = await prisma.snapshot.findMany({
    where: {
      createdAt: {
        gte: new Date(snapshotAt.getTime() - SNAPSHOT_TOLERANCE_MS),
        lte: new Date(snapshotAt.getTime() + SNAPSHOT_TOLERANCE_MS),
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

// 按快照时间点查询（用于时间线选择）
export async function getTrendsBySnapshotAt(snapshotTime: Date, platform?: Platform) {
  const where = platform ? { content: { source: { platform } } } : {};
  const minuteStart = new Date(snapshotTime);
  minuteStart.setUTCSeconds(0, 0);
  const minuteEnd = new Date(minuteStart.getTime() + 60 * 1000);

  let center = minuteStart;
  let createdAtRange: { gte: Date; lt: Date } | { gte: Date; lte: Date } = {
    gte: minuteStart,
    lt: minuteEnd,
  };

  // 优先按分钟桶精确匹配；若用户传入非时间线时间点，再容错回退到邻近快照。
  const exactHit = await prisma.snapshot.findFirst({
    where: {
      createdAt: createdAtRange,
      ...where,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!exactHit) {
    const nearestSnapshot = await prisma.snapshot.findFirst({
      where: {
        createdAt: {
          gte: new Date(snapshotTime.getTime() - SNAPSHOT_TOLERANCE_MS),
          lte: new Date(snapshotTime.getTime() + SNAPSHOT_TOLERANCE_MS),
        },
        ...where,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!nearestSnapshot) {
      return { trends: {}, snapshotAt: null };
    }

    center = new Date(nearestSnapshot.createdAt);
    center.setUTCSeconds(0, 0);
    createdAtRange = {
      gte: center,
      lt: new Date(center.getTime() + 60 * 1000),
    };
  }

  const snapshots = await prisma.snapshot.findMany({
    where: {
      createdAt: createdAtRange,
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

  return { trends: result, snapshotAt: center.toISOString() };
}

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return null;
}

// 获取快照时间线（按分钟聚合分页）
export async function getSnapshotTimeline(page = 1, pageSize = 20, platform?: Platform) {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const offset = (safePage - 1) * safePageSize;
  const platformFilter = platform ? Prisma.sql`AND ts.platform = ${platform}` : Prisma.empty;

  const timelineRows = await prisma.$queryRaw<Array<{ snapshot_at: Date | string; count: number }>>(
    Prisma.sql`
      SELECT date_trunc('minute', s."createdAt") AS snapshot_at, COUNT(*)::int AS count
      FROM "Snapshot" s
      JOIN "Content" c ON c.id = s."contentId"
      JOIN "TrendSource" ts ON ts.id = c."sourceId"
      WHERE 1=1
      ${platformFilter}
      GROUP BY 1
      ORDER BY 1 DESC
      OFFSET ${offset}
      LIMIT ${safePageSize}
    `
  );

  const totalRows = await prisma.$queryRaw<Array<{ total: number }>>(
    Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT date_trunc('minute', s."createdAt")
        FROM "Snapshot" s
        JOIN "Content" c ON c.id = s."contentId"
        JOIN "TrendSource" ts ON ts.id = c."sourceId"
        WHERE 1=1
        ${platformFilter}
        GROUP BY 1
      ) t
    `
  );

  const total = Number(totalRows[0]?.total ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize);

  const items: TimelineItem[] = timelineRows
    .map((row) => {
      const date = toDate(row.snapshot_at);
      if (!date || Number.isNaN(date.getTime())) return null;
      return {
        snapshotAt: date.toISOString(),
        count: Number(row.count),
        hasData: Number(row.count) > 0,
        source: 'snapshot' as const,
      };
    })
    .filter((item): item is TimelineItem => item !== null);

  const pagination: TimelinePagination = {
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };

  return { items, pagination };
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

  // 获取同一时间点的所有快照
  const snapshots = await prisma.snapshot.findMany({
    where: {
      createdAt: {
        gte: new Date(snapshotAt.getTime() - SNAPSHOT_TOLERANCE_MS),
        lte: new Date(snapshotAt.getTime() + SNAPSHOT_TOLERANCE_MS),
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
