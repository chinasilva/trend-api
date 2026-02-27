'use client';

import { Platform, PLATFORMS, PLATFORM_CONFIGS } from '@/types/trend';

interface PlatformTabsProps {
  activePlatform: Platform | 'all';
  onPlatformChange: (platform: Platform | 'all') => void;
}

export default function PlatformTabs({ activePlatform, onPlatformChange }: PlatformTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      <button
        onClick={() => onPlatformChange('all')}
        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
          activePlatform === 'all'
            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
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
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activePlatform === platform
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <span>{config.icon}</span>
            <span>{config.name}</span>
          </button>
        );
      })}
    </div>
  );
}
