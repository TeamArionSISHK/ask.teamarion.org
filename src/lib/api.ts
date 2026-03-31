import type { ChatApiRequest, ChatApiResponse, RecentLogEntry } from '../types/chat';

const CHAT_REQUEST_TIMEOUT_MS = 40_000;
const NETWORK_ERROR_MESSAGE =
  'Ask Arion could not reach the server just now. Please try again in a moment.';

function buildHttpErrorMessage(
  status: number,
  {
    contentType,
    server,
    cfMitigated,
    jsonError,
    rawText,
  }: {
    contentType: string | null;
    server: string | null;
    cfMitigated: string | null;
    jsonError?: string;
    rawText?: string;
  },
) {
  if (jsonError?.trim()) {
    return jsonError.trim();
  }

  const normalizedContentType = contentType?.toLowerCase() ?? '';
  const normalizedServer = server?.toLowerCase() ?? '';
  const normalizedRawText = rawText?.toLowerCase() ?? '';
  const cloudflareChallenge =
    cfMitigated === 'challenge' ||
    normalizedServer.includes('cloudflare') ||
    normalizedRawText.includes('just a moment');

  if (cloudflareChallenge && status === 403) {
    return 'Ask Arion is currently behind a security check. Please refresh and try again.';
  }

  if (status === 429) {
    return 'Ask Arion is busy right now. Please try again in a moment.';
  }

  if (status >= 520 && status <= 530) {
    return 'Ask Arion hit an edge network error. Please try again in a moment.';
  }

  if (status === 502 || status === 503 || status === 504) {
    return 'Ask Arion is temporarily unavailable right now. Please try again in a moment.';
  }

  if (!normalizedContentType.includes('application/json') && rawText) {
    return `Ask Arion is unavailable right now (HTTP ${status}).`;
  }

  return `Ask Arion is unavailable right now (HTTP ${status}).`;
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get('content-type');
  const server = response.headers.get('server');
  const cfMitigated = response.headers.get('cf-mitigated');
  const rawText = await response.text().catch(() => '');

  let jsonError: string | undefined;
  if (contentType?.toLowerCase().includes('application/json') && rawText) {
    try {
      const payload = JSON.parse(rawText) as { error?: string };
      if (typeof payload.error === 'string') {
        jsonError = payload.error;
      }
    } catch {
      // Ignore parse failures and fall through to status-based messaging.
    }
  }

  return buildHttpErrorMessage(response.status, {
    contentType,
    server,
    cfMitigated,
    jsonError,
    rawText,
  });
}

export async function sendChatMessage(input: ChatApiRequest): Promise<ChatApiResponse> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return (await response.json()) as ChatApiResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Ask Arion timed out after 40 seconds. Please try again.');
    }

    if (error instanceof TypeError) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

interface StreamEventDelta {
  type: 'delta';
  delta: string;
}

interface StreamEventDone {
  type: 'done';
  payload: ChatApiResponse;
}

interface StreamEventError {
  type: 'error';
  error: string;
}

type StreamEvent = StreamEventDelta | StreamEventDone | StreamEventError;

interface StreamHandlers {
  onStart: () => void;
  onDelta: (delta: string) => void;
  onDone: (payload: ChatApiResponse) => void;
  onError: (message: string) => void;
}

export async function streamChatMessage(input: ChatApiRequest, handlers: StreamHandlers) {
  let response: Response;

  try {
    response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }

    throw error;
  }

  if (!response.ok || !response.body) {
    throw new Error(await readErrorMessage(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let started = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const event = JSON.parse(trimmed) as StreamEvent;
      if (event.type === 'delta') {
        if (!started) {
          started = true;
          handlers.onStart();
        }
        handlers.onDelta(event.delta);
      } else if (event.type === 'done') {
        handlers.onDone(event.payload);
      } else if (event.type === 'error') {
        handlers.onError(event.error);
      }
    }
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer.trim()) as StreamEvent;
    if (event.type === 'done') {
      handlers.onDone(event.payload);
    } else if (event.type === 'error') {
      handlers.onError(event.error);
    }
  }
}

export async function fetchRecentLogs() {
  const response = await fetch('/api/logs');
  if (!response.ok) {
    throw new Error('Could not load recent logs.');
  }

  const payload = (await response.json()) as { logs: RecentLogEntry[] };
  return payload.logs;
}
