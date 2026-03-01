import { Prisma } from '@prisma/client';
import type { AccountProfileInput, TopicEvidence } from '@/types/pipeline';

export interface DraftTemplateInput {
  accountName: string;
  categories: string[];
  topicTitle: string;
  resonanceCount: number;
  growthScore: number;
  keywords: string[];
  evidences: TopicEvidence[];
  profile: AccountProfileInput;
  previousDraft?: {
    title: string;
    outline: string[];
  };
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

    if (result.length >= 10) {
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
        `${index + 1}. [${item.platform}] ${item.title} (rank=${item.rank}, snapshot=${item.snapshotAt})${item.url ? ` url=${item.url}` : ''}`
    )
    .join('\n');

  const profileText = [
    `目标读者：${input.profile.audience}`,
    `语气风格：${input.profile.tone}`,
    `增长目标：${input.profile.growthGoal}`,
    `读者痛点：${input.profile.painPoints.join('；') || '信息噪音高'}`,
    `内容承诺：${input.profile.contentPromise || '给出高信息密度的分析与行动建议'}`,
    `禁区：${input.profile.forbiddenTopics.join('；') || '禁止编造事实'}`,
    `CTA风格：${input.profile.ctaStyle || '评论互动+下篇承接'}`,
    `目标字数：${input.profile.preferredLength}`,
  ].join('\n');

  const diversityInstruction = input.previousDraft
    ? [
        '这是重生稿，必须与上一个版本保持明显差异。',
        `上稿标题：${input.previousDraft.title}`,
        `上稿大纲：${input.previousDraft.outline.join(' / ') || '无'}`,
        '要求本稿至少在“核心观点、开场路径、段落结构”中改变两项，禁止同义改写。',
      ].join('\n')
    : '这是首稿，可聚焦当前最具传播价值的分析角度。';

  return {
    templateVersion: 'wechat-v2-account-growth',
    systemPrompt: [
      '你是一名资深中文内容策略编辑。',
      '你的任务是为特定账号写一篇“能提升阅读、互动与关注转化”的热点深度稿。',
      '必须遵守：',
      '1) 事实与观点分离，不能捏造未给出的事实；',
      '2) 结构必须完整：开场钩子 -> 事实证据 -> 分析拆解 -> 行动建议 -> 互动收尾；',
      '3) 输出内容要可直接发布为 Markdown。',
    ].join('\n'),
    userPrompt: [
      `账号名称：${input.accountName}`,
      `账号赛道：${categoryText}`,
      `热点主题：${input.topicTitle}`,
      `跨平台共振数：${input.resonanceCount}`,
      `增长分：${input.growthScore.toFixed(1)}`,
      `关键词：${keywordsText}`,
      '',
      '账号定位：',
      profileText,
      '',
      '热点证据链：',
      evidenceText || '- 暂无证据',
      '',
      '生成要求：',
      '1) 标题务必具体，不用夸张词；',
      '2) 生成 1400-2200 字；',
      '3) 正文需包含至少 4 个可验证事实点（来源可内隐，不必外链展示）；',
      '4) 给出至少 2 条可执行建议；',
      '5) 结尾包含互动问题与下篇承接。',
      '',
      diversityInstruction,
      '',
      '请只输出 JSON：{"title":"","outline":[""],"content":""}',
    ].join('\n'),
  };
}
