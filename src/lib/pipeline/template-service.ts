import { Prisma } from '@prisma/client';
import { getWechatDraftPromptConfig } from '@/lib/pipeline/prompt-config';
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveLengthRange(preferredLength: number) {
  const target = clamp(Math.round(preferredLength), 900, 1300);
  const min = Math.max(800, target - 200);
  const max = Math.min(1500, target + 200);
  return {
    target,
    min,
    max,
  };
}

function renderTemplateLine(line: string, variables: Record<string, string>) {
  return line.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => variables[key] ?? '');
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
  const promptConfig = getWechatDraftPromptConfig();
  const categoryText = input.categories.length > 0 ? input.categories.join(' / ') : '通用热点解读';
  const keywordsText = input.keywords.length > 0 ? input.keywords.join('、') : '实时热点';
  const lengthRange = resolveLengthRange(input.profile.preferredLength);
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
    ? promptConfig.diversity.regenerate
        .map((line) =>
          renderTemplateLine(line, {
            previousTitle: input.previousDraft?.title ?? '',
            previousOutline: input.previousDraft?.outline.join(' / ') || '无',
          })
        )
        .join('\n')
    : promptConfig.diversity.initial;

  const generationRequirements = promptConfig.generationRequirements.map((line) =>
    renderTemplateLine(line, {
      lengthMin: String(lengthRange.min),
      lengthMax: String(lengthRange.max),
      lengthTarget: String(lengthRange.target),
    })
  );

  return {
    templateVersion: promptConfig.templateVersion,
    systemPrompt: promptConfig.systemPrompt.join('\n'),
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
      ...generationRequirements,
      '',
      diversityInstruction,
      '',
      promptConfig.outputSchemaInstruction,
    ].join('\n'),
  };
}
