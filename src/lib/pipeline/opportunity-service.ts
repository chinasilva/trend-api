import { createHash } from 'crypto';
import { OpportunityStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  OpportunityScoreResult,
  SyncOpportunitiesResult,
  TopicClusterInput,
  TopicEvidence,
} from '@/types/pipeline';

const DEFAULT_WINDOW_HOURS = 2;
const DEFAULT_MIN_SCORE = 45;
const MAX_EVIDENCE_COUNT = 12;

const HIGH_RISK_TERMS = [
  '博彩',
  '赌博',
  '色情',
  '暴力',
  '违法',
  '谣言',
  '假新闻',
  '恐怖',
  '毒品',
  '诈骗',
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createFingerprint(title: string) {
  const normalized = normalizeText(title).replace(/\s+/g, '');
  if (!normalized) {
    return `topic-${Date.now()}`;
  }

  return createHash('sha256').update(normalized).digest('hex').slice(0, 40);
}

function extractKeywords(title: string) {
  const normalized = normalizeText(title);
  const bySpace = normalized.split(' ').filter((token) => token.length >= 2);

  if (bySpace.length > 0) {
    return Array.from(new Set(bySpace)).slice(0, 6);
  }

  const compact = normalized.replace(/\s+/g, '');
  const ngram: string[] = [];
  for (let i = 0; i < Math.min(compact.length - 1, 8); i += 1) {
    const token = compact.slice(i, i + 2);
    if (token.length === 2) {
      ngram.push(token);
    }
  }

  return Array.from(new Set(ngram)).slice(0, 6);
}

function toKeywordArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function scoreClusterGrowth(items: Array<{ rank: number; hotValue: number | null }>) {
  if (items.length === 0) {
    return 0;
  }

  const rankScore =
    items.reduce((sum, item) => sum + clamp((50 - item.rank) / 50, 0, 1), 0) / items.length;

  const hotCandidates = items
    .map((item) => item.hotValue ?? 0)
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgHot =
    hotCandidates.length > 0
      ? hotCandidates.reduce((sum, value) => sum + value, 0) / hotCandidates.length
      : 0;
  const hotScore = clamp(Math.log10(avgHot + 1) / 6, 0, 1);

  return clamp((rankScore * 0.7 + hotScore * 0.3) * 100, 0, 100);
}

function scoreClusterMomentum(
  items: Array<{ rank: number; hotValue: number | null; createdAt: Date }>
) {
  if (items.length < 2) {
    return 50;
  }

  const sorted = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const midpoint = Math.max(1, Math.floor(sorted.length / 2));
  const early = sorted.slice(0, midpoint);
  const late = sorted.slice(midpoint);

  if (late.length === 0) {
    return 50;
  }

  const earlyRank = early.reduce((sum, item) => sum + item.rank, 0) / early.length;
  const lateRank = late.reduce((sum, item) => sum + item.rank, 0) / late.length;
  const rankDeltaScore = clamp(((earlyRank - lateRank) + 20) / 40, 0, 1);

  const earlyHot = early.reduce((sum, item) => sum + (item.hotValue ?? 0), 0) / early.length;
  const lateHot = late.reduce((sum, item) => sum + (item.hotValue ?? 0), 0) / late.length;
  const hotDeltaScore =
    earlyHot > 0 || lateHot > 0
      ? clamp((lateHot - earlyHot + Math.max(earlyHot, lateHot)) / (Math.max(earlyHot, lateHot) * 2 + 1), 0, 1)
      : 0.5;

  return clamp((rankDeltaScore * 0.7 + hotDeltaScore * 0.3) * 100, 0, 100);
}

function scorePersistence(items: Array<{ platform: string }>, resonanceCount: number) {
  if (items.length === 0 || resonanceCount <= 0) {
    return 0;
  }

  const avgRepeat = items.length / resonanceCount;
  return clamp((1 - Math.exp(-avgRepeat / 2)) * 100, 0, 100);
}

function scoreOpportunity(params: {
  resonanceCount: number;
  growthScore: number;
  persistenceScore: number;
  latestSnapshotAt: Date;
  title: string;
  categoryScore: number;
}): OpportunityScoreResult {
  const baseHeat = clamp(params.growthScore, 0, 100);
  const crossSource = clamp((params.resonanceCount / 5) * 100, 0, 100);
  const momentum = clamp(params.growthScore * 0.8 + params.persistenceScore * 0.2, 0, 100);
  const ageMinutes = Math.max(0, (Date.now() - params.latestSnapshotAt.getTime()) / 60000);
  const freshness = clamp(100 * (1 - ageMinutes / 360), 0, 100);

  const loweredTitle = params.title.toLowerCase();
  const hasHighRisk = HIGH_RISK_TERMS.some((term) => loweredTitle.includes(term));
  const riskPenalty = hasHighRisk ? 16 : 0;

  const rawScore =
    baseHeat * 0.3 +
    crossSource * 0.25 +
    momentum * 0.2 +
    freshness * 0.15 +
    params.persistenceScore * 0.1 +
    params.categoryScore -
    riskPenalty;
  const score = Math.round(clamp(rawScore, 0, 100));

  const reasons = [
    `hot:${baseHeat.toFixed(1)}`,
    `cross-source:${crossSource.toFixed(1)}`,
    `momentum:${momentum.toFixed(1)}`,
    `freshness:${freshness.toFixed(1)}`,
    `persistence:${params.persistenceScore.toFixed(1)}`,
    `category:${params.categoryScore.toFixed(1)}`,
  ];

  if (hasHighRisk) {
    reasons.push('risk:high-risk-term');
  }

  return { score, reasons };
}

function categoryMatch(clusterKeywords: string[], accountKeywords: string[]) {
  if (accountKeywords.length === 0) {
    return {
      matched: [] as string[],
      score: 10,
      shouldSkip: false,
    };
  }

  const matched = clusterKeywords.filter((keyword) =>
    accountKeywords.some((categoryKeyword) =>
      keyword.includes(categoryKeyword) || categoryKeyword.includes(keyword)
    )
  );

  return {
    matched,
    score: matched.length > 0 ? clamp(matched.length * 6, 0, 20) : 0,
    shouldSkip: matched.length === 0,
  };
}

function toEvidence(
  items: Array<{
    platform: string;
    title: string;
    url: string;
    rank: number;
    hotValue: number | null;
    createdAt: Date;
  }>
): TopicEvidence[] {
  return items.slice(0, MAX_EVIDENCE_COUNT).map((item) => ({
    platform: item.platform,
    title: item.title,
    url: item.url || undefined,
    rank: item.rank,
    hotValue: item.hotValue ?? undefined,
    snapshotAt: item.createdAt.toISOString(),
  }));
}

async function collectClusters(windowStart: Date, windowEnd: Date) {
  const snapshots = await prisma.snapshot.findMany({
    where: {
      createdAt: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    include: {
      content: {
        include: {
          source: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  const grouped = new Map<
    string,
    {
      title: string;
      bestRank: number;
      keywords: Set<string>;
      platforms: Set<string>;
      items: Array<{
        platform: string;
        title: string;
        url: string;
        rank: number;
        hotValue: number | null;
        createdAt: Date;
      }>;
      latestSnapshotAt: Date;
    }
  >();

  for (const snapshot of snapshots) {
    const title = snapshot.content.title;
    const fingerprint = createFingerprint(title);
    const current = grouped.get(fingerprint);

    const item = {
      platform: snapshot.content.source.platform,
      title,
      url: snapshot.content.url || '',
      rank: snapshot.rank,
      hotValue: snapshot.hotValue,
      createdAt: snapshot.createdAt,
    };

    if (!current) {
      grouped.set(fingerprint, {
        title,
        bestRank: snapshot.rank,
        keywords: new Set(extractKeywords(title)),
        platforms: new Set([snapshot.content.source.platform]),
        items: [item],
        latestSnapshotAt: snapshot.createdAt,
      });
      continue;
    }

    current.platforms.add(snapshot.content.source.platform);
    extractKeywords(title).forEach((keyword) => current.keywords.add(keyword));
    current.items.push(item);

    if (snapshot.createdAt > current.latestSnapshotAt) {
      current.latestSnapshotAt = snapshot.createdAt;
    }

    if (snapshot.rank < current.bestRank) {
      current.title = title;
      current.bestRank = snapshot.rank;
    }
  }

  const clusters: TopicClusterInput[] = Array.from(grouped.entries()).map(([fingerprint, group]) => {
    const baseHeat = scoreClusterGrowth(
      group.items.map((item) => ({
        rank: item.rank,
        hotValue: item.hotValue,
      }))
    );

    const momentum = scoreClusterMomentum(
      group.items.map((item) => ({
        rank: item.rank,
        hotValue: item.hotValue,
        createdAt: item.createdAt,
      }))
    );

    const persistenceScore = scorePersistence(group.items, group.platforms.size);

    return {
      fingerprint,
      title: group.title,
      keywords: Array.from(group.keywords).slice(0, 10),
      evidences: toEvidence(group.items),
      resonanceCount: group.platforms.size,
      growthScore: clamp(baseHeat * 0.65 + momentum * 0.35, 0, 100),
      persistenceScore,
      latestSnapshotAt: group.latestSnapshotAt,
      windowStart,
      windowEnd,
    };
  });

  return {
    clusters,
    sourceCount: snapshots.length,
  };
}

export async function syncOpportunities(windowHours = DEFAULT_WINDOW_HOURS): Promise<SyncOpportunitiesResult> {
  const now = new Date();
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  const [accounts, clusterResult] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
      },
    }),
    collectClusters(windowStart, windowEnd),
  ]);

  if (accounts.length === 0 || clusterResult.clusters.length === 0) {
    return {
      clustersUpserted: clusterResult.clusters.length,
      opportunitiesUpserted: 0,
      skippedAccounts: 0,
      sourceCount: clusterResult.sourceCount,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    };
  }

  let clustersUpserted = 0;
  let opportunitiesUpserted = 0;
  let skippedAccounts = 0;
  const minScore = Number(process.env.OPPORTUNITY_MIN_SCORE ?? DEFAULT_MIN_SCORE);

  for (const cluster of clusterResult.clusters) {
    const topicCluster = await prisma.topicCluster.upsert({
      where: { fingerprint: cluster.fingerprint },
      update: {
        title: cluster.title,
        keywords: cluster.keywords,
        evidences: cluster.evidences as unknown as Prisma.InputJsonValue,
        resonanceCount: cluster.resonanceCount,
        growthScore: cluster.growthScore,
        latestSnapshotAt: cluster.latestSnapshotAt,
        windowStart: cluster.windowStart,
        windowEnd: cluster.windowEnd,
      },
      create: {
        fingerprint: cluster.fingerprint,
        title: cluster.title,
        keywords: cluster.keywords,
        evidences: cluster.evidences as unknown as Prisma.InputJsonValue,
        resonanceCount: cluster.resonanceCount,
        growthScore: cluster.growthScore,
        latestSnapshotAt: cluster.latestSnapshotAt,
        windowStart: cluster.windowStart,
        windowEnd: cluster.windowEnd,
      },
    });

    clustersUpserted += 1;

    for (const account of accounts) {
      const accountKeywords = Array.from(
        new Set(
          account.categories.flatMap((entry) =>
            toKeywordArray(entry.category.keywords).map((keyword) => keyword.toLowerCase())
          )
        )
      );

      const match = categoryMatch(
        cluster.keywords.map((keyword) => keyword.toLowerCase()),
        accountKeywords
      );

      if (match.shouldSkip) {
        skippedAccounts += 1;
        continue;
      }

      const scoreResult = scoreOpportunity({
        resonanceCount: cluster.resonanceCount,
        growthScore: cluster.growthScore,
        persistenceScore: cluster.persistenceScore,
        latestSnapshotAt: cluster.latestSnapshotAt,
        title: cluster.title,
        categoryScore: match.score,
      });

      if (scoreResult.score < minScore) {
        continue;
      }

      const reasons = [...scoreResult.reasons];
      if (match.matched.length > 0) {
        reasons.push(`matched:${match.matched.join('|')}`);
      }

      const expiresAt = new Date(cluster.latestSnapshotAt.getTime() + 6 * 60 * 60 * 1000);
      const where = {
        topicClusterId_accountId: {
          topicClusterId: topicCluster.id,
          accountId: account.id,
        },
      };

      const existing = await prisma.opportunity.findUnique({
        where,
        select: {
          id: true,
          status: true,
        },
      });

      if (!existing) {
        await prisma.opportunity.create({
          data: {
            topicClusterId: topicCluster.id,
            accountId: account.id,
            score: scoreResult.score,
            reasons: reasons as Prisma.InputJsonValue,
            status: OpportunityStatus.NEW,
            expiresAt,
          },
        });
      } else {
        const nextStatus =
          existing.status === OpportunityStatus.SELECTED ||
          existing.status === OpportunityStatus.EXPIRED ||
          existing.status === OpportunityStatus.DISCARDED
            ? existing.status
            : OpportunityStatus.NEW;
        await prisma.opportunity.update({
          where: { id: existing.id },
          data: {
            score: scoreResult.score,
            reasons: reasons as Prisma.InputJsonValue,
            status: nextStatus,
            expiresAt,
          },
        });
      }

      opportunitiesUpserted += 1;
    }
  }

  return {
    clustersUpserted,
    opportunitiesUpserted,
    skippedAccounts,
    sourceCount: clusterResult.sourceCount,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
}

export async function listOpportunities(params: {
  accountId?: string;
  status?: OpportunityStatus;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 20)));
  const where: Prisma.OpportunityWhereInput = {};

  if (params.accountId) {
    where.accountId = params.accountId;
  }
  if (params.status) {
    where.status = params.status;
  }

  const [items, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        account: true,
        topicCluster: true,
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.opportunity.count({ where }),
  ]);

  return {
    items,
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
