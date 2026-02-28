'use client';

import { useState, useEffect } from 'react';
import { Platform, PLATFORMS, TrendItem } from '@/types/trend';
import PlatformTabs from '@/components/PlatformTabs';
import TrendList from '@/components/TrendList';

interface TrendsData {
  success: boolean;
  data: Record<Platform, TrendItem[]>;
  snapshotAt?: string | null;
  updatedAt?: string | null;
  source?: string | null;
  hasData?: boolean;
  error?: string;
  message?: string;
  errorCode?: string;
}

export default function Home() {
  const [activePlatform, setActivePlatform] = useState<Platform | 'all'>('all');
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrends() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/trends');
        if (!response.ok) {
          let errorMessage = `Failed to fetch trends (${response.status})`;
          try {
            const payload = await response.json();
            errorMessage = payload.message || payload.error || errorMessage;
          } catch {
            // no-op: keep fallback error message
          }
          throw new Error(errorMessage);
        }
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || data.error || 'Failed to fetch trends');
        }
        setTrendsData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchTrends();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (!trendsData) return null;

    if (activePlatform === 'all') {
      return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PLATFORMS.map((platform) => (
            <TrendList
              key={platform}
              platform={platform}
              trends={trendsData.data[platform] || []}
            />
          ))}
        </div>
      );
    }

    return (
      <TrendList
        platform={activePlatform}
        trends={trendsData.data[activePlatform] || []}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            热榜聚合
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            汇聚全网热门资讯 更新时间：
            {(trendsData?.snapshotAt || trendsData?.updatedAt)
              ? formatDate(trendsData?.snapshotAt || trendsData?.updatedAt || '')
              : '-'}
          </p>
        </header>

        <PlatformTabs
          activePlatform={activePlatform}
          onPlatformChange={setActivePlatform}
        />

        {renderContent()}

        <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>数据来源：各平台公开热榜</p>
        </footer>
      </div>
    </div>
  );
}
