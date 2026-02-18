import { describe, expect, it } from 'vitest';
import { parseTelegramText } from '../src/topic.js';
import { AppConfig } from '../src/types.js';

const config: AppConfig = {
  telegramBotToken: 'token',
  telegramApiBase: 'https://api.telegram.org',
  replyMode: 'manual',
  pollTimeoutSeconds: 20,
  pollIntervalMs: 1200,
  sessionRetentionDays: 30,
  sessionRetentionMessages: 200,
  dbPath: ':memory:',
  defaultTopic: 'default',
  defaultAgent: 'default'
};

describe('parseTelegramText', () => {
  it('parses topic command', () => {
    const result = parseTelegramText('/topic planning', config);
    expect(result.command).toBe('topic');
    expect(result.topic).toBe('planning');
  });

  it('parses agent command', () => {
    const result = parseTelegramText('/agent gpt-5.3-codex', config);
    expect(result.command).toBe('agent');
    expect(result.agent).toBe('gpt-5.3-codex');
  });

  it('parses history command', () => {
    const result = parseTelegramText('/history database', config);
    expect(result.command).toBe('history');
    expect(result.keyword).toBe('database');
  });

  it('parses mode command', () => {
    const result = parseTelegramText('/mode auto', config);
    expect(result.command).toBe('mode');
    expect(result.mode).toBe('auto');
  });

  it('returns plain text payload', () => {
    const result = parseTelegramText('hello world', config, 'ops', 'default');
    expect(result.command).toBeUndefined();
    expect(result.topic).toBe('ops');
    expect(result.agent).toBe('default');
    expect(result.text).toBe('hello world');
  });
});
