import type { Prisma } from '@prisma/client';
import type {
  AccountProfileInput,
  DraftContentPack,
  DraftImagePlaceholder,
  DraftQualityReport,
} from '@/types/pipeline';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toSectionArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ title: string; goal: string }>;
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const obj = item as Record<string, unknown>;
      return {
        title: typeof obj.title === 'string' ? obj.title : '',
        goal: typeof obj.goal === 'string' ? obj.goal : '',
      };
    })
    .filter((item) => item.title);
}

function normalizeImageCount(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 4;
  }

  return Math.min(5, Math.max(3, Math.round(value)));
}

export function buildContentPack(params: {
  topicTitle: string;
  accountName: string;
  profile: AccountProfileInput;
  outline: string[];
}): DraftContentPack {
  const normalizedOutline = params.outline.length > 0
    ? params.outline.slice(0, 6)
    : ['事件背景', '事实证据', '影响分析', '行动建议'];

  const sections = normalizedOutline.map((title, index) => ({
    title,
    goal:
      index === 0
        ? '快速建立场景与阅读动机'
        : index === normalizedOutline.length - 1
          ? '给出可执行建议并引导互动'
          : '用事实和分析支撑核心观点',
  }));

  return {
    coreAngle: `${params.topicTitle} 对 ${params.profile.audience} 的现实影响`,
    targetReader: params.profile.audience,
    hook: `围绕 ${params.topicTitle}，这不是“知道发生了什么”就够了，而是要看清它如何影响你的下一步。`,
    sections,
    cta: params.profile.ctaStyle || '在评论区留下你的判断，我们将基于高赞问题做下一篇拆解。',
    followupIdeas: [
      `${params.topicTitle} 的后续变量观察清单`,
      `${params.accountName} 读者最常见问题答疑`,
      '对比历史同类事件的结果与启示',
    ],
  };
}

export function buildQualityReport(params: {
  title: string;
  content: string;
  profile: AccountProfileInput;
  evidencesCount: number;
  outlineCount: number;
}): DraftQualityReport {
  const textLength = params.content.replace(/\s+/g, '').length;
  const readability = clamp(Math.round((params.outlineCount >= 4 ? 1 : 0.7) * 100), 40, 100);
  const lengthScore = clamp(
    Math.round(100 - Math.abs(textLength - params.profile.preferredLength) / 15),
    35,
    100
  );

  const evidence = clamp(Math.round(params.evidencesCount * 18), 20, 100);

  const fitSignals = [params.profile.audience, params.profile.growthGoal, params.profile.contentPromise || '']
    .filter(Boolean)
    .reduce((count, token) => (params.content.includes(token.slice(0, 8)) ? count + 1 : count), 0);
  const accountFit = clamp(45 + fitSignals * 18, 45, 100);

  const growthSignals = ['建议', '下一步', '评论区', '关注', '行动'];
  const growthHits = growthSignals.reduce((count, item) => (params.content.includes(item) ? count + 1 : count), 0);
  const growthPotential = clamp(50 + growthHits * 10, 50, 100);

  const relevance = clamp(Math.round((lengthScore * 0.45 + accountFit * 0.55)), 40, 100);

  const score = Math.round(
    relevance * 0.24 +
      evidence * 0.2 +
      readability * 0.2 +
      growthPotential * 0.2 +
      accountFit * 0.16
  );

  const warnings: string[] = [];
  if (textLength < 1000) {
    warnings.push('内容长度偏短，建议补充分析层。');
  }
  if (params.evidencesCount < 3) {
    warnings.push('证据点不足，建议补充跨平台事实。');
  }
  if (fitSignals < 2) {
    warnings.push('账号画像命中不足，建议强化受众语境。');
  }

  return {
    score,
    dimensions: {
      relevance,
      evidence,
      readability,
      growthPotential,
      accountFit,
    },
    warnings,
  };
}

export function buildImagePlaceholders(params: {
  title: string;
  topicTitle: string;
  contentPack: DraftContentPack;
  imageCount?: number;
  stylePreset?: string;
}): DraftImagePlaceholder[] {
  const imageCount = normalizeImageCount(params.imageCount);
  const style = params.stylePreset || 'news-analysis';
  const sections = params.contentPack.sections;

  const placeholders: DraftImagePlaceholder[] = [];

  for (let index = 0; index < imageCount; index += 1) {
    const section = sections[index % Math.max(1, sections.length)] || {
      title: '核心观点',
      goal: '强化信息表达',
    };

    placeholders.push({
      slot: index + 1,
      purpose: index === 0 ? '封面图' : `内文配图-${index}`,
      prompt: `为中文热点分析文章生成${style}风格插图：主题“${params.topicTitle}”，段落“${section.title}”，突出“${section.goal}”，信息可视化，简洁专业。`,
      placementAnchor: section.title,
      altText: `${params.title} - ${section.title}`,
    });
  }

  return placeholders;
}

export function parseDraftMetadata(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== 'object') {
    return {
      qualityReport: undefined,
      contentPack: undefined,
      imagePlaceholders: undefined,
      generationTrace: undefined,
      regeneration: undefined,
    };
  }

  const value = metadata as Record<string, unknown>;
  const qualityRaw = value.qualityReport;
  const contentPackRaw = value.contentPack;
  const imageRaw = value.imagePlaceholders;

  const qualityReport =
    qualityRaw && typeof qualityRaw === 'object'
      ? {
          score:
            typeof (qualityRaw as Record<string, unknown>).score === 'number'
              ? Math.round((qualityRaw as Record<string, unknown>).score as number)
              : 0,
          dimensions: {
            relevance: Number((qualityRaw as Record<string, unknown>).dimensions && ((qualityRaw as Record<string, unknown>).dimensions as Record<string, unknown>).relevance) || 0,
            evidence: Number((qualityRaw as Record<string, unknown>).dimensions && ((qualityRaw as Record<string, unknown>).dimensions as Record<string, unknown>).evidence) || 0,
            readability: Number((qualityRaw as Record<string, unknown>).dimensions && ((qualityRaw as Record<string, unknown>).dimensions as Record<string, unknown>).readability) || 0,
            growthPotential: Number((qualityRaw as Record<string, unknown>).dimensions && ((qualityRaw as Record<string, unknown>).dimensions as Record<string, unknown>).growthPotential) || 0,
            accountFit: Number((qualityRaw as Record<string, unknown>).dimensions && ((qualityRaw as Record<string, unknown>).dimensions as Record<string, unknown>).accountFit) || 0,
          },
          warnings: toStringArray((qualityRaw as Record<string, unknown>).warnings),
        }
      : undefined;

  const contentPack =
    contentPackRaw && typeof contentPackRaw === 'object'
      ? {
          coreAngle:
            typeof (contentPackRaw as Record<string, unknown>).coreAngle === 'string'
              ? ((contentPackRaw as Record<string, unknown>).coreAngle as string)
              : '',
          targetReader:
            typeof (contentPackRaw as Record<string, unknown>).targetReader === 'string'
              ? ((contentPackRaw as Record<string, unknown>).targetReader as string)
              : '',
          hook:
            typeof (contentPackRaw as Record<string, unknown>).hook === 'string'
              ? ((contentPackRaw as Record<string, unknown>).hook as string)
              : '',
          sections: toSectionArray((contentPackRaw as Record<string, unknown>).sections),
          cta:
            typeof (contentPackRaw as Record<string, unknown>).cta === 'string'
              ? ((contentPackRaw as Record<string, unknown>).cta as string)
              : '',
          followupIdeas: toStringArray((contentPackRaw as Record<string, unknown>).followupIdeas),
        }
      : undefined;

  const imagePlaceholders = Array.isArray(imageRaw)
    ? imageRaw
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => {
          const raw = item as Record<string, unknown>;
          return {
            slot: typeof raw.slot === 'number' ? raw.slot : index + 1,
            purpose: typeof raw.purpose === 'string' ? raw.purpose : '',
            prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
            placementAnchor: typeof raw.placementAnchor === 'string' ? raw.placementAnchor : '',
            altText: typeof raw.altText === 'string' ? raw.altText : '',
          };
        })
        .filter((item) => item.prompt)
    : undefined;

  return {
    qualityReport,
    contentPack,
    imagePlaceholders,
    generationTrace:
      value.generationTrace && typeof value.generationTrace === 'object'
        ? (value.generationTrace as Record<string, unknown>)
        : undefined,
    regeneration:
      value.regeneration && typeof value.regeneration === 'object'
        ? (value.regeneration as Record<string, unknown>)
        : undefined,
  };
}
