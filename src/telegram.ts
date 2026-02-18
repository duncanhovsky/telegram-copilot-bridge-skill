import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppConfig, TelegramUpdate } from './types.js';

const execFileAsync = promisify(execFile);

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

    const json = await this.postWithFallback('getUpdates', payload);
    const parsed = updatesSchema.parse(json);
    if (!parsed.ok) {
      throw new Error('Telegram getUpdates returned ok=false');
    }

    return parsed.result as TelegramUpdate[];
  }

  async sendMessage(chatId: number, text: string): Promise<number> {
    const json = await this.postWithFallback('sendMessage', {
      chat_id: chatId,
      text
    });
    const parsed = sendSchema.parse(json);
    if (!parsed.ok) {
      throw new Error('Telegram sendMessage returned ok=false');
    }

    return parsed.result.message_id;
  }

  private async postWithFallback(method: string, payload: Record<string, unknown>): Promise<unknown> {
    const url = this.endpoint(method);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Telegram ${method} failed: ${response.status}`);
      }

      return response.json();
    } catch {
      return this.postViaPowerShell(url, payload);
    }
  }

  private async postViaPowerShell(url: string, payload: Record<string, unknown>): Promise<unknown> {
    const body = JSON.stringify(payload).replace(/'/g, "''");
    const escapedUrl = url.replace(/'/g, "''");
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$url = '${escapedUrl}'`,
      `$body = '${body}'`,
      "$resp = Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body $body",
      "$resp | ConvertTo-Json -Depth 20 -Compress"
    ].join('; ');

    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    });

    return JSON.parse(stdout.trim());
  }
}
