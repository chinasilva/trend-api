'use client';

import { Platform, PLATFORMS, PLATFORM_CONFIGS } from '@/types/trend';

interface PlatformTabsProps {
  activePlatform: Platform | 'all';
  onPlatformChange: (platform: Platform | 'all') => void;
}

export default function PlatformTabs({ activePlatform, onPlatformChange }: PlatformTabsProps) {
  return (
    <div className="flex justify-center mb-8">
      <div className="flex flex-wrap items-center justify-center gap-1 p-1.5 bg-black/[0.03] dark:bg-white/[0.05] rounded-[2rem] backdrop-blur-xl border border-black/[0.02] dark:border-white/[0.02] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
        <button
          onClick={() => onPlatformChange('all')}
          className={`px-5 py-2.5 rounded-full text-[14px] font-medium transition-all duration-300 ${
            activePlatform === 'all'
              ? 'bg-white text-black shadow-sm dark:bg-[#1c1c1e] dark:text-white dark:shadow-[0_1px_2px_rgba(0,0,0,0.5)] border border-black/[0.04] dark:border-white/[0.04] scale-100'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] scale-[0.98]'
          }`}
        >
          全部平台
        </button>
        {PLATFORMS.map((platform) => {
          const config = PLATFORM_CONFIGS[platform];
          return (
            <button
              key={platform}
              onClick={() => onPlatformChange(platform)}
              className={`px-5 py-2.5 rounded-full text-[14px] font-medium transition-all duration-300 flex items-center gap-2 ${
                activePlatform === platform
                  ? 'bg-white text-black shadow-sm dark:bg-[#1c1c1e] dark:text-white dark:shadow-[0_1px_2px_rgba(0,0,0,0.5)] border border-black/[0.04] dark:border-white/[0.04] scale-100'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] scale-[0.98]'
              }`}
            >
              <span className={`text-[15px] transition-opacity ${activePlatform === platform ? 'opacity-100' : 'opacity-70'}`}>
                {config.icon}
              </span>
              <span>{config.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
