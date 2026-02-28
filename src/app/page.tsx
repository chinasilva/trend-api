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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#000000] flex items-center justify-center selection:bg-[#007AFF] selection:text-white">
        <div className="flex flex-col items-center gap-5">
          <div className="w-10 h-10 border-[3px] border-black/10 dark:border-white/10 border-t-black/80 dark:border-t-white/80 rounded-full animate-spin"></div>
          <p className="text-gray-500 dark:text-gray-400 text-[15px] font-medium tracking-wide">加载数据中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#000000] flex items-center justify-center selection:bg-[#007AFF] selection:text-white">
        <div className="bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-2xl p-10 rounded-[2.5rem] shadow-[0_8px_40px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] border border-black/[0.04] dark:border-white/[0.05] text-center max-w-sm w-full mx-4">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-[20px] font-semibold text-gray-900 dark:text-white mb-2 tracking-tight">出现异常</h2>
          <p className="text-[15px] text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3.5 bg-black text-white dark:bg-white dark:text-black rounded-full text-[15px] font-medium hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            重新尝试
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
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#000000] selection:bg-[#007AFF] selection:text-white font-sans text-gray-900 dark:text-gray-100 pb-24">
      {/* Background decoration elements */}
      <div className="fixed top-0 left-0 w-full h-[60vh] bg-gradient-to-b from-white/80 to-transparent dark:from-white/[0.03] pointer-events-none -z-10 mix-blend-overlay"></div>
      
      <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-10 py-16 lg:py-20">
        <header className="mb-16 text-center">
          <h1 className="text-[40px] sm:text-[56px] font-bold tracking-tight text-black dark:text-white mb-5 drop-shadow-sm leading-tight">
            全网热榜聚合
          </h1>
          <p className="text-[17px] sm:text-[19px] text-gray-500 dark:text-gray-400 font-medium tracking-wide flex items-center justify-center gap-3 flex-wrap">
            感知数据脉搏
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700"></span>
            更新于 {(trendsData?.snapshotAt || trendsData?.updatedAt)
              ? formatDateParts(trendsData?.snapshotAt || trendsData?.updatedAt || '').fullLabel
              : '未知时间'}
          </p>
        </header>

        <div className="mb-10 flex justify-center">
          <div className="inline-flex rounded-full border border-black/[0.08] bg-white/80 p-1 shadow-sm dark:border-white/[0.12] dark:bg-[#1c1c1e]/80">
            <button
              type="button"
              onClick={() => setActiveMode('trends')}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                activeMode === 'trends'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-black hover:bg-black/[0.03] dark:text-white dark:hover:bg-white/[0.06]'
              }`}
            >
              热榜浏览
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('content')}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                activeMode === 'content'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-black hover:bg-black/[0.03] dark:text-white dark:hover:bg-white/[0.06]'
              }`}
            >
              内容生产
            </button>
          </div>
        </div>

        {activeMode === 'content' && (
          <div className="mb-14 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            <div className="mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
              基于实时热榜数据同步机会、生成草稿并提交公众号发布任务
            </div>
            <ContentPipelinePanel />
          </div>
        )}

        {activeMode === 'trends' && (
          <>
            <section className="mb-14 max-w-5xl mx-auto bg-white/70 dark:bg-[#1c1c1e]/70 backdrop-blur-3xl border border-black/[0.04] dark:border-white/[0.05] rounded-[2.5rem] p-7 lg:p-10 shadow-[0_8px_40px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_40px_rgb(0,0,0,0.2)] transition-all">
              <div className="flex items-center justify-between gap-4 mb-8">
                <h2 className="text-[19px] font-semibold tracking-tight text-black dark:text-white flex items-center gap-2.5">
                  <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  历史快照穿越
                </h2>
                {snapshotLoading && (
                  <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-black/[0.03] dark:bg-white/[0.05] rounded-full backdrop-blur-md">
                    <div className="w-3.5 h-3.5 border-2 border-black/20 dark:border-white/20 border-t-black dark:border-t-white rounded-full animate-spin"></div>
                    <span className="text-[13px] font-medium text-gray-600 dark:text-gray-300 tracking-wide">加载中...</span>
                  </div>
                )}
              </div>

              {timelineError && (
                <div className="p-4 bg-red-50 dark:bg-red-500/10 rounded-2xl mb-6 border border-red-100 dark:border-red-500/20">
                  <p className="text-[14px] text-red-600 dark:text-red-400 font-medium">{timelineError}</p>
                </div>
              )}

              {!timelineError && timelineItems.length === 0 && (
                <div className="py-12 text-center bg-black/[0.02] dark:bg-white/[0.02] rounded-3xl border border-black/[0.02] dark:border-white/[0.02]">
                  <p className="text-[15px] font-medium text-gray-500 dark:text-gray-400">
                    {timelineLoading ? '正在检索历史线索...' : '暂无历史快照记录'}
                  </p>
                </div>
              )}

              {timelineItems.length > 0 && (
                <>
                  <div className="grid gap-3.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {timelineItems.map((item) => {
                      const active = toSnapshotKey(item.snapshotAt) === selectedSnapshotKey;
                      const formattedDate = formatDateParts(item.snapshotAt);
                      return (
                        <button
                          key={item.snapshotAt}
                          onClick={() => void handleSelectSnapshot(item.snapshotAt)}
                          disabled={snapshotLoading}
                          className={`text-left rounded-2xl px-4 py-3.5 transition-all duration-300 flex flex-col gap-1.5 group ${
                            active
                              ? 'bg-black text-white dark:bg-white dark:text-black shadow-lg scale-100 ring-1 ring-black/5 dark:ring-white/5'
                              : 'bg-white/80 dark:bg-[#2c2c2e]/80 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-[#3a3a3c] shadow-sm hover:shadow-md border border-black/[0.03] dark:border-white/[0.04]'
                          } ${snapshotLoading && !active ? 'opacity-50 cursor-not-allowed grayscale-[0.3]' : ''}`}
                        >
                          <p className={`text-[14px] font-semibold tracking-wide transition-colors ${active ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white group-hover:text-black dark:group-hover:text-white'}`}>
                            {formattedDate.datePart} <br />
                            <span className="text-[12px] opacity-80 font-medium">{formattedDate.timePart}</span>
                          </p>
                          <p className={`text-[12px] font-medium mt-1 ${active ? 'text-white/70 dark:text-black/70' : 'text-gray-500 dark:text-gray-400'}`}>
                            {item.count} 条记录
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {timelinePagination && timelinePagination.totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-between border-t border-black/[0.04] dark:border-white/[0.05] pt-6">
                      <p className="text-[13px] font-medium text-gray-400 dark:text-gray-500 tracking-wide bg-black/[0.03] dark:bg-white/[0.05] px-3 py-1.5 rounded-full">
                        第 {timelinePagination.page} 页，共 {Math.max(timelinePagination.totalPages, 1)} 页
                      </p>
                      <div className="flex gap-2.5">
                        <button
                          onClick={() => void handleTimelinePageChange(timelinePagination.page - 1)}
                          disabled={!timelinePagination.hasPrev || timelineLoading}
                          className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-[#2c2c2e] shadow-sm border border-black/[0.04] dark:border-white/[0.05] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#3a3a3c] hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-sm transition-all"
                          aria-label="Previous page"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => void handleTimelinePageChange(timelinePagination.page + 1)}
                          disabled={!timelinePagination.hasNext || timelineLoading}
                          className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-[#2c2c2e] shadow-sm border border-black/[0.04] dark:border-white/[0.05] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#3a3a3c] hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-sm transition-all"
                          aria-label="Next page"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
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

            <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
              {renderContent()}
            </div>
          </>
        )}

        <footer className="mt-24 text-center">
          <p className="text-[13px] font-medium tracking-wider text-gray-400 dark:text-gray-500 uppercase flex items-center justify-center gap-2">
            <span>Powered by Next.js</span>
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700"></span>
            <span>Data from open sources</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
