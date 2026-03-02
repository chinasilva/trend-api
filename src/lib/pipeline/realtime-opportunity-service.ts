import { createHash } from 'crypto';
import { OpportunityStatus, Prisma, RealtimeOpportunitySessionStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { generateDraftFromOpportunity } from '@/lib/pipeline/draft-service';
import { getOrCreateAccountProfile } from '@/lib/pipeline/profile-service';
import type {
  RealtimeOpportunityComputeResult,
  RealtimeOpportunityGenerateResult,
  TopicEvidence,
} from '@/types/pipeline';

const MAX_EVIDENCE_COUNT = 12;
const DEFAULT_TOP_N = 50;
const MAX_TOP_N = 200;
const DEFAULT_MIN_SCORE = 45;
const SIGNAL_QUALITY_WEIGHT = 0.12;
const SESSION_DEFAULT_TTL_MINUTES = 30;

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

const REALTIME_WINDOWS = [
  { label: '24h', hours: 24, weight: 0.65 },
  { label: '72h', hours: 72, weight: 0.25 },
  { label: '168h', hours: 168, weight: 0.1 },
] as const;

type RealtimeWindowLabel = (typeof REALTIME_WINDOWS)[number]['label'];

interface ClusterItem {
  platform: string;
  title: string;
  url?: string;
  rank: number;
  hotValue: number | null;
  createdAt: Date;
  summary?: string;
  category?: string;
  tags: string[];
  sourceType?: string;
  sourceName?: string;
}

interface LayerMetrics {
  resonanceCount: number;
  growthScore: number;
  persistenceScore: number;
  signalQuality: number;
  latestSnapshotAt: Date;
}

interface ClusterCandidate {
  fingerprint: string;
  title: string;
  keywords: string[];
  evidences: TopicEvidence[];
  layers: Partial<Record<RealtimeWindowLabel, LayerMetrics>>;
  latestSnapshotAt: Date;
}

interface AccountScoredCandidate {
  fingerprint: string;
  title: string;
  keywords: string[];
  evidences: TopicEvidence[];
  weightedScore: number;
  windowScores: Record<RealtimeWindowLabel, number>;
  windowRanks: Partial<Record<RealtimeWindowLabel, number>>;
  reasons: string[];
  latestSnapshotAt: Date;
  resonanceCount: number;
  growthScore: number;
  personaFitScore: number;
  riskPrecheckScore: number;
}

export class RealtimeOpportunityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'RealtimeOpportunityError';
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

function extractKeywords(input: string, limit = 6) {
  const normalized = normalizeText(input);
  if (!normalized) {
    return [] as string[];
  }

  const bySpace = normalized.split(' ').filter((token) => token.length >= 2);
  if (bySpace.length > 0) {
    return Array.from(new Set(bySpace)).slice(0, limit);
  }

  const compact = normalized.replace(/\s+/g, '');
  const ngram: string[] = [];
  for (let i = 0; i < Math.min(compact.length - 1, limit * 2); i += 1) {
    const token = compact.slice(i, i + 2);
    if (token.length === 2) {
      ngram.push(token);
    }
  }

  return Array.from(new Set(ngram)).slice(0, limit);
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
        ...mergedTags.flatMap((tag) => extractKeywords(tag, 2)),
        ...(category ? extractKeywords(category, 3) : []),
        ...(summary ? extractKeywords(summary, 4) : []),
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

function scoreSignalQuality(items: ClusterItem[]) {
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
    ...toKeywordArray(params.painPoints),
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
  const hits = HIGH_RISK_TERMS.reduce(
    (count, term) => (text.includes(term) ? count + 1 : count),
    0
  );
  return clamp(100 - hits * 20, 0, 100);
}

function scoreOpportunity(params: {
  resonanceCount: number;
  growthScore: number;
  persistenceScore: number;
  latestSnapshotAt: Date;
  title: string;
  categoryScore: number;
  signalQuality: number;
}) {
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

  return {
    score: Math.round(clamp(rawScore, 0, 100)),
    reasons: [
      `hot:${baseHeat.toFixed(1)}`,
      `cross-source:${crossSource.toFixed(1)}`,
      `momentum:${momentum.toFixed(1)}`,
      `freshness:${freshness.toFixed(1)}`,
      `persistence:${params.persistenceScore.toFixed(1)}`,
      `signal-quality:${signalQuality.toFixed(1)}`,
      `category:${params.categoryScore.toFixed(1)}`,
      ...(hasHighRisk ? ['risk:high-risk-term'] : []),
    ],
  };
}

function toEvidence(items: ClusterItem[]): TopicEvidence[] {
  const sorted = [...items].sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return sorted.slice(0, MAX_EVIDENCE_COUNT).map((item) => ({
    platform: item.platform,
    title: item.title,
    url: item.url,
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

function buildLayerMetrics(items: ClusterItem[], windowStartMs: number): LayerMetrics | null {
  const scoped = items.filter((item) => item.createdAt.getTime() >= windowStartMs);
  if (scoped.length === 0) {
    return null;
  }

  const latestSnapshotAt = scoped.reduce(
    (latest, item) => (item.createdAt > latest ? item.createdAt : latest),
    scoped[0].createdAt
  );
  const resonanceCount = new Set(scoped.map((item) => item.platform)).size;
  const baseHeat = scoreClusterGrowth(scoped);
  const momentum = scoreClusterMomentum(scoped);

  return {
    resonanceCount,
    growthScore: clamp(baseHeat * 0.65 + momentum * 0.35, 0, 100),
    persistenceScore: scorePersistence(scoped, resonanceCount),
    signalQuality: scoreSignalQuality(scoped),
    latestSnapshotAt,
  };
}

async function cleanupRealtimeSessions() {
  const now = new Date();
  await prisma.realtimeOpportunitySession.updateMany({
    where: {
      status: RealtimeOpportunitySessionStatus.OPEN,
      expiresAt: {
        lte: now,
      },
    },
    data: {
      status: RealtimeOpportunitySessionStatus.EXPIRED,
    },
  });

  await prisma.realtimeOpportunitySession.deleteMany({
    where: {
      expiresAt: {
        lte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      },
    },
  });
}

function normalizeTopN(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_TOP_N;
  }
  return Math.max(1, Math.min(MAX_TOP_N, Math.floor(value)));
}

function resolveSessionTtlMinutes() {
  const value = Number(process.env.REALTIME_OPPORTUNITY_SESSION_TTL_MINUTES || SESSION_DEFAULT_TTL_MINUTES);
  if (!Number.isFinite(value)) {
    return SESSION_DEFAULT_TTL_MINUTES;
  }
  return Math.max(5, Math.min(180, Math.floor(value)));
}

function parseWindowConfigStats(value: Prisma.JsonValue | null | undefined) {
  const obj = toJsonObject(value);
  if (!obj) {
    return null;
  }
  const counts = toJsonObject(obj.counts as Prisma.JsonValue | null | undefined);
  if (!counts) {
    return null;
  }

  const readNumber = (key: string) => {
    const value = Number(counts[key]);
    return Number.isFinite(value) ? value : 0;
  };

  return {
    snapshotCount: readNumber('snapshotCount'),
    clusterCount: readNumber('clusterCount'),
    candidateCount: readNumber('candidateCount'),
    storedCount: readNumber('storedCount'),
  };
}

function buildComputeResult(params: {
  sessionId: string;
  accountId: string;
  reused: boolean;
  expiresAt: Date;
  topN: number;
  counts: {
    snapshotCount: number;
    clusterCount: number;
    candidateCount: number;
    storedCount: number;
  };
}): RealtimeOpportunityComputeResult {
  return {
    sessionId: params.sessionId,
    accountId: params.accountId,
    reused: params.reused,
    expiresAt: params.expiresAt.toISOString(),
    topN: params.topN,
    counts: params.counts,
    windows: REALTIME_WINDOWS.map((window) => ({
      label: window.label,
      hours: window.hours,
      weight: window.weight,
    })),
  };
}

function parseNumberRecord(value: Prisma.JsonValue | null | undefined) {
  const obj = toJsonObject(value);
  const result: Record<string, number> = {};
  if (!obj) {
    return result;
  }

  Object.entries(obj).forEach(([key, item]) => {
    const num = Number(item);
    if (Number.isFinite(num)) {
      result[key] = num;
    }
  });
  return result;
}

function parseReasons(value: Prisma.JsonValue | null | undefined) {
  return toStringArray(value).slice(0, 40);
}

function parseEvidences(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as TopicEvidence[];
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        platform: typeof row.platform === 'string' ? row.platform : 'unknown',
        title: typeof row.title === 'string' ? row.title : 'unknown',
        url: typeof row.url === 'string' ? row.url : undefined,
        rank: typeof row.rank === 'number' ? row.rank : 0,
        hotValue: typeof row.hotValue === 'number' ? row.hotValue : undefined,
        summary: typeof row.summary === 'string' ? row.summary : undefined,
        category: typeof row.category === 'string' ? row.category : undefined,
        tags: Array.isArray(row.tags)
          ? row.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 12)
          : undefined,
        sourceType: typeof row.sourceType === 'string' ? row.sourceType : undefined,
        sourceName: typeof row.sourceName === 'string' ? row.sourceName : undefined,
        snapshotAt:
          typeof row.snapshotAt === 'string' ? row.snapshotAt : new Date().toISOString(),
      } satisfies TopicEvidence;
    })
    .filter((item) => item.title !== 'unknown')
    .slice(0, MAX_EVIDENCE_COUNT);
}

async function collectClusterCandidates(now: Date) {
  const maxWindowHours = Math.max(...REALTIME_WINDOWS.map((item) => item.hours));
  const windowStart = new Date(now.getTime() - maxWindowHours * 60 * 60 * 1000);

  const snapshots = await prisma.snapshot.findMany({
    where: {
      createdAt: {
        gte: windowStart,
        lte: now,
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
      items: ClusterItem[];
      latestSnapshotAt: Date;
    }
  >();

  for (const snapshot of snapshots) {
    const title = snapshot.content.title;
    const fingerprint = createFingerprint(title);
    const current = grouped.get(fingerprint);
    const contentExtra = parseContentExtra(snapshot.content.extra);
    const keywords = Array.from(new Set([...extractKeywords(title), ...contentExtra.keywordHints]));

    const item: ClusterItem = {
      platform: snapshot.content.source.platform,
      title,
      url: snapshot.content.url || undefined,
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
        keywords: new Set(keywords),
        items: [item],
        latestSnapshotAt: snapshot.createdAt,
      });
      continue;
    }

    current.items.push(item);
    keywords.forEach((keyword) => current.keywords.add(keyword));
    if (snapshot.rank < current.bestRank) {
      current.title = title;
      current.bestRank = snapshot.rank;
    }
    if (snapshot.createdAt > current.latestSnapshotAt) {
      current.latestSnapshotAt = snapshot.createdAt;
    }
  }

  const clusters: ClusterCandidate[] = Array.from(grouped.entries()).map(([fingerprint, group]) => {
    const layers: Partial<Record<RealtimeWindowLabel, LayerMetrics>> = {};
    for (const window of REALTIME_WINDOWS) {
      const layer = buildLayerMetrics(
        group.items,
        now.getTime() - window.hours * 60 * 60 * 1000
      );
      if (layer) {
        layers[window.label] = layer;
      }
    }

    return {
      fingerprint,
      title: group.title,
      keywords: Array.from(group.keywords).slice(0, 16),
      evidences: toEvidence(group.items),
      layers,
      latestSnapshotAt: group.latestSnapshotAt,
    };
  });

  return {
    snapshotCount: snapshots.length,
    clusters,
  };
}

function scoreCandidatesForAccount(params: {
  clusters: ClusterCandidate[];
  accountKeywords: string[];
  profile: {
    audience?: string;
    growthGoal?: string;
    tone?: string;
    painPoints?: Prisma.JsonValue | null;
  };
  minScore: number;
}) {
  const candidates: AccountScoredCandidate[] = [];

  for (const cluster of params.clusters) {
    const clusterKeywordsLower = cluster.keywords.map((item) => item.toLowerCase());
    const match = categoryMatch(clusterKeywordsLower, params.accountKeywords);
    if (match.shouldSkip) {
      continue;
    }

    const personaFitScore = scorePersonaFit({
      title: cluster.title,
      clusterKeywords: cluster.keywords,
      audience: params.profile.audience,
      growthGoal: params.profile.growthGoal,
      tone: params.profile.tone,
      painPoints: params.profile.painPoints,
    });
    const riskPrecheckScore = scoreRiskPrecheck(cluster.title, cluster.keywords);

    let weighted = 0;
    const reasons: string[] = [];
    const windowScores = {
      '24h': 0,
      '72h': 0,
      '168h': 0,
    } as Record<RealtimeWindowLabel, number>;

    for (const window of REALTIME_WINDOWS) {
      const layer = cluster.layers[window.label];
      if (!layer) {
        reasons.push(`window:${window.label}:0.0`);
        continue;
      }

      const layerScore = scoreOpportunity({
        resonanceCount: layer.resonanceCount,
        growthScore: layer.growthScore,
        persistenceScore: layer.persistenceScore,
        signalQuality: layer.signalQuality,
        latestSnapshotAt: layer.latestSnapshotAt,
        title: cluster.title,
        categoryScore: match.score,
      });

      windowScores[window.label] = layerScore.score;
      weighted += layerScore.score * window.weight;
      reasons.push(
        `window:${window.label}:${layerScore.score.toFixed(1)}*${window.weight.toFixed(2)}`
      );
      layerScore.reasons.forEach((reason) => reasons.push(`window:${window.label}:${reason}`));
    }

    const weightedScore = Number(weighted.toFixed(2));
    const personaFactor = 0.7 + (personaFitScore / 100) * 0.3;
    const riskPenalty = (100 - riskPrecheckScore) * 0.12;
    const finalScore = clamp(weightedScore * personaFactor - riskPenalty, 0, 100);
    if (finalScore < params.minScore) {
      continue;
    }

    const signalSourceTypes = Array.from(
      new Set(
        cluster.evidences
          .filter((item) => item.platform === 'signal' && typeof item.sourceType === 'string')
          .map((item) => item.sourceType as string)
      )
    );

    candidates.push({
      fingerprint: cluster.fingerprint,
      title: cluster.title,
      keywords: cluster.keywords,
      evidences: cluster.evidences,
      weightedScore: finalScore,
      windowScores,
      windowRanks: {},
      reasons: [
        `weighted:${weightedScore.toFixed(1)}`,
        `persona-fit:${personaFitScore.toFixed(1)}`,
        `risk-precheck:${riskPrecheckScore.toFixed(1)}`,
        ...reasons,
        ...(match.matched.length > 0 ? [`matched:${match.matched.join('|')}`] : []),
        ...(signalSourceTypes.length > 0 ? [`signal-source:${signalSourceTypes.join('|')}`] : []),
      ],
      latestSnapshotAt: cluster.latestSnapshotAt,
      resonanceCount: Math.max(...Object.values(windowScores), 1),
      growthScore: Math.max(...Object.values(windowScores)),
      personaFitScore,
      riskPrecheckScore,
    });
  }

  candidates.sort((a, b) => {
    if (b.weightedScore !== a.weightedScore) {
      return b.weightedScore - a.weightedScore;
    }
    return b.latestSnapshotAt.getTime() - a.latestSnapshotAt.getTime();
  });

  return candidates;
}

function applyWindowRanks(candidates: AccountScoredCandidate[]) {
  for (const window of REALTIME_WINDOWS) {
    const ranked = [...candidates].sort(
      (a, b) => b.windowScores[window.label] - a.windowScores[window.label]
    );
    ranked.forEach((candidate, index) => {
      candidate.windowRanks[window.label] = index + 1;
    });
  }
}

async function findReusableSession(params: { accountId: string; topN: number; now: Date }) {
  const existing = await prisma.realtimeOpportunitySession.findFirst({
    where: {
      accountId: params.accountId,
      topN: params.topN,
      status: RealtimeOpportunitySessionStatus.OPEN,
      expiresAt: {
        gt: params.now,
      },
    },
    include: {
      _count: {
        select: {
          items: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!existing || existing._count.items === 0) {
    return null;
  }

  const savedCounts = parseWindowConfigStats(existing.windowConfig);
  return buildComputeResult({
    sessionId: existing.id,
    accountId: existing.accountId,
    reused: true,
    expiresAt: existing.expiresAt,
    topN: existing.topN,
    counts: savedCounts || {
      snapshotCount: 0,
      clusterCount: existing._count.items,
      candidateCount: existing._count.items,
      storedCount: existing._count.items,
    },
  });
}

export async function computeRealtimeOpportunitySession(params: {
  accountId: string;
  topN?: number;
  refresh?: boolean;
}): Promise<RealtimeOpportunityComputeResult> {
  const topN = normalizeTopN(params.topN);
  const now = new Date();
  const ttlMinutes = resolveSessionTtlMinutes();
  const minScore = Number(process.env.OPPORTUNITY_MIN_SCORE ?? DEFAULT_MIN_SCORE);

  await cleanupRealtimeSessions();

  if (!params.refresh) {
    const reusable = await findReusableSession({
      accountId: params.accountId,
      topN,
      now,
    });
    if (reusable) {
      return reusable;
    }
  }

  const [account, profile, collectResult] = await Promise.all([
    prisma.account.findUnique({
      where: { id: params.accountId },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
      },
    }),
    getOrCreateAccountProfile(params.accountId),
    collectClusterCandidates(now),
  ]);

  if (!account || !account.isActive) {
    throw new RealtimeOpportunityError(
      'ACCOUNT_NOT_READY',
      'Account not found or inactive.',
      400
    );
  }

  const accountKeywords = Array.from(
    new Set(
      account.categories.flatMap((entry) =>
        toKeywordArray(entry.category.keywords).map((keyword) => keyword.toLowerCase())
      )
    )
  );

  const scored = scoreCandidatesForAccount({
    clusters: collectResult.clusters,
    accountKeywords,
    profile: {
      audience: profile.audience,
      growthGoal: profile.growthGoal,
      tone: profile.tone,
      painPoints: profile.painPoints as unknown as Prisma.JsonValue,
    },
    minScore,
  });
  applyWindowRanks(scored);
  const shortlisted = scored.slice(0, topN);
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const session = await prisma.realtimeOpportunitySession.create({
    data: {
      accountId: params.accountId,
      status: RealtimeOpportunitySessionStatus.OPEN,
      topN,
      expiresAt,
      windowConfig: {
        windows: REALTIME_WINDOWS,
        counts: {
          snapshotCount: collectResult.snapshotCount,
          clusterCount: collectResult.clusters.length,
          candidateCount: scored.length,
          storedCount: shortlisted.length,
        },
      } as Prisma.InputJsonValue,
    },
  });

  if (shortlisted.length > 0) {
    await prisma.realtimeOpportunityItem.createMany({
      data: shortlisted.map((candidate) => ({
        sessionId: session.id,
        fingerprint: candidate.fingerprint,
        title: candidate.title,
        keywords: candidate.keywords as unknown as Prisma.InputJsonValue,
        evidences: candidate.evidences as unknown as Prisma.InputJsonValue,
        windowScores: candidate.windowScores as unknown as Prisma.InputJsonValue,
        reasons: candidate.reasons as unknown as Prisma.InputJsonValue,
        weightedScore: candidate.weightedScore,
        rank24h: candidate.windowRanks['24h'] ?? null,
        rank72h: candidate.windowRanks['72h'] ?? null,
        rank168h: candidate.windowRanks['168h'] ?? null,
      })),
      skipDuplicates: true,
    });
  }

  return buildComputeResult({
    sessionId: session.id,
    accountId: params.accountId,
    reused: false,
    expiresAt,
    topN,
    counts: {
      snapshotCount: collectResult.snapshotCount,
      clusterCount: collectResult.clusters.length,
      candidateCount: scored.length,
      storedCount: shortlisted.length,
    },
  });
}

export async function generateDraftFromRealtimeSession(params: {
  accountId: string;
  sessionId: string;
}): Promise<RealtimeOpportunityGenerateResult> {
  const now = new Date();
  await cleanupRealtimeSessions();

  const session = await prisma.realtimeOpportunitySession.findFirst({
    where: {
      id: params.sessionId,
      accountId: params.accountId,
    },
    include: {
      items: {
        orderBy: [{ weightedScore: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!session) {
    throw new RealtimeOpportunityError('SESSION_NOT_FOUND', 'Session not found.', 404);
  }

  if (session.expiresAt <= now) {
    if (session.status === RealtimeOpportunitySessionStatus.OPEN) {
      await prisma.realtimeOpportunitySession.update({
        where: { id: session.id },
        data: { status: RealtimeOpportunitySessionStatus.EXPIRED },
      });
    }
    throw new RealtimeOpportunityError('SESSION_EXPIRED', 'Session expired, recompute required.', 409);
  }

  if (session.status === RealtimeOpportunitySessionStatus.CONSUMED) {
    throw new RealtimeOpportunityError(
      'SESSION_ALREADY_CONSUMED',
      'Session has been consumed. Recompute or refresh candidates.',
      409
    );
  }

  if (session.status === RealtimeOpportunitySessionStatus.EXPIRED) {
    throw new RealtimeOpportunityError('SESSION_EXPIRED', 'Session expired, recompute required.', 409);
  }

  if (session.items.length === 0) {
    throw new RealtimeOpportunityError('SESSION_EMPTY', 'Session has no candidate items.', 400);
  }

  const consumedAt = new Date();
  const claimed = await prisma.realtimeOpportunitySession.updateMany({
    where: {
      id: session.id,
      accountId: params.accountId,
      status: RealtimeOpportunitySessionStatus.OPEN,
      expiresAt: {
        gt: consumedAt,
      },
    },
    data: {
      status: RealtimeOpportunitySessionStatus.CONSUMED,
      consumedAt,
    },
  });

  if (claimed.count === 0) {
    throw new RealtimeOpportunityError(
      'SESSION_LOCK_FAILED',
      'Session already consumed or expired.',
      409
    );
  }

  try {
    const selected = session.items[0];
    const evidences = parseEvidences(selected.evidences);
    const latestSnapshotAt =
      evidences
        .map((item) => new Date(item.snapshotAt))
        .filter((item) => !Number.isNaN(item.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0] || consumedAt;
    const windowScores = parseNumberRecord(selected.windowScores);
    const reasons = parseReasons(selected.reasons);
    const resonanceCount = new Set(evidences.map((item) => item.platform)).size || 1;
    const growthScore =
      windowScores['24h'] || windowScores['72h'] || windowScores['168h'] || selected.weightedScore;

    const topicCluster = await prisma.topicCluster.upsert({
      where: {
        fingerprint: selected.fingerprint,
      },
      update: {
        title: selected.title,
        keywords: selected.keywords as Prisma.InputJsonValue,
        evidences: selected.evidences as Prisma.InputJsonValue,
        resonanceCount,
        growthScore,
        latestSnapshotAt,
        windowStart: new Date(consumedAt.getTime() - 168 * 60 * 60 * 1000),
        windowEnd: consumedAt,
      },
      create: {
        fingerprint: selected.fingerprint,
        title: selected.title,
        keywords: selected.keywords as Prisma.InputJsonValue,
        evidences: selected.evidences as Prisma.InputJsonValue,
        resonanceCount,
        growthScore,
        latestSnapshotAt,
        windowStart: new Date(consumedAt.getTime() - 168 * 60 * 60 * 1000),
        windowEnd: consumedAt,
      },
    });

    const opportunity = await prisma.opportunity.upsert({
      where: {
        topicClusterId_accountId: {
          topicClusterId: topicCluster.id,
          accountId: params.accountId,
        },
      },
      update: {
        score: selected.weightedScore,
        layeredScore: {
          windows: windowScores,
          weights: REALTIME_WINDOWS.reduce<Record<string, number>>((acc, window) => {
            acc[window.label] = window.weight;
            return acc;
          }, {}),
          source: 'realtime-session',
          sessionId: session.id,
        } as Prisma.InputJsonValue,
        personaFitScore: 80,
        riskPrecheckScore: 80,
        reasons: [`session:${session.id}`, ...reasons].slice(0, 40) as Prisma.InputJsonValue,
        status: OpportunityStatus.NEW,
        expiresAt: new Date(latestSnapshotAt.getTime() + 6 * 60 * 60 * 1000),
      },
      create: {
        accountId: params.accountId,
        topicClusterId: topicCluster.id,
        score: selected.weightedScore,
        layeredScore: {
          windows: windowScores,
          weights: REALTIME_WINDOWS.reduce<Record<string, number>>((acc, window) => {
            acc[window.label] = window.weight;
            return acc;
          }, {}),
          source: 'realtime-session',
          sessionId: session.id,
        } as Prisma.InputJsonValue,
        personaFitScore: 80,
        riskPrecheckScore: 80,
        reasons: [`session:${session.id}`, ...reasons].slice(0, 40) as Prisma.InputJsonValue,
        status: OpportunityStatus.NEW,
        expiresAt: new Date(latestSnapshotAt.getTime() + 6 * 60 * 60 * 1000),
      },
    });

    const draft = await generateDraftFromOpportunity(opportunity.id);

    return {
      sessionId: session.id,
      consumedAt: consumedAt.toISOString(),
      opportunityId: opportunity.id,
      topicClusterId: topicCluster.id,
      draft,
    };
  } catch (error) {
    await prisma.realtimeOpportunitySession.updateMany({
      where: {
        id: session.id,
        accountId: params.accountId,
        status: RealtimeOpportunitySessionStatus.CONSUMED,
      },
      data: {
        status: RealtimeOpportunitySessionStatus.OPEN,
        consumedAt: null,
      },
    });

    throw error;
  }
}
