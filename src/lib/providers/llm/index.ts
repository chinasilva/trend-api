export interface GenerateWithLLMInput {
  systemPrompt: string;
  userPrompt: string;
  topicTitle: string;
  accountName: string;
}

export interface LLMGeneratedDraft {
  title: string;
  outline: string[];
  content: string;
  model: string;
  raw?: unknown;
}

export interface LLMProvider {
  generate(input: GenerateWithLLMInput): Promise<LLMGeneratedDraft>;
}

type LLMApiStyle = 'chat-completions' | 'responses';
type LLMAuthMode = 'bearer' | 'api-key';

class LLMHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`LLM request failed: ${status} ${body}`);
    this.name = 'LLMHttpError';
  }
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim());
}

function extractJsonText(raw: string) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }

  return raw;
}

function parseGeneratedDraft(rawContent: string, raw: unknown, model: string): LLMGeneratedDraft {
  const parsedText = extractJsonText(rawContent);
  const parsed = JSON.parse(parsedText) as {
    title?: string;
    outline?: unknown;
    content?: string;
  };

  if (!parsed.title || !parsed.content) {
    throw new Error('LLM response is missing title/content.');
  }

  return {
    title: parsed.title,
    outline: toStringArray(parsed.outline),
    content: parsed.content,
    model,
    raw,
  };
}

function extractResponsesText(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as Record<string, unknown>;
  if (typeof value.output_text === 'string' && value.output_text.trim()) {
    return value.output_text.trim();
  }

  const output = Array.isArray(value.output) ? value.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const block of content) {
      if (!block || typeof block !== 'object') {
        continue;
      }

      const text = (block as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim()) {
        return text.trim();
      }
    }
  }

  return null;
}

class TemplateFallbackProvider implements LLMProvider {
  async generate(input: GenerateWithLLMInput): Promise<LLMGeneratedDraft> {
    const outline = ['开场钩子', '热点事实与证据', '观点拆解', '行动建议'];
    const content = [
      `# ${input.topicTitle}`,
      '',
      '## 开场钩子',
      `今天围绕“${input.topicTitle}”的讨论正在加速升温，值得在第一时间解释其核心影响。`,
      '',
      '## 热点事实与证据',
      '- 多平台热榜出现同题信号，具备共振传播条件。',
      '- 结合时间线与排名变化，当前话题仍在上行窗口。',
      '',
      '## 观点拆解',
      '把热点拆成“发生了什么、为什么重要、普通人如何行动”三层结构，更容易形成高完读率。',
      '',
      '## 行动建议',
      '建议评论区收集读者观点，下一篇用问答形式承接，形成连续选题。',
    ].join('\n');

    return {
      title: `【${input.topicTitle}】今天到底发生了什么？`,
      outline,
      content,
      model: 'template-fallback',
      raw: null,
    };
  }
}

class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiStyle: LLMApiStyle,
    private readonly authMode: LLMAuthMode
  ) {}

  private buildHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.authMode === 'api-key') {
      headers['x-api-key'] = this.apiKey;
      headers['x-goog-api-key'] = this.apiKey;
      headers['api-key'] = this.apiKey;
    } else {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  private buildEndpoint(path: '/chat/completions' | '/responses') {
    const normalized = this.baseUrl.replace(/\/$/, '');
    if (normalized.endsWith('/chat/completions') || normalized.endsWith('/responses')) {
      return normalized;
    }

    return `${normalized}${path}`;
  }

  private async callChatCompletions(input: GenerateWithLLMInput) {
    const endpoint = this.buildEndpoint('/chat/completions');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: input.systemPrompt },
          {
            role: 'user',
            content: `${input.userPrompt}\n\n请只输出 JSON：{"title":"","outline":[""],"content":""}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new LLMHttpError(response.status, text);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };

    const rawContent = json.choices?.[0]?.message?.content?.trim();
    if (!rawContent) {
      throw new Error('LLM returned empty content.');
    }

    return parseGeneratedDraft(rawContent, json, json.model ?? this.model);
  }

  private async callResponses(input: GenerateWithLLMInput) {
    const endpoint = this.buildEndpoint('/responses');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.4,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: input.systemPrompt }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `${input.userPrompt}\n\n请只输出 JSON：{"title":"","outline":[""],"content":""}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new LLMHttpError(response.status, text);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const rawContent = extractResponsesText(json);

    if (!rawContent) {
      throw new Error('LLM responses API returned empty content.');
    }

    const responseModel = typeof json.model === 'string' ? json.model : this.model;
    return parseGeneratedDraft(rawContent, json, responseModel);
  }

  async generate(input: GenerateWithLLMInput): Promise<LLMGeneratedDraft> {
    if (this.apiStyle === 'responses') {
      try {
        return await this.callResponses(input);
      } catch (error) {
        if (error instanceof LLMHttpError && error.status === 404) {
          return this.callChatCompletions(input);
        }
        throw error;
      }
    }

    try {
      return await this.callChatCompletions(input);
    } catch (error) {
      if (error instanceof LLMHttpError && error.status === 404) {
        return this.callResponses(input);
      }
      throw error;
    }
  }
}

export function getLLMProvider(): LLMProvider {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
  const rawApiStyle = (process.env.LLM_API_STYLE ?? 'chat-completions').toLowerCase();
  const apiStyle: LLMApiStyle =
    rawApiStyle === 'responses' || rawApiStyle === 'openai-responses'
      ? 'responses'
      : 'chat-completions';
  const rawAuthMode = (process.env.LLM_AUTH_MODE ?? 'bearer').toLowerCase();
  const authMode: LLMAuthMode = rawAuthMode === 'api-key' ? 'api-key' : 'bearer';
  const strictRaw = process.env.LLM_STRICT_MODE;
  const strictMode =
    strictRaw === undefined ? process.env.NODE_ENV === 'production' : strictRaw === 'true';

  if (!apiKey) {
    if (strictMode) {
      throw new Error(
        'LLM_API_KEY is required in strict mode. Set LLM_API_KEY or disable LLM_STRICT_MODE.'
      );
    }

    return new TemplateFallbackProvider();
  }

  return new OpenAICompatibleProvider(apiKey, baseUrl, model, apiStyle, authMode);
}
