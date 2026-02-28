import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  return url.replace(/&amp;/g, '&');
}

export async function fetchWeixinArticle(): Promise<TrendItem[]> {
  return fetchTianApi({
    key: process.env.TIANAPI_KEY || '',
    path: '/wxnew/index?num=20&page=1&rand=1',
    transform: (data: unknown) => {
      const list = data as Array<{
        id?: string;
        title?: string;
        description?: string;
        url?: string;
        picurl?: string;
        ctime?: string;
        username?: string;
        wxnum?: string;
        author?: string;
      }>;

      return list.map((item, index) => ({
        title: item.title || `微信文章精选 #${index + 1}`,
        description: item.description || undefined,
        url: normalizeUrl(item.url),
        thumbnail: item.picurl || undefined,
        rank: index + 1,
        extra: {
          source: 'tianapi-wxnew',
          articleId: item.id,
          ctime: item.ctime,
          username: item.username,
          wxnum: item.wxnum,
          author: item.author,
        },
      }));
    },
  });
}
