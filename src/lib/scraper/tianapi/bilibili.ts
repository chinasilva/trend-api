import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';

export async function fetchBilibili(): Promise<TrendItem[]> {
  return fetchTianApi({
    key: process.env.TIANAPI_KEY || '',
    path: '/bilibili/hot',
    transform: (data: unknown) => {
      const list = data as Array<{
        title: string;
        bvid: string;
        description: string;
        pic: string;
        stats: { view: number };
      }>;
      return list.map((item, index) => ({
        title: item.title,
        hotValue: item.stats?.view,
        url: `https://www.bilibili.com/video/${item.bvid}`,
        description: item.description,
        thumbnail: item.pic,
        rank: index + 1,
      }));
    },
  });
}
