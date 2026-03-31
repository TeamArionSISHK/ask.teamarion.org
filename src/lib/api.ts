import type { ChatApiRequest, ChatApiResponse, RecentLogEntry } from '../types/chat';

const CHAT_REQUEST_TIMEOUT_MS = 40_000;
const NETWORK_ERROR_MESSAGE =
  'Ask Arion could not reach the server just now. Please try again in a moment.';

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
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? 'The assistant is unavailable right now.');
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
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? 'The assistant is unavailable right now.');
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
