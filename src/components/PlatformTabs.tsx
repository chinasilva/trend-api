'use client';

import { Platform, PLATFORMS, PLATFORM_CONFIGS } from '@/types/trend';

interface PlatformTabsProps {
  activePlatform: Platform | 'all';
  onPlatformChange: (platform: Platform | 'all') => void;
}

export default function PlatformTabs({ activePlatform, onPlatformChange }: PlatformTabsProps) {
  return (
    <div className="flex justify-center mb-10 overflow-x-auto pb-2 scrollbar-hide">
      <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <button
          onClick={() => onPlatformChange('all')}
          className={`px-5 py-2 text-[13px] font-bold rounded-lg transition-all duration-200 ${
            activePlatform === 'all'
              ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400 border border-slate-200 dark:border-slate-600'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
          }`}
        >
          ALL SOURCES
        </button>
        <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>
        <div className="flex gap-1">
          {PLATFORMS.map((platform) => {
            const config = PLATFORM_CONFIGS[platform];
            const isActive = activePlatform === platform;
            return (
              <button
                key={platform}
                onClick={() => onPlatformChange(platform)}
                className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 flex items-center gap-2 ${
                  isActive
                    ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400 border border-slate-200 dark:border-slate-600'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <span className={`text-[14px] ${isActive ? 'grayscale-0' : 'grayscale opacity-60'}`}>
                  {config.icon}
                </span>
                <span className="whitespace-nowrap uppercase">{config.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
