'use client';

import { TrendItem, Platform, PLATFORM_CONFIGS } from '@/types/trend';

interface TrendListProps {
  trends: TrendItem[];
  platform: Platform;
}

function formatHotValue(value?: number): string {
  if (!value) return '';
  if (value >= 100000000) {
    return (value / 100000000).toFixed(1) + '亿';
  }
  if (value >= 10000) {
    return (value / 10000).toFixed(1) + '万';
  }
  return value.toString();
}

export default function TrendList({ trends, platform }: TrendListProps) {
  const config = PLATFORM_CONFIGS[platform];

  if (trends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 bg-white/50 dark:bg-[#1c1c1e]/50 backdrop-blur-2xl rounded-[2rem] border border-black/[0.04] dark:border-white/[0.05]">
        <span className="text-4xl mb-4 opacity-50">{config.icon}</span>
        <span className="font-medium tracking-wide">暂无数据</span>
      </div>
    );
  }

  return (
    <div className="bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-2xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-black/[0.04] dark:border-white/[0.05] overflow-hidden transition-all duration-500 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-black/[0.04] dark:border-white/[0.05] bg-white/50 dark:bg-[#1c1c1e]/50 backdrop-blur-md">
        <span className="text-[22px] drop-shadow-sm">{config.icon}</span>
        <span className="font-semibold text-gray-900 dark:text-gray-100 tracking-tight text-[17px]">{config.name}</span>
        <span className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-gray-400 bg-black/[0.04] dark:bg-white/[0.06] px-2.5 py-1 rounded-full ml-auto uppercase">
          热榜
        </span>
      </div>
      <div className="flex flex-col p-2">
        {trends.map((item) => (
          <a
            key={item.rank}
            href={item.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 px-4 py-3.5 rounded-[1.25rem] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-all duration-300 group"
          >
            <div
              className={`flex-shrink-0 w-[34px] h-[34px] flex items-center justify-center text-[14px] font-semibold rounded-full shadow-sm transition-transform group-hover:scale-105 ${
                item.rank === 1
                  ? 'bg-gradient-to-br from-[#FFD700] to-[#FDB931] text-white shadow-[#FFD700]/30'
                  : item.rank === 2
                  ? 'bg-gradient-to-br from-[#E3E4E5] to-[#C0C1C3] text-gray-700 shadow-gray-400/20'
                  : item.rank === 3
                  ? 'bg-gradient-to-br from-[#F4A460] to-[#CD7F32] text-white shadow-[#CD7F32]/30'
                  : 'bg-black/[0.03] dark:bg-white/[0.04] text-gray-500 dark:text-gray-400 shadow-transparent'
              }`}
            >
              {item.rank}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h3 className="text-[15px] font-medium text-gray-900 dark:text-gray-100 leading-snug truncate group-hover:text-[#007AFF] dark:group-hover:text-[#0A84FF] transition-colors">
                {item.title}
              </h3>
              {item.description && (
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-1 leading-relaxed opacity-80">
                  {item.description}
                </p>
              )}
            </div>
            {item.hotValue && (
              <span className="flex-shrink-0 text-[13px] font-medium text-gray-400 dark:text-gray-500 tabular-nums bg-black/[0.02] dark:bg-white/[0.02] px-2 py-1 rounded-md">
                {formatHotValue(item.hotValue)}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
