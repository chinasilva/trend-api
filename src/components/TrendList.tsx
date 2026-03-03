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
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-800/60 ring-1 ring-slate-900/5">
        <span className="text-3xl mb-3 opacity-40 grayscale">{config.icon}</span>
        <span className="text-sm font-medium tracking-wide">暂无实时数据</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <span className="text-xl filter drop-shadow-sm">{config.icon}</span>
        <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight text-base leading-none">{config.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-sm uppercase">
            TRENDS
          </span>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-slate-50 dark:divide-slate-800/50">
        {trends.map((item) => (
          <a
            key={item.rank}
            href={item.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-4 px-4 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
          >
            <div
              className={`flex-shrink-0 w-7 h-7 flex items-center justify-center text-[13px] font-bold rounded-md tabular-nums transition-colors ${
                item.rank === 1
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-500/20'
                  : item.rank <= 3
                  ? 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-100 dark:border-slate-700/50'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {item.rank}
            </div>
            <div className="flex-1 min-w-0 flex flex-col pt-0.5">
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 leading-snug truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {item.title}
              </h3>
              {item.description && (
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1 leading-relaxed opacity-90">
                  {item.description}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 flex items-center pt-1">
              {item.hotValue ? (
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 tabular-nums bg-slate-50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700/50">
                  {formatHotValue(item.hotValue)}
                </span>
              ) : null}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
