import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';

export async function fetchDouyin(): Promise<TrendItem[]> {
  return fetchTianApi({
    key: process.env.TIANAPI_KEY || '',
    path: '/douyinhot/index',
    transform: (data: unknown) => {
      const list = data as Array<{
        hotword: string;
        hotwordnum: string;
        hotindex: number;
        url: string;
        word: string;
      }>;
      return list.map((item, index) => ({
        title: item.hotword || item.word,
        hotValue: parseInt(item.hotwordnum) || item.hotindex || undefined,
        url: item.url,
        rank: index + 1,
      }));
    },
  });
}
