import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';

export async function fetchNetworkhot(): Promise<TrendItem[]> {
  return fetchTianApi({
    key: process.env.TIANAPI_KEY || '',
    path: '/networkhot/index',
    transform: (data: unknown) => {
      const list = data as Array<{
        keyword: string;
        brief: string;
        index: string;
        trend: string;
        hotword: string;
        hotwordnum: string;
        word: string;
        hotindex: number;
        url: string;
      }>;
      return list.map((item, index) => ({
        title: item.keyword || item.hotword || item.word,
        hotValue: parseInt(item.index) || parseInt(item.hotwordnum) || item.hotindex || undefined,
        url: item.url,
        description: item.brief || undefined,
        rank: index + 1,
      }));
    },
  });
}
