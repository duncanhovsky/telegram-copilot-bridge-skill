import { AppConfig } from './types.js';

const TOPIC_RE = /^\/topic\s+([\w\-]{1,64})$/i;
const AGENT_RE = /^\/agent\s+([\w\-.]{1,64})$/i;
const HISTORY_RE = /^\/history(?:\s+(.+))?$/i;
const MODE_RE = /^\/mode\s+(manual|auto)$/i;

export interface ParsedMessage {
  topic: string;
  agent: string;
  text: string;
  command?: 'topic' | 'agent' | 'history' | 'mode';
  mode?: 'manual' | 'auto';
  keyword?: string;
}

export function parseTelegramText(input: string | undefined, config: AppConfig, currentTopic?: string, currentAgent?: string): ParsedMessage {
  const raw = (input ?? '').trim();
  const topic = currentTopic ?? config.defaultTopic;
  const agent = currentAgent ?? config.defaultAgent;

  const topicMatch = raw.match(TOPIC_RE);
  if (topicMatch) {
    return { topic: topicMatch[1], agent, text: `Topic changed to ${topicMatch[1]}`, command: 'topic' };
  }

  const agentMatch = raw.match(AGENT_RE);
  if (agentMatch) {
    return { topic, agent: agentMatch[1], text: `Agent changed to ${agentMatch[1]}`, command: 'agent' };
  }

  const historyMatch = raw.match(HISTORY_RE);
  if (historyMatch) {
    const keyword = (historyMatch[1] ?? '').trim();
    return { topic, agent, text: 'History query', command: 'history', keyword };
  }

  const modeMatch = raw.match(MODE_RE);
  if (modeMatch) {
    return {
      topic,
      agent,
      text: `Reply mode changed to ${modeMatch[1].toLowerCase()}`,
      command: 'mode',
      mode: modeMatch[1].toLowerCase() as 'manual' | 'auto'
    };
  }

  return { topic, agent, text: raw };
}
