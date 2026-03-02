import { createHash } from 'crypto';
import { OpportunityStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  OpportunityScoreResult,
  OpportunityWindowConfig,
  SyncOpportunitiesResult,
  TopicClusterInput,
  TopicEvidence,
} from '@/types/pipeline';

const DEFAULT_WINDOW_HOURS = 2;
const DEFAULT_MIN_SCORE = 45;
const MAX_EVIDENCE_COUNT = 12;

export const DEFAULT_OPPORTUNITY_WINDOWS: OpportunityWindowConfig[] = [
  { label: '24h', hours: 24, weight: 0.65 },
  { label: '3d', hours: 72, weight: 0.25 },
  { label: '7d', hours: 168, weight: 0.1 },
];

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
  '仇恨',
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
      ? clamp(
          (lateHot - earlyHot + Math.max(earlyHot, lateHot)) /
            (Math.max(earlyHot, lateHot) * 2 + 1),
          0,
          1
        )
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
    accountKeywords.some(
      (categoryKeyword) => keyword.includes(categoryKeyword) || categoryKeyword.includes(keyword)
    )
  );

  return {
    matched,
    score: matched.length > 0 ? clamp(matched.length * 6, 0, 20) : 0,
    shouldSkip: matched.length === 0,
  };
}

function scorePersonaFit(params: {
  title: string;
  clusterKeywords: string[];
  audience?: string;
  growthGoal?: string;
  tone?: string;
  painPoints?: Prisma.JsonValue | null;
}) {
  const normalizedTitle = normalizeText(params.title);
  const normalizedKeywords = params.clusterKeywords.map((item) => normalizeText(item));

  const rawTokens = [
    params.audience || '',
    params.growthGoal || '',
    params.tone || '',
    ...(toKeywordArray(params.painPoints) || []),
  ]
    .join(' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  if (rawTokens.length === 0) {
    return 55;
  }

  const tokenSet = Array.from(new Set(rawTokens)).slice(0, 24);
  const hitCount = tokenSet.reduce((count, token) => {
    const normalizedToken = normalizeText(token);
    if (!normalizedToken) {
      return count;
    }

    if (normalizedTitle.includes(normalizedToken)) {
      return count + 1;
    }

    const keywordHit = normalizedKeywords.some(
      (keyword) => keyword.includes(normalizedToken) || normalizedToken.includes(keyword)
    );
    return keywordHit ? count + 1 : count;
  }, 0);

  return clamp(Math.round(35 + hitCount * 8), 20, 100);
}

function scoreRiskPrecheck(title: string, keywords: string[]) {
  const text = `${title} ${keywords.join(' ')}`.toLowerCase();
  const hits = HIGH_RISK_TERMS.reduce((count, term) => (text.includes(term) ? count + 1 : count), 0);

  return clamp(100 - hits * 20, 0, 100);
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

function normalizeWindows(
  windowsInput?: OpportunityWindowConfig[]
): OpportunityWindowConfig[] {
  const fallback = DEFAULT_OPPORTUNITY_WINDOWS;
  if (!windowsInput || windowsInput.length === 0) {
    return fallback;
  }

  const sanitized = windowsInput
    .filter(
      (window) =>
        !!window &&
        typeof window.label === 'string' &&
        Number.isFinite(window.hours) &&
        Number.isFinite(window.weight)
    )
    .map((window) => ({
      label: window.label.trim() || `${Math.round(window.hours)}h`,
      hours: Math.min(24 * 7, Math.max(1, Math.round(window.hours))),
      weight: clamp(window.weight, 0, 1),
    }))
    .slice(0, 7);

  if (sanitized.length === 0) {
    return fallback;
  }

  const weightSum = sanitized.reduce((sum, window) => sum + window.weight, 0);
  if (weightSum <= 0) {
    return fallback;
  }

  return sanitized.map((window) => ({
    ...window,
    weight: Number((window.weight / weightSum).toFixed(4)),
  }));
}

interface LayeredCluster {
  fingerprint: string;
  title: string;
  keywords: string[];
  evidences: TopicEvidence[];
  latestSnapshotAt: Date;
  windows: Record<
    string,
    {
      resonanceCount: number;
      growthScore: number;
      persistenceScore: number;
      latestSnapshotAt: Date;
    }
  >;
}

function mergeWindowClusters(results: Array<{ label: string; clusters: TopicClusterInput[] }>) {
  const merged = new Map<string, LayeredCluster>();

  for (const result of results) {
    for (const cluster of result.clusters) {
      const current = merged.get(cluster.fingerprint);
      const layerItem = {
        resonanceCount: cluster.resonanceCount,
        growthScore: cluster.growthScore,
        persistenceScore: cluster.persistenceScore,
        latestSnapshotAt: cluster.latestSnapshotAt,
      };

      if (!current) {
        merged.set(cluster.fingerprint, {
          fingerprint: cluster.fingerprint,
          title: cluster.title,
          keywords: cluster.keywords,
          evidences: cluster.evidences.slice(0, MAX_EVIDENCE_COUNT),
          latestSnapshotAt: cluster.latestSnapshotAt,
          windows: {
            [result.label]: layerItem,
          },
        });
        continue;
      }

      const keywordSet = new Set([...current.keywords, ...cluster.keywords]);
      const evidenceByKey = new Map<string, TopicEvidence>();
      [...current.evidences, ...cluster.evidences].forEach((evidence) => {
        const key = `${evidence.platform}:${evidence.title}:${evidence.url || ''}`;
        if (!evidenceByKey.has(key)) {
          evidenceByKey.set(key, evidence);
        }
      });

      current.keywords = Array.from(keywordSet).slice(0, 16);
      current.evidences = Array.from(evidenceByKey.values()).slice(0, MAX_EVIDENCE_COUNT);
      current.latestSnapshotAt =
        cluster.latestSnapshotAt > current.latestSnapshotAt
          ? cluster.latestSnapshotAt
          : current.latestSnapshotAt;
      current.windows[result.label] = layerItem;
    }
  }

  return merged;
}

function computeWeightedScore(params: {
  cluster: LayeredCluster;
  windows: OpportunityWindowConfig[];
  categoryScore: number;
}) {
  let weighted = 0;
  const layerScores: Record<string, number> = {};
  const reasons: string[] = [];

  for (const window of params.windows) {
    const layer = params.cluster.windows[window.label];
    if (!layer) {
      layerScores[window.label] = 0;
      reasons.push(`window:${window.label}:0.0`);
      continue;
    }

    const layerScore = scoreOpportunity({
      resonanceCount: layer.resonanceCount,
      growthScore: layer.growthScore,
      persistenceScore: layer.persistenceScore,
      latestSnapshotAt: layer.latestSnapshotAt,
      title: params.cluster.title,
      categoryScore: params.categoryScore,
    });

    layerScores[window.label] = layerScore.score;
    weighted += layerScore.score * window.weight;
    reasons.push(`window:${window.label}:${layerScore.score.toFixed(1)}*${window.weight.toFixed(2)}`);
  }

  return {
    weightedScore: Number(weighted.toFixed(2)),
    layerScores,
    reasons,
  };
}

export async function syncOpportunities(
  input?: number | { windows?: OpportunityWindowConfig[] }
): Promise<SyncOpportunitiesResult> {
  const now = new Date();
  const minScore = Number(process.env.OPPORTUNITY_MIN_SCORE ?? DEFAULT_MIN_SCORE);

  let windows: OpportunityWindowConfig[];
  if (typeof input === 'number') {
    windows = normalizeWindows([
      {
        label: `${Math.min(24, Math.max(1, Math.floor(input || DEFAULT_WINDOW_HOURS)))}h`,
        hours: Math.min(24, Math.max(1, Math.floor(input || DEFAULT_WINDOW_HOURS))),
        weight: 1,
      },
    ]);
  } else {
    windows = normalizeWindows(input?.windows);
  }

  const windowResults = await Promise.all(
    windows.map(async (window) => {
      const windowEnd = now;
      const windowStart = new Date(now.getTime() - window.hours * 60 * 60 * 1000);
      const result = await collectClusters(windowStart, windowEnd);
      return {
        label: window.label,
        windowStart,
        windowEnd,
        ...result,
      };
    })
  );

  const [accounts, mergedClusters] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: {
        id: true,
        categories: {
          select: {
            category: {
              select: {
                keywords: true,
              },
            },
          },
        },
        profile: {
          select: {
            audience: true,
            growthGoal: true,
            tone: true,
            painPoints: true,
          },
        },
      },
    }),
    Promise.resolve(mergeWindowClusters(windowResults.map((item) => ({ label: item.label, clusters: item.clusters })))),
  ]);

  if (accounts.length === 0 || mergedClusters.size === 0) {
    return {
      clustersUpserted: mergedClusters.size,
      opportunitiesUpserted: 0,
      skippedAccounts: 0,
      sourceCount: windowResults.reduce((sum, item) => sum + item.sourceCount, 0),
      windowStart: new Date(now.getTime() - Math.max(...windows.map((item) => item.hours)) * 60 * 60 * 1000).toISOString(),
      windowEnd: now.toISOString(),
      windows,
    };
  }

  let clustersUpserted = 0;
  let opportunitiesUpserted = 0;
  let skippedAccounts = 0;

  for (const cluster of mergedClusters.values()) {
    const growthScore =
      windows.reduce((sum, window) => {
        const layer = cluster.windows[window.label];
        return sum + (layer ? layer.growthScore * window.weight : 0);
      }, 0) || 0;

    const resonanceCount = Object.values(cluster.windows).reduce(
      (max, layer) => Math.max(max, layer.resonanceCount),
      1
    );

    const earliestWindowStart = new Date(
      now.getTime() - Math.max(...windows.map((item) => item.hours)) * 60 * 60 * 1000
    );

    const topicCluster = await prisma.topicCluster.upsert({
      where: { fingerprint: cluster.fingerprint },
      update: {
        title: cluster.title,
        keywords: cluster.keywords,
        evidences: cluster.evidences as unknown as Prisma.InputJsonValue,
        resonanceCount,
        growthScore,
        latestSnapshotAt: cluster.latestSnapshotAt,
        windowStart: earliestWindowStart,
        windowEnd: now,
      },
      create: {
        fingerprint: cluster.fingerprint,
        title: cluster.title,
        keywords: cluster.keywords,
        evidences: cluster.evidences as unknown as Prisma.InputJsonValue,
        resonanceCount,
        growthScore,
        latestSnapshotAt: cluster.latestSnapshotAt,
        windowStart: earliestWindowStart,
        windowEnd: now,
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

      const clusterKeywordsLower = cluster.keywords.map((keyword) => keyword.toLowerCase());
      const match = categoryMatch(clusterKeywordsLower, accountKeywords);

      if (match.shouldSkip) {
        skippedAccounts += 1;
        continue;
      }

      const personaFitScore = scorePersonaFit({
        title: cluster.title,
        clusterKeywords: cluster.keywords,
        audience: account.profile?.audience,
        growthGoal: account.profile?.growthGoal,
        tone: account.profile?.tone,
        painPoints: account.profile?.painPoints,
      });

      const riskPrecheckScore = scoreRiskPrecheck(cluster.title, cluster.keywords);
      const weightedScore = computeWeightedScore({
        cluster,
        windows,
        categoryScore: match.score,
      });

      // Persona fitting is applied as soft weighting after hard category filter.
      const personaFactor = 0.7 + (personaFitScore / 100) * 0.3;
      const riskPenalty = (100 - riskPrecheckScore) * 0.12;
      const finalScore = clamp(weightedScore.weightedScore * personaFactor - riskPenalty, 0, 100);

      if (finalScore < minScore) {
        continue;
      }

      const reasons = [
        `weighted:${weightedScore.weightedScore.toFixed(1)}`,
        `persona-fit:${personaFitScore.toFixed(1)}`,
        `risk-precheck:${riskPrecheckScore.toFixed(1)}`,
        ...weightedScore.reasons,
      ];

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

      const layeredScore = {
        windows: weightedScore.layerScores,
        weights: windows.reduce<Record<string, number>>((acc, item) => {
          acc[item.label] = item.weight;
          return acc;
        }, {}),
      };

      if (!existing) {
        await prisma.opportunity.create({
          data: {
            topicClusterId: topicCluster.id,
            accountId: account.id,
            score: finalScore,
            layeredScore: layeredScore as unknown as Prisma.InputJsonValue,
            personaFitScore,
            riskPrecheckScore,
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
            score: finalScore,
            layeredScore: layeredScore as unknown as Prisma.InputJsonValue,
            personaFitScore,
            riskPrecheckScore,
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
    sourceCount: windowResults.reduce((sum, item) => sum + item.sourceCount, 0),
    windowStart: new Date(now.getTime() - Math.max(...windows.map((item) => item.hours)) * 60 * 60 * 1000).toISOString(),
    windowEnd: now.toISOString(),
    windows,
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
