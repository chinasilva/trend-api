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

interface TimelineItem {
  snapshotAt: string;
  count: number;
  hasData: boolean;
  source: 'snapshot';
}

interface TimelinePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

interface TimelineData {
  items: TimelineItem[];
  pagination: TimelinePagination;
}

interface TimelineResponse {
  success: boolean;
  data?: TimelineData;
  error?: string;
  message?: string;
}

function toSnapshotKey(snapshotAt: string | null | undefined) {
  if (!snapshotAt) {
    return null;
  }

  const date = new Date(snapshotAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

export default function Home() {
  const [activePlatform, setActivePlatform] = useState<Platform | 'all'>('all');
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [timelinePagination, setTimelinePagination] = useState<TimelinePagination | null>(null);
  const [selectedSnapshotKey, setSelectedSnapshotKey] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrends(options?: { snapshotAt?: string; initial?: boolean }) {
      const isInitial = options?.initial ?? false;
      const snapshotAt = options?.snapshotAt;

      if (isInitial) {
        setLoading(true);
        setError(null);
      } else {
        setSnapshotLoading(true);
        setTimelineError(null);
      }

      try {
        const params = new URLSearchParams();
        if (snapshotAt) {
          params.set('snapshotAt', snapshotAt);
        }

        const query = params.toString();
        const response = await fetch(`/api/trends${query ? `?${query}` : ''}`);
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
        setSelectedSnapshotKey(toSnapshotKey(data.snapshotAt));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        if (isInitial) {
          setError(message);
        } else {
          setTimelineError(message);
        }
      } finally {
        if (isInitial) {
          setLoading(false);
        } else {
          setSnapshotLoading(false);
        }
      }
    }

    async function fetchTimeline(page: number) {
      setTimelineLoading(true);
      setTimelineError(null);
      try {
        const response = await fetch(`/api/trends/timeline?page=${page}&pageSize=12`);
        if (!response.ok) {
          let errorMessage = `Failed to fetch timeline (${response.status})`;
          try {
            const payload = await response.json();
            errorMessage = payload.message || payload.error || errorMessage;
          } catch {
            // no-op: keep fallback error message
          }
          throw new Error(errorMessage);
        }

        const payload = await response.json() as TimelineResponse;
        if (!payload.success || !payload.data) {
          throw new Error(payload.message || payload.error || 'Failed to fetch timeline');
        }

        setTimelineItems(payload.data.items);
        setTimelinePagination(payload.data.pagination);
      } catch (err) {
        setTimelineError(err instanceof Error ? err.message : 'Failed to fetch timeline');
      } finally {
        setTimelineLoading(false);
      }
    }

    void Promise.all([
      fetchTrends({ initial: true }),
      fetchTimeline(1),
    ]);
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

  const handleSelectSnapshot = async (snapshotAt: string) => {
    const incomingSnapshotKey = toSnapshotKey(snapshotAt);
    if (!incomingSnapshotKey || incomingSnapshotKey === selectedSnapshotKey || snapshotLoading) {
      return;
    }

    setTimelineError(null);
    setSnapshotLoading(true);
    try {
      const params = new URLSearchParams({ snapshotAt });
      const response = await fetch(`/api/trends?${params.toString()}`);
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
      const data = await response.json() as TrendsData;
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to fetch trends');
      }
      setTrendsData(data);
      setSelectedSnapshotKey(toSnapshotKey(data.snapshotAt || snapshotAt));
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : 'Failed to switch snapshot');
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleTimelinePageChange = async (nextPage: number) => {
    if (timelineLoading) {
      return;
    }

    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const response = await fetch(`/api/trends/timeline?page=${nextPage}&pageSize=12`);
      if (!response.ok) {
        let errorMessage = `Failed to fetch timeline (${response.status})`;
        try {
          const payload = await response.json();
          errorMessage = payload.message || payload.error || errorMessage;
        } catch {
          // no-op: keep fallback error message
        }
        throw new Error(errorMessage);
      }

      const payload = await response.json() as TimelineResponse;
      if (!payload.success || !payload.data) {
        throw new Error(payload.message || payload.error || 'Failed to fetch timeline');
      }

      setTimelineItems(payload.data.items);
      setTimelinePagination(payload.data.pagination);
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : 'Failed to fetch timeline');
    } finally {
      setTimelineLoading(false);
    }
  };

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

        <section className="mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              历史时间线
            </h2>
            {snapshotLoading && (
              <span className="text-xs text-gray-500 dark:text-gray-400">切换中...</span>
            )}
          </div>

          {timelineError && (
            <p className="text-sm text-red-500 mb-3">{timelineError}</p>
          )}

          {!timelineError && timelineItems.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {timelineLoading ? '加载时间线中...' : '暂无历史快照'}
            </p>
          )}

          {timelineItems.length > 0 && (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {timelineItems.map((item) => {
                  const active = toSnapshotKey(item.snapshotAt) === selectedSnapshotKey;
                  return (
                    <button
                      key={item.snapshotAt}
                      onClick={() => void handleSelectSnapshot(item.snapshotAt)}
                      disabled={snapshotLoading}
                      className={`text-left rounded-md border px-3 py-2 transition-colors ${
                        active
                          ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800'
                      } ${snapshotLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      <p className="text-sm font-medium">{formatDate(item.snapshotAt)}</p>
                      <p className="text-xs opacity-80 mt-1">{item.count} 条记录</p>
                    </button>
                  );
                })}
              </div>

              {timelinePagination && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    第 {timelinePagination.page} / {Math.max(timelinePagination.totalPages, 1)} 页
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleTimelinePageChange(timelinePagination.page - 1)}
                      disabled={!timelinePagination.hasPrev || timelineLoading}
                      className="px-3 py-1.5 rounded-md text-sm border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-300"
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => void handleTimelinePageChange(timelinePagination.page + 1)}
                      disabled={!timelinePagination.hasNext || timelineLoading}
                      className="px-3 py-1.5 rounded-md text-sm border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-300"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

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
