import { OpportunityStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getLLMProvider } from '@/lib/providers/llm';
import { buildWechatDraftPrompt, unpackTopicClusterData } from '@/lib/pipeline/template-service';
import { evaluateDraftRisk } from '@/lib/pipeline/risk-service';
import type { DraftGenerationResult } from '@/types/pipeline';

function resolveRiskPolicy() {
  const raw = (process.env.RISK_POLICY ?? 'balanced').toLowerCase();
  if (raw === 'strict' || raw === 'growth' || raw === 'balanced') {
    return raw;
  }

  return 'balanced';
}

export async function generateDraftFromOpportunity(opportunityId: string): Promise<DraftGenerationResult> {
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

  const clusterData = unpackTopicClusterData(opportunity.topicCluster);
  const prompt = buildWechatDraftPrompt({
    accountName: opportunity.account.name,
    categories: opportunity.account.categories.map((entry) => entry.category.name),
    topicTitle: opportunity.topicCluster.title,
    resonanceCount: opportunity.topicCluster.resonanceCount,
    growthScore: opportunity.topicCluster.growthScore,
    keywords: clusterData.keywords,
    evidences: clusterData.evidences,
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

  const draft = await prisma.draft.create({
    data: {
      opportunityId: opportunity.id,
      accountId: opportunity.accountId,
      title: generated.title,
      outline: generated.outline as Prisma.InputJsonValue,
      content: generated.content,
      templateVersion: prompt.templateVersion,
      model: generated.model,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      status: risk.suggestedStatus,
      metadata: {
        riskReasons: risk.reasons,
        promptVersion: prompt.templateVersion,
      } as Prisma.InputJsonValue,
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
