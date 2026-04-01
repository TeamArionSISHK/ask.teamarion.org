import fs from 'node:fs/promises';
import path from 'node:path';
const rootDir = process.cwd();
const logPath = process.env.ASK_ARION_PROMPT_LOG_PATH
  ? path.resolve(process.env.ASK_ARION_PROMPT_LOG_PATH)
  : path.join(rootDir, 'runtime', 'prompt-audit.log');

let writeQueue = Promise.resolve();

export interface PromptAuditEntry {
  timestamp: string;
  route: '/api/chat' | '/api/chat/stream';
  mode: 'non-stream' | 'stream';
  conversationId: string;
  prompt: string;
  ip: string;
  forwardedFor?: string;
  userAgent?: string;
  acceptLanguage?: string;
  referer?: string;
  host?: string;
}

function formatValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : '-';
}

function formatEntry(entry: PromptAuditEntry) {
  return [
    '================================================================================',
    `Timestamp: ${entry.timestamp}`,
    `Route: ${entry.route}`,
    `Mode: ${entry.mode}`,
    `Conversation ID: ${entry.conversationId}`,
    `IP: ${formatValue(entry.ip)}`,
    `Forwarded For: ${formatValue(entry.forwardedFor)}`,
    `User Agent: ${formatValue(entry.userAgent)}`,
    `Accept-Language: ${formatValue(entry.acceptLanguage)}`,
    `Referer: ${formatValue(entry.referer)}`,
    `Host: ${formatValue(entry.host)}`,
    'Prompt:',
    entry.prompt.trim(),
    '',
  ].join('\n');
}

export function getPromptAuditLogPath() {
  return logPath;
}

export function appendPromptAuditLog(entry: PromptAuditEntry) {
  writeQueue = writeQueue
    .then(async () => {
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      await fs.appendFile(logPath, formatEntry(entry), 'utf8');
    })
    .catch((error) => {
      console.error('Failed to write Ask Arion prompt audit log.', error);
    });

  return writeQueue;
}
