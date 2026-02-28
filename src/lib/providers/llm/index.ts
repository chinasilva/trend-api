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
    private readonly model: string
  ) {}

  async generate(input: GenerateWithLLMInput): Promise<LLMGeneratedDraft> {
    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
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
      throw new Error(`LLM request failed: ${response.status} ${text}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };

    const rawContent = json.choices?.[0]?.message?.content?.trim();
    if (!rawContent) {
      throw new Error('LLM returned empty content.');
    }

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
      model: json.model ?? this.model,
      raw: json,
    };
  }
}

export function getLLMProvider(): LLMProvider {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';

  if (!apiKey) {
    return new TemplateFallbackProvider();
  }

  return new OpenAICompatibleProvider(apiKey, baseUrl, model);
}
