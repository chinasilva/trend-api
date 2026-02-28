import { Prisma } from '@prisma/client';
import type { TopicEvidence } from '@/types/pipeline';

export interface DraftTemplateInput {
  accountName: string;
  categories: string[];
  topicTitle: string;
  resonanceCount: number;
  growthScore: number;
  keywords: string[];
  evidences: TopicEvidence[];
}

export interface DraftPrompt {
  templateVersion: string;
  systemPrompt: string;
  userPrompt: string;
}

function toStringArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim());
}

function toEvidenceArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as TopicEvidence[];
  }

  const result: TopicEvidence[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const obj = item as Record<string, unknown>;
    if (typeof obj.title !== 'string' || typeof obj.platform !== 'string') {
      continue;
    }

    result.push({
      platform: obj.platform,
      title: obj.title,
      url: typeof obj.url === 'string' ? obj.url : undefined,
      rank: typeof obj.rank === 'number' ? obj.rank : 0,
      hotValue: typeof obj.hotValue === 'number' ? obj.hotValue : undefined,
      snapshotAt: typeof obj.snapshotAt === 'string' ? obj.snapshotAt : new Date().toISOString(),
    });

    if (result.length >= 8) {
      break;
    }
  }

  return result;
}

export function unpackTopicClusterData(cluster: {
  keywords: Prisma.JsonValue | null;
  evidences: Prisma.JsonValue | null;
}) {
  return {
    keywords: toStringArray(cluster.keywords),
    evidences: toEvidenceArray(cluster.evidences),
  };
}

export function buildWechatDraftPrompt(input: DraftTemplateInput): DraftPrompt {
  const categoryText = input.categories.length > 0 ? input.categories.join(' / ') : '通用热点解读';
  const keywordsText = input.keywords.length > 0 ? input.keywords.join('、') : '实时热点';
  const evidenceText = input.evidences
    .map(
      (item, index) =>
        `${index + 1}. [${item.platform}] ${item.title} (rank=${item.rank}, snapshot=${item.snapshotAt})`
    )
    .join('\n');

  return {
    templateVersion: 'wechat-v1',
    systemPrompt:
      '你是一名资深中文内容策划，擅长把实时热点写成公众号高完读率文章。输出信息必须严谨，不编造事实。',
    userPrompt: [
      `账号名称：${input.accountName}`,
      `账号赛道：${categoryText}`,
      `热点主题：${input.topicTitle}`,
      `跨平台共振数：${input.resonanceCount}`,
      `增长分：${input.growthScore.toFixed(1)}`,
      `关键词：${keywordsText}`,
      '证据链：',
      evidenceText || '- 暂无证据',
      '',
      '写作要求：',
      '1) 标题要具体，不夸张；',
      '2) 正文结构：开场钩子 -> 事实证据 -> 观点分析 -> 给读者的建议；',
      '3) 内容控制在 700-1200 字；',
      '4) 保留可复制发布的 Markdown。',
    ].join('\n'),
  };
}
