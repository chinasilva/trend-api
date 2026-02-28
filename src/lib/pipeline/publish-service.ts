import { DraftStatus, Prisma, PublishDeliveryStage, PublishJobStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getWeChatPublisher } from '@/lib/providers/publisher';
import type { PublishJobResult } from '@/types/pipeline';

function toResult(job: {
  id: string;
  status: PublishJobStatus;
  deliveryStage: PublishDeliveryStage;
  attempt: number;
  externalId: string | null;
  errorMessage: string | null;
}): PublishJobResult {
  return {
    id: job.id,
    status: job.status,
    deliveryStage: job.deliveryStage === PublishDeliveryStage.PUBLISHED ? 'published' : 'draftbox',
    attempt: job.attempt,
    externalId: job.externalId ?? undefined,
    errorMessage: job.errorMessage,
  };
}

export async function createWechatPublishJob(params: {
  draftId: string;
  autoRun?: boolean;
}): Promise<PublishJobResult> {
  const draft = await prisma.draft.findUnique({
    where: { id: params.draftId },
    include: {
      account: true,
      opportunity: true,
    },
  });

  if (!draft) {
    throw new Error(`Draft not found: ${params.draftId}`);
  }

  if (draft.status === DraftStatus.SUBMITTED || draft.status === DraftStatus.PUBLISHED) {
    throw new Error('Draft is already submitted/published and cannot be enqueued again.');
  }

  const job = await prisma.publishJob.create({
    data: {
      accountId: draft.accountId,
      draftId: draft.id,
      provider: 'wechat',
      status: PublishJobStatus.QUEUED,
      requestPayload: {
        title: draft.title,
        content: draft.content,
      } as Prisma.InputJsonValue,
    },
  });

  if (params.autoRun === false) {
    return toResult(job);
  }

  return processPublishJob(job.id);
}

export async function processPublishJob(jobId: string): Promise<PublishJobResult> {
  const job = await prisma.publishJob.findUnique({
    where: { id: jobId },
    include: {
      draft: {
        include: {
          account: true,
          opportunity: true,
        },
      },
    },
  });

  if (!job) {
    throw new Error(`Publish job not found: ${jobId}`);
  }

  if (job.status === PublishJobStatus.SUCCESS) {
    return toResult(job);
  }

  if (job.draft.status === DraftStatus.BLOCKED) {
    const reviewed = await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: PublishJobStatus.REVIEW,
        errorMessage: 'Draft is blocked by risk policy.',
        finishedAt: new Date(),
      },
    });
    return toResult(reviewed);
  }

  if (job.draft.status === DraftStatus.REVIEW) {
    const reviewed = await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: PublishJobStatus.REVIEW,
        errorMessage: 'Draft requires manual review before publish.',
      },
    });
    return toResult(reviewed);
  }

  const running = await prisma.publishJob.update({
    where: { id: job.id },
    data: {
      status: PublishJobStatus.RUNNING,
      startedAt: new Date(),
      attempt: {
        increment: 1,
      },
      errorMessage: null,
    },
  });

  try {
    const publisher = getWeChatPublisher();
    const published = await publisher.publish({
      title: job.draft.title,
      content: job.draft.content,
      accountId: job.draft.accountId,
    });

    const success = await prisma.publishJob.update({
      where: { id: running.id },
      data: {
        status: PublishJobStatus.SUCCESS,
        deliveryStage:
          published.deliveryStage === 'published'
            ? PublishDeliveryStage.PUBLISHED
            : PublishDeliveryStage.DRAFTBOX,
        externalId: published.externalId,
        responsePayload: published.response as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });

    await prisma.draft.update({
      where: { id: job.draft.id },
      data: {
        status:
          published.deliveryStage === 'published'
            ? DraftStatus.PUBLISHED
            : DraftStatus.SUBMITTED,
      },
    });

    if (published.deliveryStage === 'published') {
      await prisma.performanceMetric.create({
        data: {
          accountId: job.draft.accountId,
          opportunityId: job.draft.opportunityId,
          draftId: job.draft.id,
          publishJobId: success.id,
          collectedAt: new Date(),
        },
      });
    }

    return toResult(success);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown publish failure.';
    const failed = await prisma.publishJob.update({
      where: { id: running.id },
      data: {
        status: PublishJobStatus.FAILED,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });

    return toResult(failed);
  }
}

export async function retryPublishJob(jobId: string, allowReview = false): Promise<PublishJobResult> {
  const job = await prisma.publishJob.findUnique({
    where: { id: jobId },
    include: {
      draft: true,
    },
  });

  if (!job) {
    throw new Error(`Publish job not found: ${jobId}`);
  }

  if (job.status === PublishJobStatus.SUCCESS) {
    throw new Error('Publish job is already successful.');
  }

  if (job.draft.status === DraftStatus.BLOCKED) {
    throw new Error('Blocked draft cannot be retried.');
  }

  if (job.draft.status === DraftStatus.REVIEW && !allowReview) {
    throw new Error('Draft is in review status. Pass allowReview=true to force publish retry.');
  }

  if (job.draft.status === DraftStatus.REVIEW && allowReview) {
    await prisma.draft.update({
      where: { id: job.draft.id },
      data: {
        status: DraftStatus.READY,
      },
    });
  }

  await prisma.publishJob.update({
    where: { id: job.id },
    data: {
      status: PublishJobStatus.QUEUED,
      errorMessage: null,
      finishedAt: null,
    },
  });

  return processPublishJob(job.id);
}
