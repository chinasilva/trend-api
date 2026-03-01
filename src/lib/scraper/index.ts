import type { Platform, TrendItem } from '@/types/trend';
import * as tianapi from './tianapi';
import * as dailyhot from './dailyhot';

const scraperMap: Record<Platform, () => Promise<TrendItem[]>> = {
  douyin: tianapi.fetchDouyin,
  weibo: tianapi.fetchWeibo,
  zhihu: tianapi.fetchZhihu,
  baidu: tianapi.fetchBaidu,
  networkhot: tianapi.fetchNetworkhot,
  weixin: tianapi.fetchWeixin,
  weixinarticle: tianapi.fetchWeixinArticle,
  bilibili: tianapi.fetchBilibili,
  xiaohongshu: dailyhot.fetchXiaohongshu,
  weixinvideo: dailyhot.fetchWeixinvideo,
};

export async function fetchTrends(platform: Platform): Promise<TrendItem[]> {
  const scraper = scraperMap[platform];
  if (!scraper) {
    throw new Error(`Unknown platform: ${platform}`);
  }
  return scraper();
}

export async function fetchAllTrends(): Promise<Record<Platform, TrendItem[]>> {
  const platforms = Object.keys(scraperMap) as Platform[];
  const results = await Promise.allSettled(
    platforms.map(async (platform) => {
      const data = await fetchTrends(platform);
      return { platform, data };
    })
  );

  const trends: Record<Platform, TrendItem[]> = {} as Record<Platform, TrendItem[]>;

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      trends[result.value.platform] = result.value.data;
    }
  });

  return trends;
}

export {
  fetchDouyin,
  fetchWeibo,
  fetchZhihu,
  fetchBaidu,
  fetchNetworkhot,
  fetchWeixin,
  fetchWeixinArticle,
  fetchBilibili,
} from './tianapi';
export { fetchXiaohongshu, fetchWeixinvideo } from './dailyhot';
