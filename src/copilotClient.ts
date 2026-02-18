import { fetch as undiciFetch } from 'undici';
import { AppConfig } from './types.js';

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class CopilotClient {
  private readonly endpoint: string;

  private readonly apiKey: string;

  constructor(private readonly config: AppConfig) {
    this.endpoint = process.env.COPILOT_CHAT_COMPLETIONS_URL ?? 'https://models.inference.ai.azure.com/chat/completions';
    this.apiKey = process.env.COPILOT_API_KEY ?? process.env.GITHUB_TOKEN ?? '';
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async generateReply(params: {
    modelId: string;
    topic: string;
    agent: string;
    userInput: string;
    contextSummary: string;
    extraContext?: string;
  }): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('COPILOT_API_KEY or GITHUB_TOKEN is required for auto Copilot replies.');
    }

    const system = [
      '你是 Telegram Copilot 助手。',
      `当前 topic: ${params.topic}`,
      `当前 agent: ${params.agent}`,
      '回答要求：',
      '- 优先基于提供的上下文与证据回答；',
      '- 如果证据不足，明确说明不确定；',
      '- 输出简洁、直接，适合 Telegram 阅读。'
    ].join('\n');

    const user = [
      `会话摘要:\n${params.contextSummary || '无'}`,
      params.extraContext ? `补充上下文:\n${params.extraContext}` : '',
      `用户输入:\n${params.userInput}`
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await undiciFetch(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: params.modelId || this.config.defaultModel,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Copilot completion failed: ${response.status} ${body}`);
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('Copilot completion returned empty content.');
    }

    return text;
  }
}
