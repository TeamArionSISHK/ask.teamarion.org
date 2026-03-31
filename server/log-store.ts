export interface RecentLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'error';
  scope: 'server' | 'chat' | 'stream';
  message: string;
  detail?: string;
}

const recentLogs: RecentLogEntry[] = [];
const MAX_RECENT_LOGS = 60;

function summarizeDetail(detail: unknown) {
  if (detail === undefined) {
    return undefined;
  }

  if (detail instanceof Error) {
    return detail.stack ?? detail.message;
  }

  if (typeof detail === 'string') {
    return detail;
  }

  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

export function addRecentLog(
  level: RecentLogEntry['level'],
  scope: RecentLogEntry['scope'],
  message: string,
  detail?: unknown,
) {
  recentLogs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    detail: summarizeDetail(detail),
  });

  if (recentLogs.length > MAX_RECENT_LOGS) {
    recentLogs.length = MAX_RECENT_LOGS;
  }
}

export function getRecentLogs() {
  return recentLogs;
}
