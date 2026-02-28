import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';
import { fetchWeixinArticle } from './weixinArticle';

export async function fetchWeixin(): Promise<TrendItem[]> {
  try {
    const hotTopics = await fetchTianApi({
      key: process.env.TIANAPI_KEY || '',
      path: '/wxhottopic/index',
      transform: (data: unknown) => {
        const list = data as Array<{
          word: string;
          index: number | string;
          hotword: string;
          url: string;
          type: string;
        }>;
        return list.map((item, index) => ({
          title: item.word || item.hotword,
          hotValue: Number(item.index) || undefined,
          url: item.url || `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(item.word || item.hotword || '')}`,
          rank: index + 1,
        }));
      },
    });

    if (hotTopics.length > 0) {
      return hotTopics;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[fetchWeixin] wxhottopic failed, fallback to wxnew:', message);
  }

  return fetchWeixinArticle();
}
