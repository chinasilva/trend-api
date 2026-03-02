// 平台类型
export type Platform =
  | 'douyin'
  | 'weibo'
  | 'zhihu'
  | 'baidu'
  | 'networkhot'
  | 'weixin'
  | 'weixinarticle'
  | 'bilibili'
  | 'xiaohongshu'
  | 'weixinvideo'
  | 'signal';

// 支持的平台列表
export const PLATFORMS: Platform[] = [
  'douyin',
  'weibo',
  'zhihu',
  'baidu',
  'networkhot',
  'weixin',
  'weixinarticle',
  'bilibili',
  'xiaohongshu',
  'weixinvideo',
  'signal',
];

// 平台配置
export interface PlatformConfig {
  platform: Platform;
  name: string;
  icon: string;
  dataSource: 'tianapi' | 'dailyhot' | 'custom' | 'signal';
}

// 平台配置映射
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  douyin: { platform: 'douyin', name: '抖音', icon: '🎵', dataSource: 'tianapi' },
  weibo: { platform: 'weibo', name: '微博', icon: '📱', dataSource: 'tianapi' },
  zhihu: { platform: 'zhihu', name: '知乎', icon: '💬', dataSource: 'tianapi' },
  baidu: { platform: 'baidu', name: '百度', icon: '🔍', dataSource: 'tianapi' },
  networkhot: { platform: 'networkhot', name: '全网热搜', icon: '🌐', dataSource: 'tianapi' },
  weixin: { platform: 'weixin', name: '微信', icon: '💙', dataSource: 'tianapi' },
  weixinarticle: { platform: 'weixinarticle', name: '微信文章', icon: '📰', dataSource: 'tianapi' },
  bilibili: { platform: 'bilibili', name: 'B站', icon: '📺', dataSource: 'custom' },
  xiaohongshu: { platform: 'xiaohongshu', name: '小红书', icon: '📕', dataSource: 'custom' },
  weixinvideo: { platform: 'weixinvideo', name: '视频号', icon: '🎬', dataSource: 'custom' },
  signal: { platform: 'signal', name: 'Signal', icon: '📡', dataSource: 'signal' },
};

// 热榜条目
export interface TrendItem {
  title: string;
  hotValue?: number;
  url?: string;
  description?: string;
  rank: number;
  thumbnail?: string;
  extra?: Record<string, unknown>;
}

// API 响应
export interface TrendsResponse {
  success: boolean;
  platform: Platform;
  data: TrendItem[];
  updatedAt: string;
  error?: string;
}

// 全部平台响应
export interface AllTrendsResponse {
  success: boolean;
  data: Record<Platform, TrendItem[]>;
  updatedAt: string;
}
