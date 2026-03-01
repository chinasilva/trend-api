import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { parseDraftMetadata } from '@/lib/pipeline/draft-metadata';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

function toStringArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    const { id } = await params;

    const draft = await prisma.draft.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            platform: true,
          },
        },
        opportunity: {
          include: {
            topicCluster: {
              select: {
                id: true,
                title: true,
                resonanceCount: true,
                growthScore: true,
                latestSnapshotAt: true,
              },
            },
          },
        },
        publishJobs: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!draft) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'DRAFT_NOT_FOUND',
          message: 'Draft not found.',
        },
        { status: 404 }
      );
    }

    const metadata = parseDraftMetadata(draft.metadata as Prisma.JsonValue | null | undefined);

    return NextResponse.json({
      success: true,
      data: {
        id: draft.id,
        title: draft.title,
        content: draft.content,
        outline: toStringArray(draft.outline as Prisma.JsonValue | null | undefined),
        templateVersion: draft.templateVersion,
        model: draft.model,
        status: draft.status,
        riskLevel: draft.riskLevel,
        riskScore: draft.riskScore,
        qualityReport: metadata.qualityReport,
        contentPack: metadata.contentPack,
        imagePlaceholders: metadata.imagePlaceholders,
        generationTrace: metadata.generationTrace,
        regeneration: metadata.regeneration,
        createdAt: draft.createdAt.toISOString(),
        updatedAt: draft.updatedAt.toISOString(),
        account: draft.account,
        opportunity: {
          id: draft.opportunity.id,
          score: draft.opportunity.score,
          status: draft.opportunity.status,
          topicCluster: {
            ...draft.opportunity.topicCluster,
            latestSnapshotAt: draft.opportunity.topicCluster.latestSnapshotAt.toISOString(),
          },
        },
        publishJobs: draft.publishJobs.map((job) => ({
          id: job.id,
          provider: job.provider,
          status: job.status,
          deliveryStage: job.deliveryStage === 'PUBLISHED' ? 'published' : 'draftbox',
          attempt: job.attempt,
          externalId: job.externalId,
          errorMessage: job.errorMessage,
          queuedAt: job.queuedAt.toISOString(),
          startedAt: job.startedAt?.toISOString() || null,
          finishedAt: job.finishedAt?.toISOString() || null,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        errorCode: 'DRAFT_FETCH_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
