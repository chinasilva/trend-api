import { DraftStatus, OpportunityStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getLLMProvider } from '@/lib/providers/llm';
import {
  buildWechatDraftPrompt,
  unpackTopicClusterData,
} from '@/lib/pipeline/template-service';
import { evaluateDraftRisk } from '@/lib/pipeline/risk-service';
import {
  buildContentPack,
  buildImagePlaceholders,
  buildQualityReport,
  parseDraftMetadata,
} from '@/lib/pipeline/draft-metadata';
import {
  getOrCreateAccountProfile,
  mergeProfile,
} from '@/lib/pipeline/profile-service';
import type {
  AccountProfileInput,
  DraftGenerationResult,
  DraftGenerationTrace,
  DraftImagePlaceholder,
} from '@/types/pipeline';

export interface GenerateDraftOptions {
  profileOverride?: Partial<AccountProfileInput>;
  regenerateFromDraftId?: string;
}

function resolveRiskPolicy() {
  const raw = (process.env.RISK_POLICY ?? 'balanced').toLowerCase();
  if (raw === 'strict' || raw === 'growth' || raw === 'balanced') {
    return raw;
  }

  return 'balanced';
}

function toStringArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim());
}

function buildGenerationTrace(params: {
  topicScore: number;
  profile: AccountProfileInput;
  content: string;
  qualityScore: number;
}): DraftGenerationTrace {
  const accountFitSignals = [params.profile.audience, params.profile.growthGoal, params.profile.tone]
    .filter(Boolean)
    .reduce((count, token) => (params.content.includes(token.slice(0, 8)) ? count + 1 : count), 0);

  const accountFit = Math.min(100, 40 + accountFitSignals * 18);
  const modelScore = Math.min(100, Math.max(20, Math.round(params.qualityScore * 0.92)));
  const fusionScore = Math.round(params.topicScore * 0.4 + modelScore * 0.6);

  return {
    topicScore: Math.round(params.topicScore),
    accountFit,
    modelScore,
    fusionScore,
  };
}

function normalizeImagePlanCount(raw: number | undefined) {
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return 4;
  }

  return Math.min(5, Math.max(3, Math.round(raw)));
}

export async function generateDraftFromOpportunity(
  opportunityId: string,
  options: GenerateDraftOptions = {}
): Promise<DraftGenerationResult> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      account: {
        include: {
          categories: {
            include: {
              category: true,
            },
          },
        },
      },
      topicCluster: true,
    },
  });

  if (!opportunity) {
    throw new Error(`Opportunity not found: ${opportunityId}`);
  }

  let parentDraft:
    | {
        id: string;
        title: string;
        outline: Prisma.JsonValue | null;
        regenerationIndex: number;
      }
    | null = null;

  if (options.regenerateFromDraftId) {
    parentDraft = await prisma.draft.findUnique({
      where: {
        id: options.regenerateFromDraftId,
      },
      select: {
        id: true,
        title: true,
        outline: true,
        regenerationIndex: true,
      },
    });

    if (!parentDraft) {
      throw new Error('Parent draft not found for regeneration.');
    }
  }

  const profile = await getOrCreateAccountProfile(opportunity.accountId);
  const mergedProfile = mergeProfile(profile, options.profileOverride);

  const clusterData = unpackTopicClusterData(opportunity.topicCluster);
  const prompt = buildWechatDraftPrompt({
    accountName: opportunity.account.name,
    categories: opportunity.account.categories.map((entry) => entry.category.name),
    topicTitle: opportunity.topicCluster.title,
    resonanceCount: opportunity.topicCluster.resonanceCount,
    growthScore: opportunity.topicCluster.growthScore,
    keywords: clusterData.keywords,
    evidences: clusterData.evidences,
    profile: mergedProfile,
    previousDraft: parentDraft
      ? {
          title: parentDraft.title,
          outline: toStringArray(parentDraft.outline),
        }
      : undefined,
  });

  const provider = getLLMProvider();
  const generated = await provider.generate({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    topicTitle: opportunity.topicCluster.title,
    accountName: opportunity.account.name,
  });

  const risk = evaluateDraftRisk({
    title: generated.title,
    content: generated.content,
    policy: resolveRiskPolicy(),
  });

  const contentPack = buildContentPack({
    topicTitle: opportunity.topicCluster.title,
    accountName: opportunity.account.name,
    profile: mergedProfile,
    outline: generated.outline,
  });

  const qualityReport = buildQualityReport({
    title: generated.title,
    content: generated.content,
    profile: mergedProfile,
    evidencesCount: clusterData.evidences.length,
    outlineCount: generated.outline.length,
  });

  const generationTrace = buildGenerationTrace({
    topicScore: opportunity.score,
    profile: mergedProfile,
    content: generated.content,
    qualityScore: qualityReport.score,
  });

  const imagePlaceholders = buildImagePlaceholders({
    title: generated.title,
    topicTitle: opportunity.topicCluster.title,
    contentPack,
    imageCount: 4,
    stylePreset: 'news-analysis',
  });

  let status = risk.suggestedStatus;
  if (status === DraftStatus.READY && qualityReport.score < 85) {
    status = DraftStatus.REVIEW;
  }

  const draft = await prisma.draft.create({
    data: {
      opportunityId: opportunity.id,
      accountId: opportunity.accountId,
      parentDraftId: parentDraft?.id ?? null,
      regenerationIndex: parentDraft ? Number(parentDraft.regenerationIndex || 0) + 1 : 0,
      title: generated.title,
      outline: generated.outline as Prisma.InputJsonValue,
      content: generated.content,
      templateVersion: prompt.templateVersion,
      model: generated.model,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      status,
      metadata: {
        riskReasons: risk.reasons,
        promptVersion: prompt.templateVersion,
        qualityReport,
        contentPack,
        imagePlaceholders,
        generationTrace,
        profileSnapshot: mergedProfile,
        regeneration: parentDraft
          ? {
              parentDraftId: parentDraft.id,
              regenerationIndex: Number(parentDraft.regenerationIndex || 0) + 1,
              diversityChecks: ['core-angle-shift', 'hook-shift', 'structure-shift'],
            }
          : null,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: {
      status: OpportunityStatus.SELECTED,
    },
  });

  return {
    draftId: draft.id,
    title: draft.title,
    status: draft.status,
    riskLevel: draft.riskLevel,
    riskScore: draft.riskScore,
    model: draft.model,
    qualityReport,
    contentPack,
    generationTrace,
  };
}

export async function regenerateDraftById(draftId: string): Promise<DraftGenerationResult> {
  const baseDraft = await prisma.draft.findUnique({
    where: {
      id: draftId,
    },
    select: {
      id: true,
      opportunityId: true,
    },
  });

  if (!baseDraft) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  return generateDraftFromOpportunity(baseDraft.opportunityId, {
    regenerateFromDraftId: baseDraft.id,
  });
}

export async function planDraftAssets(params: {
  draftId: string;
  imageCount?: number;
  stylePreset?: string;
}): Promise<{ imagePlan: DraftImagePlaceholder[]; status: 'planned' }> {
  const draft = await prisma.draft.findUnique({
    where: {
      id: params.draftId,
    },
    include: {
      opportunity: {
        include: {
          topicCluster: true,
        },
      },
    },
  });

  if (!draft) {
    throw new Error(`Draft not found: ${params.draftId}`);
  }

  const parsed = parseDraftMetadata(draft.metadata as Prisma.JsonValue | null | undefined);

  const contentPack =
    parsed.contentPack ||
    buildContentPack({
      topicTitle: draft.opportunity.topicCluster.title,
      accountName: '账号',
      profile: {
        audience: '热点读者',
        tone: '专业',
        growthGoal: 'read',
        painPoints: ['信息过载'],
        forbiddenTopics: [],
        contentPromise: '结构化解读热点',
        ctaStyle: '评论区互动',
        preferredLength: 1800,
      },
      outline: toStringArray(draft.outline),
    });

  const imagePlan = buildImagePlaceholders({
    title: draft.title,
    topicTitle: draft.opportunity.topicCluster.title,
    contentPack,
    imageCount: normalizeImagePlanCount(params.imageCount),
    stylePreset: params.stylePreset,
  });

  const metadata =
    draft.metadata && typeof draft.metadata === 'object'
      ? ({ ...(draft.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  metadata.imagePlaceholders = imagePlan;

  await prisma.draft.update({
    where: {
      id: draft.id,
    },
    data: {
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    imagePlan,
    status: 'planned',
  };
}

export async function getDraftWithAccount(draftId: string) {
  return prisma.draft.findUnique({
    where: { id: draftId },
    include: {
      account: true,
      opportunity: true,
    },
  });
}
