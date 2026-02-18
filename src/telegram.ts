import { z } from 'zod';
import { AppConfig, TelegramUpdate } from './types.js';

const updatesSchema = z.object({
  ok: z.boolean(),
  result: z.array(z.any())
});

const sendSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    message_id: z.number()
  })
});

export class TelegramClient {
  constructor(private readonly config: AppConfig) {}

  private endpoint(method: string): string {
    return `${this.config.telegramApiBase}/bot${this.config.telegramBotToken}/${method}`;
  }

  async getUpdates(offset?: number): Promise<TelegramUpdate[]> {
    const payload: Record<string, unknown> = {
      timeout: this.config.pollTimeoutSeconds,
      allowed_updates: ['message']
    };
    if (typeof offset === 'number') {
      payload.offset = offset;
    }

    const response = await fetch(this.endpoint('getUpdates'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Telegram getUpdates failed: ${response.status}`);
    }

    const json = await response.json();
    const parsed = updatesSchema.parse(json);
    if (!parsed.ok) {
      throw new Error('Telegram getUpdates returned ok=false');
    }

    return parsed.result as TelegramUpdate[];
  }

  async sendMessage(chatId: number, text: string): Promise<number> {
    const response = await fetch(this.endpoint('sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    });

    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed: ${response.status}`);
    }

    const json = await response.json();
    const parsed = sendSchema.parse(json);
    if (!parsed.ok) {
      throw new Error('Telegram sendMessage returned ok=false');
    }

    return parsed.result.message_id;
  }
}
