export interface PublishInput {
  title: string;
  content: string;
  accountId: string;
}

export interface PublishOutput {
  externalId: string;
  deliveryStage: 'draftbox' | 'published';
  response: unknown;
}

export interface PublisherProvider {
  publish(input: PublishInput): Promise<PublishOutput>;
}

function resolveExternalId(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates = ['externalId', 'id', 'articleId', 'mediaId', 'publishId'];
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

class WeChatPublisherProvider implements PublisherProvider {
  async publish(input: PublishInput): Promise<PublishOutput> {
    const mode = (process.env.WECHAT_PUBLISH_MODE ?? 'draftbox').toLowerCase();
    const deliveryStage = mode === 'published' ? 'published' : 'draftbox';
    const dryRun = (process.env.WECHAT_PUBLISH_DRY_RUN ?? 'true') !== 'false';
    if (dryRun) {
      const fakeId = `wechat-dryrun-${Date.now()}`;
      return {
        externalId: fakeId,
        deliveryStage,
        response: {
          dryRun: true,
          mode: deliveryStage,
          accountId: input.accountId,
          title: input.title,
        },
      };
    }

    const endpoint = process.env.WECHAT_PUBLISH_ENDPOINT;
    const token = process.env.WECHAT_PUBLISH_TOKEN;

    if (!endpoint || !token) {
      throw new Error(
        'WeChat publish is not configured. Set WECHAT_PUBLISH_ENDPOINT and WECHAT_PUBLISH_TOKEN or enable WECHAT_PUBLISH_DRY_RUN.'
      );
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: input.title,
        content: input.content,
        accountId: input.accountId,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`WeChat publish failed: ${response.status} ${text}`);
    }

    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      // Keep raw string response when not JSON.
    }

    const externalId = resolveExternalId(parsed) ?? `wechat-${Date.now()}`;
    return { externalId, deliveryStage, response: parsed };
  }
}

export function getWeChatPublisher(): PublisherProvider {
  return new WeChatPublisherProvider();
}
