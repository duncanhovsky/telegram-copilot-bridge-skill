import fs from 'node:fs';
import path from 'node:path';
import { fetch as undiciFetch } from 'undici';
import { AppConfig } from './types.js';

interface ChatCompletionsResponse {
  id?: string;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface GenerateReplyParams {
  modelId: string;
  topic: string;
  agent: string;
  userInput: string;
  contextSummary: string;
  extraContext?: string;
}

interface UsageLogRecord {
  timestamp: string;
  modelId: string;
  topic: string;
  agent: string;
  status: 'success' | 'failure';
  attempt: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  requestId?: string;
  error?: string;
}

export class CopilotClient {
  private readonly endpoint: string;

  private readonly apiKey: string;

  private readonly maxRetries: number;

  private readonly retryBaseMs: number;

  private readonly timeoutMs: number;

  private readonly usageLogPath: string;

  private readonly priceInputPer1M: number;

  private readonly priceOutputPer1M: number;

  constructor(private readonly config: AppConfig) {
    this.endpoint = process.env.COPILOT_CHAT_COMPLETIONS_URL ?? 'https://models.inference.ai.azure.com/chat/completions';
    this.apiKey = process.env.COPILOT_API_KEY ?? process.env.GITHUB_TOKEN ?? '';
    this.maxRetries = this.asNumber('COPILOT_MAX_RETRIES', 3, 1, 8);
    this.retryBaseMs = this.asNumber('COPILOT_RETRY_BASE_MS', 600, 100, 10000);
    this.timeoutMs = this.asNumber('COPILOT_TIMEOUT_MS', 45000, 1000, 180000);
    this.usageLogPath = process.env.COPILOT_USAGE_LOG_PATH ?? './data/copilot-usage.log';
    this.priceInputPer1M = this.asNumber('COPILOT_PRICE_INPUT_PER_1M', 0, 0, 1000);
    this.priceOutputPer1M = this.asNumber('COPILOT_PRICE_OUTPUT_PER_1M', 0, 0, 1000);

    const logDir = path.dirname(this.usageLogPath);
    fs.mkdirSync(logDir, { recursive: true });
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async generateReply(params: GenerateReplyParams): Promise<string> {
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

    const modelId = params.modelId || this.config.defaultModel;
    const startedAt = Date.now();
    let lastError = 'unknown error';

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await undiciFetch(this.endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: modelId,
            temperature: 0.2,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ]
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Copilot completion failed: ${response.status} ${body}`);
        }

        const json = (await response.json()) as ChatCompletionsResponse;
        const text = json.choices?.[0]?.message?.content?.trim();
        if (!text) {
          throw new Error('Copilot completion returned empty content.');
        }

        const usage = this.resolveUsage(json, `${system}\n\n${user}`, text);
        this.writeUsageLog({
          timestamp: new Date().toISOString(),
          modelId,
          topic: params.topic,
          agent: params.agent,
          status: 'success',
          attempt,
          latencyMs: Date.now() - startedAt,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd: this.estimateCostUsd(usage.promptTokens, usage.completionTokens),
          requestId: json.id
        });

        return text;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt >= this.maxRetries) {
          break;
        }
        await this.sleep(this.retryBaseMs * 2 ** (attempt - 1));
      }
    }

    this.writeUsageLog({
      timestamp: new Date().toISOString(),
      modelId,
      topic: params.topic,
      agent: params.agent,
      status: 'failure',
      attempt: this.maxRetries,
      latencyMs: Date.now() - startedAt,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      error: lastError
    });

    throw new Error(`Copilot generation failed after ${this.maxRetries} attempts: ${lastError}`);
  }

  private resolveUsage(response: ChatCompletionsResponse, prompt: string, completion: string): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    const promptTokens = response.usage?.prompt_tokens ?? this.estimateTokens(prompt);
    const completionTokens = response.usage?.completion_tokens ?? this.estimateTokens(completion);
    const totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;
    return { promptTokens, completionTokens, totalTokens };
  }

  private estimateTokens(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) {
      return 0;
    }
    return Math.max(1, Math.ceil(trimmed.length / 4));
  }

  private estimateCostUsd(promptTokens: number, completionTokens: number): number {
    const inputCost = (promptTokens / 1_000_000) * this.priceInputPer1M;
    const outputCost = (completionTokens / 1_000_000) * this.priceOutputPer1M;
    return Number((inputCost + outputCost).toFixed(8));
  }

  private writeUsageLog(record: UsageLogRecord): void {
    fs.appendFileSync(this.usageLogPath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  private asNumber(name: string, fallback: number, min: number, max: number): number {
    const raw = process.env[name];
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new Error(`${name} must be a finite number in [${min}, ${max}], got: ${raw}`);
    }
    return parsed;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
