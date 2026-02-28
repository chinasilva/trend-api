import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export async function listPerformanceMetrics(params: {
  accountId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 20)));

  const where: Prisma.PerformanceMetricWhereInput = {};
  if (params.accountId) {
    where.accountId = params.accountId;
  }

  if (params.from || params.to) {
    where.collectedAt = {
      gte: params.from,
      lte: params.to,
    };
  }

  const [items, total, aggregate] = await Promise.all([
    prisma.performanceMetric.findMany({
      where,
      include: {
        account: true,
        draft: true,
        publishJob: true,
      },
      orderBy: [{ collectedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.performanceMetric.count({ where }),
    prisma.performanceMetric.aggregate({
      where,
      _sum: {
        impressions: true,
        reads: true,
        likes: true,
        shares: true,
        comments: true,
        bookmarks: true,
      },
      _avg: {
        ctr: true,
      },
    }),
  ]);

  return {
    items,
    summary: {
      impressions: aggregate._sum.impressions ?? 0,
      reads: aggregate._sum.reads ?? 0,
      likes: aggregate._sum.likes ?? 0,
      shares: aggregate._sum.shares ?? 0,
      comments: aggregate._sum.comments ?? 0,
      bookmarks: aggregate._sum.bookmarks ?? 0,
      ctr: aggregate._avg.ctr ?? 0,
    },
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      hasPrev: page > 1,
      hasNext: page * pageSize < total,
    },
  };
}
