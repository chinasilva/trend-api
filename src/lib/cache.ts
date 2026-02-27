import type { Platform, TrendItem } from '@/types/trend';

// 内存缓存
const cache = new Map<string, { data: TrendItem[]; timestamp: number }>();

// 缓存过期时间（5分钟）
const CACHE_TTL = 5 * 60 * 1000;

export function getCache(platform: Platform): TrendItem[] | null {
  const cached = cache.get(platform);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(platform);
    return null;
  }

  return cached.data;
}

export function setCache(platform: Platform, data: TrendItem[]): void {
  cache.set(platform, { data, timestamp: Date.now() });
}

export function clearCache(platform?: Platform): void {
  if (platform) {
    cache.delete(platform);
  } else {
    cache.clear();
  }
}

export function getCacheTimestamp(platform: Platform): number | null {
  const cached = cache.get(platform);
  return cached?.timestamp ?? null;
}
