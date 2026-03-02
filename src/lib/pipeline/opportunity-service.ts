import { createHash } from 'crypto';
import { OpportunityStatus, PrecomputeRunStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  OpportunityPrecomputeResult,
  OpportunityScoreResult,
  OpportunityWindowConfig,
  SyncOpportunitiesResult,
  TopicClusterInput,
  TopicEvidence,
} from '@/types/pipeline';

const DEFAULT_WINDOW_HOURS = 2;
const DEFAULT_MIN_SCORE = 45;
const MAX_EVIDENCE_COUNT = 12;
const SIGNAL_QUALITY_WEIGHT = 0.12;
const DEFAULT_PRECOMPUTE_LOOKBACK_HOURS = 168;
const DEFAULT_PRECOMPUTE_BUCKET_MINUTES = 30;
const DEFAULT_PRECOMPUTE_TOP_N = 50;
const PRECOMPUTE_LOCK_KEY_1 = 92141;
const PRECOMPUTE_LOCK_KEY_2 = 3001;

export const DEFAULT_OPPORTUNITY_WINDOWS: OpportunityWindowConfig[] = [
  { label: '24h', hours: 24, weight: 0.65 },
  { label: '3d', hours: 72, weight: 0.25 },
  { label: '7d', hours: 168, weight: 0.1 },
];

const PRECOMPUTE_WINDOW_TEMPLATES: OpportunityWindowConfig[] = [
  { label: '24h', hours: 24, weight: 0.65 },
  { label: '72h', hours: 72, weight: 0.25 },
  { label: '168h', hours: 168, weight: 0.1 },
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

const SIGNAL_SOURCE_TYPE_BASE_SCORE: Record<string, number> = {
  research_report: 28,
  recruitment: 22,
  gov_procurement: 22,
  app_rank: 20,
};

export class OpportunityPrecomputeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'OpportunityPrecomputeError';
  }
}

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

function toJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Prisma.JsonObject;
}

function toStringArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readStringFromObject(obj: Prisma.JsonObject | null, key: string): string | undefined {
  if (!obj) {
    return undefined;
  }
  const value = obj[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function extractKeywordTokens(input: string, limit = 6) {
  const normalized = normalizeText(input);
  if (!normalized) {
    return [] as string[];
  }

  const bySpace = normalized.split(' ').filter((token) => token.length >= 2);
  if (bySpace.length > 0) {
    return Array.from(new Set(bySpace)).slice(0, limit);
  }

  const compact = normalized.replace(/\s+/g, '');
  const tokens: string[] = [];
  for (let i = 0; i < Math.min(compact.length - 1, limit * 2); i += 1) {
    const token = compact.slice(i, i + 2);
    if (token.length === 2) {
      tokens.push(token);
    }
  }

  return Array.from(new Set(tokens)).slice(0, limit);
}

function parseContentExtra(value: Prisma.JsonValue | null | undefined) {
  const extra = toJsonObject(value);
  const tagsZh = toStringArray(extra?.tagsZh).slice(0, 8);
  const tags = toStringArray(extra?.tags).slice(0, 8);
  const mergedTags = Array.from(new Set([...tagsZh, ...tags])).slice(0, 12);
  const category = readStringFromObject(extra, 'category');
  const sourceType = readStringFromObject(extra, 'sourceType');
  const sourceName = readStringFromObject(extra, 'sourceName');
  const summary =
    readStringFromObject(extra, 'aiSummaryZh') ||
    readStringFromObject(extra, 'summary') ||
    readStringFromObject(extra, 'aiSummary');

  const keywordHints = Array.from(
    new Set(
      [
        ...mergedTags.flatMap((tag) => extractKeywordTokens(tag, 2)),
        ...(category ? extractKeywordTokens(category, 3) : []),
        ...(summary ? extractKeywordTokens(summary, 4) : []),
      ].map((token) => token.toLowerCase())
    )
  ).slice(0, 10);

  return {
    tags: mergedTags,
    category,
    sourceType,
    sourceName,
    summary,
    keywordHints,
  };
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
  signalQuality: number;
}): OpportunityScoreResult {
  const baseHeat = clamp(params.growthScore, 0, 100);
  const crossSource = clamp((params.resonanceCount / 5) * 100, 0, 100);
  const momentum = clamp(params.growthScore * 0.8 + params.persistenceScore * 0.2, 0, 100);
  const ageMinutes = Math.max(0, (Date.now() - params.latestSnapshotAt.getTime()) / 60000);
  const freshness = clamp(100 * (1 - ageMinutes / 360), 0, 100);
  const signalQuality = clamp(params.signalQuality, 0, 100);
  const signalAdjustment = (signalQuality - 50) * SIGNAL_QUALITY_WEIGHT;

  const loweredTitle = params.title.toLowerCase();
  const hasHighRisk = HIGH_RISK_TERMS.some((term) => loweredTitle.includes(term));
  const riskPenalty = hasHighRisk ? 16 : 0;

  const rawScore =
    baseHeat * 0.3 +
    crossSource * 0.25 +
    momentum * 0.2 +
    freshness * 0.15 +
    params.persistenceScore * 0.1 +
    signalAdjustment +
    params.categoryScore -
    riskPenalty;
  const score = Math.round(clamp(rawScore, 0, 100));

  const reasons = [
    `hot:${baseHeat.toFixed(1)}`,
    `cross-source:${crossSource.toFixed(1)}`,
    `momentum:${momentum.toFixed(1)}`,
    `freshness:${freshness.toFixed(1)}`,
    `persistence:${params.persistenceScore.toFixed(1)}`,
    `signal-quality:${signalQuality.toFixed(1)}`,
    `category:${params.categoryScore.toFixed(1)}`,
  ];

  if (hasHighRisk) {
    reasons.push('risk:high-risk-term');
  }

  return { score, reasons };
}

function scoreSignalQuality(
  items: Array<{
    platform: string;
    sourceType?: string;
    category?: string;
    tags: string[];
    summary?: string;
    hotValue: number | null;
  }>
) {
  const signalItems = items.filter((item) => item.platform === 'signal');
  if (signalItems.length === 0) {
    return 50;
  }

  const sourceTypes = new Set<string>();
  const perItemScores = signalItems.map((item) => {
    const sourceType = item.sourceType?.toLowerCase();
    if (sourceType) {
      sourceTypes.add(sourceType);
    }

    const sourceScore = sourceType ? (SIGNAL_SOURCE_TYPE_BASE_SCORE[sourceType] || 14) : 10;
    const tagScore = Math.min(18, item.tags.length * 4);
    const categoryScore = item.category ? 10 : 0;
    const summaryScore = item.summary && item.summary.length >= 20 ? 14 : 0;
    const hotValueScore = (item.hotValue ?? 0) > 0 ? 8 : 0;
    const total = 20 + sourceScore + tagScore + categoryScore + summaryScore + hotValueScore;
    return clamp(total, 0, 100);
  });

  const average = perItemScores.reduce((sum, value) => sum + value, 0) / perItemScores.length;
  const diversityBonus = Math.min(10, Math.max(0, sourceTypes.size - 1) * 3);

  return clamp(average + diversityBonus, 0, 100);
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
    summary?: string;
    category?: string;
    tags: string[];
    sourceType?: string;
    sourceName?: string;
  }>
): TopicEvidence[] {
  return items.slice(0, MAX_EVIDENCE_COUNT).map((item) => ({
    platform: item.platform,
    title: item.title,
    url: item.url || undefined,
    rank: item.rank,
    hotValue: item.hotValue ?? undefined,
    summary: item.summary,
    category: item.category,
    tags: item.tags.length > 0 ? item.tags : undefined,
    sourceType: item.sourceType,
    sourceName: item.sourceName,
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
        summary?: string;
        category?: string;
        tags: string[];
        sourceType?: string;
        sourceName?: string;
      }>;
      latestSnapshotAt: Date;
    }
  >();

  for (const snapshot of snapshots) {
    const title = snapshot.content.title;
    const fingerprint = createFingerprint(title);
    const current = grouped.get(fingerprint);
    const contentExtra = parseContentExtra(snapshot.content.extra);
    const itemKeywords = Array.from(
      new Set([
        ...extractKeywords(title),
        ...contentExtra.keywordHints,
      ])
    );

    const item = {
      platform: snapshot.content.source.platform,
      title,
      url: snapshot.content.url || '',
      rank: snapshot.rank,
      hotValue: snapshot.hotValue,
      createdAt: snapshot.createdAt,
      summary: contentExtra.summary,
      category: contentExtra.category,
      tags: contentExtra.tags,
      sourceType: contentExtra.sourceType,
      sourceName: contentExtra.sourceName,
    };

    if (!current) {
      grouped.set(fingerprint, {
        title,
        bestRank: snapshot.rank,
        keywords: new Set(itemKeywords),
        platforms: new Set([snapshot.content.source.platform]),
        items: [item],
        latestSnapshotAt: snapshot.createdAt,
      });
      continue;
    }

    current.platforms.add(snapshot.content.source.platform);
    itemKeywords.forEach((keyword) => current.keywords.add(keyword));
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
    const signalQuality = scoreSignalQuality(group.items);

    return {
      fingerprint,
      title: group.title,
      keywords: Array.from(group.keywords).slice(0, 10),
      evidences: toEvidence(group.items),
      resonanceCount: group.platforms.size,
      growthScore: clamp(baseHeat * 0.65 + momentum * 0.35, 0, 100),
      persistenceScore,
      signalQuality,
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

function resolvePrecomputeLookbackHours(input?: number) {
  const fallback = Number(
    process.env.OPPORTUNITY_PRECOMPUTE_LOOKBACK_HOURS || DEFAULT_PRECOMPUTE_LOOKBACK_HOURS
  );
  const raw = Number.isFinite(input as number) ? Number(input) : fallback;
  if (!Number.isFinite(raw)) {
    return DEFAULT_PRECOMPUTE_LOOKBACK_HOURS;
  }
  return Math.max(24, Math.min(24 * 7, Math.floor(raw)));
}

function resolvePrecomputeBucketMinutes() {
  const value = Number(
    process.env.OPPORTUNITY_PRECOMPUTE_BUCKET_MINUTES || DEFAULT_PRECOMPUTE_BUCKET_MINUTES
  );
  if (!Number.isFinite(value)) {
    return DEFAULT_PRECOMPUTE_BUCKET_MINUTES;
  }
  return Math.max(5, Math.min(180, Math.floor(value)));
}

function resolvePrecomputeTopN(input?: number) {
  const fallback = Number(process.env.OPPORTUNITY_PRECOMPUTE_TOP_N || DEFAULT_PRECOMPUTE_TOP_N);
  const raw = Number.isFinite(input as number) ? Number(input) : fallback;
  if (!Number.isFinite(raw)) {
    return DEFAULT_PRECOMPUTE_TOP_N;
  }
  return Math.max(1, Math.min(200, Math.floor(raw)));
}

function buildPrecomputeWindows(lookbackHours: number) {
  const windows = PRECOMPUTE_WINDOW_TEMPLATES.filter((window) => window.hours <= lookbackHours);
  if (windows.length > 0) {
    return normalizeWindows(windows);
  }

  return normalizeWindows([
    {
      label: `${lookbackHours}h`,
      hours: lookbackHours,
      weight: 1,
    },
  ]);
}

function floorToBucket(now: Date, bucketMinutes: number) {
  const bucketMs = bucketMinutes * 60 * 1000;
  const ts = now.getTime();
  return new Date(Math.floor(ts / bucketMs) * bucketMs);
}

function buildPrecomputeRunKey(bucketAt: Date, lookbackHours: number, topN: number) {
  return `precompute:${bucketAt.toISOString()}:w${lookbackHours}:n${topN}`;
}

function parseRunConfig(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const topN = Number(obj.topN);
  const lookbackHours = Number(obj.lookbackHours);
  const bucketMinutes = Number(obj.bucketMinutes);
  if (!Number.isFinite(topN) || !Number.isFinite(lookbackHours) || !Number.isFinite(bucketMinutes)) {
    return null;
  }

  return {
    topN,
    lookbackHours,
    bucketMinutes,
  };
}

function parseRunMetrics(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const read = (key: string) => {
    const num = Number(obj[key]);
    return Number.isFinite(num) ? num : 0;
  };

  return {
    accountsTotal: read('accountsTotal'),
    processed: read('processed'),
    failed: read('failed'),
    clustersUpserted: read('clustersUpserted'),
    opportunitiesUpserted: read('opportunitiesUpserted'),
    trimmedCount: read('trimmedCount'),
    skippedAccounts: read('skippedAccounts'),
    sourceCount: read('sourceCount'),
  };
}

async function applyTopNLimitForActiveAccounts(topN: number) {
  if (topN <= 0) {
    return 0;
  }

  const updatedCount = await prisma.$executeRaw`
    WITH ranked AS (
      SELECT o.id,
             ROW_NUMBER() OVER (
               PARTITION BY o."accountId"
               ORDER BY o.score DESC, o."updatedAt" DESC, o."createdAt" DESC
             ) AS rn
      FROM "Opportunity" o
      INNER JOIN "Account" a
        ON a.id = o."accountId"
      WHERE o.status = 'NEW'::"OpportunityStatus"
        AND a."isActive" = true
    )
    UPDATE "Opportunity" o
    SET status = 'EXPIRED'::"OpportunityStatus",
        "updatedAt" = NOW()
    FROM ranked r
    WHERE o.id = r.id
      AND r.rn > ${topN}
  `;

  return Number(updatedCount) || 0;
}

function buildPrecomputeResult(params: {
  run: {
    id: string;
    runKey: string;
    bucketAt: Date;
    status: PrecomputeRunStatus;
    config: Prisma.JsonValue | null;
    metrics: Prisma.JsonValue | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    error: string | null;
  };
  reused: boolean;
  forced: boolean;
  windowStart?: string;
  windowEnd?: string;
  durationMs?: number;
  fallbackConfig: {
    topN: number;
    lookbackHours: number;
    bucketMinutes: number;
  };
}): OpportunityPrecomputeResult {
  const parsedConfig = parseRunConfig(params.run.config);
  const parsedMetrics = parseRunMetrics(params.run.metrics);

  return {
    runId: params.run.id,
    runKey: params.run.runKey,
    bucketAt: params.run.bucketAt.toISOString(),
    status: params.run.status,
    reused: params.reused,
    forced: params.forced,
    config: parsedConfig || params.fallbackConfig,
    metrics: parsedMetrics || {
      accountsTotal: 0,
      processed: 0,
      failed: 0,
      clustersUpserted: 0,
      opportunitiesUpserted: 0,
      trimmedCount: 0,
      skippedAccounts: 0,
      sourceCount: 0,
    },
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    durationMs:
      params.durationMs ??
      (params.run.startedAt && params.run.finishedAt
        ? Math.max(0, params.run.finishedAt.getTime() - params.run.startedAt.getTime())
        : undefined),
    errors: params.run.error ? [{ message: params.run.error }] : [],
  };
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
      signalQuality: number;
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
        signalQuality: cluster.signalQuality,
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
      signalQuality: layer.signalQuality,
      latestSnapshotAt: layer.latestSnapshotAt,
      title: params.cluster.title,
      categoryScore: params.categoryScore,
    });

    layerScores[window.label] = layerScore.score;
    weighted += layerScore.score * window.weight;
    reasons.push(`window:${window.label}:${layerScore.score.toFixed(1)}*${window.weight.toFixed(2)}`);
    layerScore.reasons.forEach((reason) => {
      reasons.push(`window:${window.label}:${reason}`);
    });
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

      const signalSourceTypes = Array.from(
        new Set(
          cluster.evidences
            .filter((evidence) => evidence.platform === 'signal' && typeof evidence.sourceType === 'string')
            .map((evidence) => (evidence.sourceType as string).trim())
            .filter(Boolean)
        )
      );
      if (signalSourceTypes.length > 0) {
        reasons.push(`signal-source:${signalSourceTypes.join('|')}`);
      }

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
        signalQuality: windows.reduce<Record<string, number>>((acc, item) => {
          const layer = cluster.windows[item.label];
          acc[item.label] = layer ? Number(layer.signalQuality.toFixed(1)) : 0;
          return acc;
        }, {}),
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

export async function runOpportunityPrecompute(params?: {
  topN?: number;
  lookbackHours?: number;
  force?: boolean;
  now?: Date;
}): Promise<OpportunityPrecomputeResult> {
  const now = params?.now || new Date();
  const lookbackHours = resolvePrecomputeLookbackHours(params?.lookbackHours);
  const topN = resolvePrecomputeTopN(params?.topN);
  const bucketMinutes = resolvePrecomputeBucketMinutes();
  const bucketAt = floorToBucket(now, bucketMinutes);
  const runKey = buildPrecomputeRunKey(bucketAt, lookbackHours, topN);
  const forced = params?.force === true;

  let locked = false;
  let runRecord:
    | {
        id: string;
        runKey: string;
        bucketAt: Date;
        status: PrecomputeRunStatus;
        config: Prisma.JsonValue | null;
        metrics: Prisma.JsonValue | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        error: string | null;
      }
    | null = null;
  let accountsTotal = 0;

  try {
    const lockRows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(${PRECOMPUTE_LOCK_KEY_1}, ${PRECOMPUTE_LOCK_KEY_2}) AS locked
    `;
    locked = lockRows[0]?.locked === true;

    const fallbackConfig = {
      topN,
      lookbackHours,
      bucketMinutes,
    };

    if (!locked) {
      const latestRunning = await prisma.opportunityPrecomputeRun.findFirst({
        where: {
          status: PrecomputeRunStatus.RUNNING,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (latestRunning) {
        return buildPrecomputeResult({
          run: latestRunning,
          reused: true,
          forced,
          fallbackConfig,
        });
      }

      throw new OpportunityPrecomputeError(
        'PRECOMPUTE_LOCK_CONFLICT',
        'Another opportunity precompute run is in progress.',
        409
      );
    }

    const existing = await prisma.opportunityPrecomputeRun.findUnique({
      where: {
        runKey,
      },
    });

    if (
      existing &&
      !forced &&
      (existing.status === PrecomputeRunStatus.SUCCESS ||
        existing.status === PrecomputeRunStatus.RUNNING)
    ) {
      return buildPrecomputeResult({
        run: existing,
        reused: true,
        forced,
        fallbackConfig,
      });
    }

    if (existing) {
      runRecord = await prisma.opportunityPrecomputeRun.update({
        where: {
          id: existing.id,
        },
        data: {
          status: PrecomputeRunStatus.RUNNING,
          config: fallbackConfig as unknown as Prisma.InputJsonValue,
          metrics: Prisma.JsonNull,
          error: null,
          startedAt: now,
          finishedAt: null,
        },
      });
    } else {
      runRecord = await prisma.opportunityPrecomputeRun.create({
        data: {
          runKey,
          bucketAt,
          status: PrecomputeRunStatus.RUNNING,
          config: fallbackConfig as unknown as Prisma.InputJsonValue,
          startedAt: now,
        },
      });
    }

    accountsTotal = await prisma.account.count({
      where: {
        isActive: true,
      },
    });

    const windows = buildPrecomputeWindows(lookbackHours);
    const precomputeResult = await syncOpportunities({ windows });
    const trimmedCount = await applyTopNLimitForActiveAccounts(topN);
    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - now.getTime());
    const metrics = {
      accountsTotal,
      processed: accountsTotal,
      failed: 0,
      clustersUpserted: precomputeResult.clustersUpserted,
      opportunitiesUpserted: precomputeResult.opportunitiesUpserted,
      trimmedCount,
      skippedAccounts: precomputeResult.skippedAccounts,
      sourceCount: precomputeResult.sourceCount,
    };

    runRecord = await prisma.opportunityPrecomputeRun.update({
      where: {
        id: runRecord.id,
      },
      data: {
        status: PrecomputeRunStatus.SUCCESS,
        config: {
          topN,
          lookbackHours,
          bucketMinutes,
          windows,
          windowStart: precomputeResult.windowStart,
          windowEnd: precomputeResult.windowEnd,
        } as unknown as Prisma.InputJsonValue,
        metrics: metrics as unknown as Prisma.InputJsonValue,
        error: null,
        finishedAt,
      },
    });

    return buildPrecomputeResult({
      run: runRecord,
      reused: false,
      forced,
      fallbackConfig: {
        topN,
        lookbackHours,
        bucketMinutes,
      },
      windowStart: precomputeResult.windowStart,
      windowEnd: precomputeResult.windowEnd,
      durationMs,
    });
  } catch (error) {
    if (runRecord) {
      await prisma.opportunityPrecomputeRun.update({
        where: {
          id: runRecord.id,
        },
        data: {
          status: PrecomputeRunStatus.FAILED,
          metrics: {
            accountsTotal,
            processed: 0,
            failed: accountsTotal,
            clustersUpserted: 0,
            opportunitiesUpserted: 0,
            trimmedCount: 0,
            skippedAccounts: 0,
            sourceCount: 0,
          } as Prisma.InputJsonValue,
          error: error instanceof Error ? error.message : 'Unknown error',
          finishedAt: new Date(),
        },
      });
    }
    throw error;
  } finally {
    if (locked) {
      await prisma.$queryRaw<Array<{ unlocked: boolean }>>`
        SELECT pg_advisory_unlock(${PRECOMPUTE_LOCK_KEY_1}, ${PRECOMPUTE_LOCK_KEY_2}) AS unlocked
      `;
    }
  }
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
