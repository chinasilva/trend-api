import type { TrendItem } from '@/types/trend';
import { requestSignalApi } from './base';

type TargetSourceType = 'research_report' | 'recruitment' | 'gov_procurement' | 'app_rank';

interface SignalSourceItem {
  id?: string;
  name?: string;
  type?: string;
  signalCount?: number;
}

interface SignalApiSignal {
  id?: string;
  title?: string;
  url?: string;
  summary?: string;
  score?: number | string;
  sourceId?: string;
  category?: string;
  tags?: unknown;
  tagsZh?: unknown;
  aiSummary?: string;
  aiSummaryZh?: string;
  externalId?: string | null;
  platform?: string;
  createdAt?: string;
  source?: {
    id?: string;
    name?: string;
    type?: string;
  };
}

interface SignalApiListResponse {
  signals?: SignalApiSignal[];
}

const TARGET_SOURCE_TYPES: TargetSourceType[] = [
  'research_report',
  'recruitment',
  'gov_procurement',
  'app_rank',
];

const SOURCE_ID_ENV_KEYS: Record<TargetSourceType, string> = {
  research_report: 'SIGNAL_SOURCE_ID_RESEARCH_REPORT',
  recruitment: 'SIGNAL_SOURCE_ID_RECRUITMENT',
  gov_procurement: 'SIGNAL_SOURCE_ID_GOV_PROCUREMENT',
  app_rank: 'SIGNAL_SOURCE_ID_APP_RANK',
};

const DEFAULT_SOURCE_NAMES: Record<TargetSourceType, string> = {
  research_report: '行业研报',
  recruitment: '招聘信号',
  gov_procurement: '政府采购',
  app_rank: '应用榜单',
};

const SIGNAL_DAYS = Math.min(7, Math.max(1, Number(process.env.SIGNAL_DAYS || 2)));
const SIGNAL_LIMIT_PER_SOURCE = Math.min(
  100,
  Math.max(5, Number(process.env.SIGNAL_LIMIT_PER_SOURCE || 20))
);

interface ResolvedSource {
  id: string;
  type: TargetSourceType;
  name: string;
}

interface SignalTrendCandidate {
  title: string;
  hotValue?: number;
  url?: string;
  description?: string;
  extra: Record<string, unknown>;
  createdAtMs: number;
}

function toStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&#39;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function toHotValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return undefined;
}

function resolveSignalUrl(signal: SignalApiSignal) {
  const direct = toStringValue(signal.url);
  if (direct) {
    return direct;
  }

  const external = toStringValue(signal.externalId ?? '');
  if (external.startsWith('http://') || external.startsWith('https://')) {
    return external;
  }

  return undefined;
}

async function fetchSignalSources() {
  const response = await requestSignalApi<SignalSourceItem[]>('/api/sources');
  if (!Array.isArray(response)) {
    throw new Error('Signal sources response is invalid');
  }
  return response;
}

function resolveConfiguredSourceIds() {
  return TARGET_SOURCE_TYPES.reduce<Partial<Record<TargetSourceType, string>>>((acc, type) => {
    const envKey = SOURCE_ID_ENV_KEYS[type];
    const value = process.env[envKey]?.trim();
    if (value) {
      acc[type] = value;
    }
    return acc;
  }, {});
}

function resolveTargetSources(
  sources: SignalSourceItem[],
  configuredIds: Partial<Record<TargetSourceType, string>>
): ResolvedSource[] {
  const byType = new Map<TargetSourceType, SignalSourceItem[]>();
  TARGET_SOURCE_TYPES.forEach((type) => {
    byType.set(type, sources.filter((item) => item.type === type));
  });

  const resolved: ResolvedSource[] = [];

  for (const type of TARGET_SOURCE_TYPES) {
    const configuredId = configuredIds[type];
    if (configuredId) {
      const fromList = sources.find((item) => item.id === configuredId);
      resolved.push({
        id: configuredId,
        type,
        name: fromList?.name || DEFAULT_SOURCE_NAMES[type],
      });
      continue;
    }

    const candidates = (byType.get(type) || [])
      .filter((item) => typeof item.id === 'string' && item.id)
      .sort((a, b) => (b.signalCount || 0) - (a.signalCount || 0));

    if (candidates.length === 0) {
      continue;
    }

    const pick = candidates[0];
    resolved.push({
      id: pick.id as string,
      type,
      name: pick.name || DEFAULT_SOURCE_NAMES[type],
    });
  }

  return resolved;
}

async function fetchSignalsBySource(source: ResolvedSource) {
  const result = await requestSignalApi<SignalApiListResponse>('/api/signals', {
    searchParams: {
      limit: SIGNAL_LIMIT_PER_SOURCE,
      days: SIGNAL_DAYS,
      sourceId: source.id,
    },
  });

  if (!Array.isArray(result.signals)) {
    return [];
  }

  return result.signals;
}

function toCandidate(signal: SignalApiSignal, fallbackSource: ResolvedSource): SignalTrendCandidate | null {
  const rawTitle = toStringValue(signal.title);
  const title = decodeHtmlEntities(rawTitle);
  if (!title) {
    return null;
  }

  const tagsZh = toStringArray(signal.tagsZh);
  const tags = toStringArray(signal.tags);
  const description =
    toStringValue(signal.aiSummaryZh) ||
    toStringValue(signal.summary) ||
    toStringValue(signal.aiSummary) ||
    undefined;
  const category = toStringValue(signal.category) || undefined;
  const createdAtRaw = toStringValue(signal.createdAt);
  const createdAtMs = createdAtRaw ? new Date(createdAtRaw).getTime() : Date.now();
  const sourceType = toStringValue(signal.source?.type) || fallbackSource.type;
  const sourceName = toStringValue(signal.source?.name) || fallbackSource.name;

  return {
    title,
    hotValue: toHotValue(signal.score),
    url: resolveSignalUrl(signal),
    description,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    extra: {
      source: 'signal',
      sourceType,
      sourceId: toStringValue(signal.sourceId) || fallbackSource.id,
      sourceName,
      category,
      tags,
      tagsZh,
      aiSummary: toStringValue(signal.aiSummary) || undefined,
      aiSummaryZh: toStringValue(signal.aiSummaryZh) || undefined,
      platform: toStringValue(signal.platform) || undefined,
      signalId: toStringValue(signal.id) || undefined,
      createdAt: createdAtRaw || undefined,
    },
  };
}

export async function fetchSignal(): Promise<TrendItem[]> {
  const configuredIds = resolveConfiguredSourceIds();
  const sources = await fetchSignalSources();
  const targets = resolveTargetSources(sources, configuredIds);

  if (targets.length === 0) {
    throw new Error('No Signal sources resolved for P0 source types');
  }

  const results = await Promise.allSettled(targets.map((source) => fetchSignalsBySource(source)));
  const errors: string[] = [];
  const candidates: SignalTrendCandidate[] = [];

  results.forEach((result, index) => {
    const source = targets[index];
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : 'unknown error';
      errors.push(`${source.type}:${reason}`);
      return;
    }

    result.value.forEach((signal) => {
      const candidate = toCandidate(signal, source);
      if (candidate) {
        candidates.push(candidate);
      }
    });
  });

  if (candidates.length === 0) {
    const errorMessage = errors.length > 0 ? errors.join(' | ') : 'empty response';
    throw new Error(`Signal fetch returned no data: ${errorMessage}`);
  }

  const deduped = new Map<string, SignalTrendCandidate>();
  candidates.forEach((item) => {
    const key = `${item.title}|${item.url || ''}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, item);
      return;
    }

    const existingHot = existing.hotValue ?? -1;
    const currentHot = item.hotValue ?? -1;
    if (currentHot > existingHot || item.createdAtMs > existing.createdAtMs) {
      deduped.set(key, item);
    }
  });

  const sorted = Array.from(deduped.values()).sort((a, b) => {
    const aHot = a.hotValue ?? -1;
    const bHot = b.hotValue ?? -1;
    if (aHot !== bHot) {
      return bHot - aHot;
    }
    return b.createdAtMs - a.createdAtMs;
  });

  return sorted.map((item, index) => ({
    title: item.title,
    hotValue: item.hotValue,
    url: item.url,
    description: item.description,
    rank: index + 1,
    extra: item.extra,
  }));
}
