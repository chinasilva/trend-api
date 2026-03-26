'use client';

import { useState, useEffect } from 'react';
import { Platform, PLATFORMS, TrendItem } from '@/types/trend';
import ContentPipelinePanel from '@/components/content/ContentPipelinePanel';
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

const datePartFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timePartFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatDateParts(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return {
      datePart: '-',
      timePart: '--:--',
      fullLabel: '-',
    };
  }

  const datePart = datePartFormatter.format(date).replace(/\//g, '-');
  const timePart = timePartFormatter.format(date);

  return {
    datePart,
    timePart,
    fullLabel: `${datePart} ${timePart}`,
  };
}

export default function Home() {
  const [activeMode, setActiveMode] = useState<'trends' | 'content'>('trends');
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
            // no-op
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
            // no-op
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
          // no-op
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
          // no-op
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium tracking-wide">Syncing Trends...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-center max-w-sm w-full">
          <div className="w-12 h-12 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Service Interrupted</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Retry Connection
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
      <div className="max-w-4xl mx-auto">
        <TrendList
          platform={activePlatform}
          trends={trendsData.data[activePlatform] || []}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 pb-20">
      <header className="sticky top-0 z-50 glass-effect border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
              TrendPulse <span className="font-bold tracking-normal ml-1">趋势脉动</span>
            </span>
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveMode('trends')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeMode === 'trends'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              热榜浏览
            </button>
            <button
              onClick={() => setActiveMode('content')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeMode === 'content'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              生产引擎
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
              实时趋势情报系统
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2 text-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              最后更新于: {(trendsData?.snapshotAt || trendsData?.updatedAt)
                ? formatDateParts(trendsData?.snapshotAt || trendsData?.updatedAt || '').fullLabel
                : '检索中...'}
            </p>
          </div>
        </div>

        {activeMode === 'content' ? (
          <div className="animate-in fade-in duration-500">
            <ContentPipelinePanel />
          </div>
        ) : (
          <>
            <section className="mb-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  历史快照穿越
                </h2>
                {snapshotLoading && (
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-500">
                    <div className="w-3 h-3 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    载入中
                  </div>
                )}
              </div>

              {timelineError ? (
                <div className="p-4 bg-red-50 dark:bg-red-500/10 rounded-xl text-red-600 text-xs font-bold border border-red-100 dark:border-red-500/20">
                  {timelineError}
                </div>
              ) : timelineItems.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-bold text-slate-400">暂无历史记录</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {timelineItems.map((item) => {
                      const active = toSnapshotKey(item.snapshotAt) === selectedSnapshotKey;
                      const formattedDate = formatDateParts(item.snapshotAt);
                      return (
                        <button
                          key={item.snapshotAt}
                          onClick={() => void handleSelectSnapshot(item.snapshotAt)}
                          disabled={snapshotLoading}
                          className={`text-left rounded-xl p-3 transition-all border ${
                            active
                              ? 'bg-slate-900 border-slate-900 dark:bg-white dark:border-white shadow-lg shadow-slate-200 dark:shadow-none'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          } ${snapshotLoading && !active ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className={`text-[12px] font-black leading-tight ${active ? 'text-white dark:text-slate-900' : 'text-slate-900 dark:text-white'}`}>
                            {formattedDate.datePart}
                            <div className={`text-[10px] mt-0.5 opacity-60 font-bold`}>{formattedDate.timePart}</div>
                          </div>
                          <div className={`text-[10px] font-bold mt-2 ${active ? 'text-indigo-400 dark:text-indigo-600' : 'text-slate-400'}`}>
                            {item.count} 条记录
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {timelinePagination && timelinePagination.totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] font-black text-slate-400 uppercase">
                        第 {timelinePagination.page} / {timelinePagination.totalPages} 页
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleTimelinePageChange(timelinePagination.page - 1)}
                          disabled={!timelinePagination.hasPrev || timelineLoading}
                          className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button
                          onClick={() => void handleTimelinePageChange(timelinePagination.page + 1)}
                          disabled={!timelinePagination.hasNext || timelineLoading}
                          className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
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

            <div className="mt-8">
              {renderContent()}
            </div>
          </>
        )}
      </main>

      <footer className="max-w-[1440px] mx-auto px-6 pt-12 text-center">
        <p className="text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase">
          TrendPulse 趋势情报智能引擎 © 2026
        </p>
      </footer>
    </div>
  );
}
