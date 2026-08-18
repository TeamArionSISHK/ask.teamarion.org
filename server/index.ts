import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { appendConversationTurn, getConversationContext } from './conversation-store.js';
import { imageAssets } from './data/imageMap.js';
import { addRecentLog, getRecentLogs } from './log-store.js';
import { askOpenRouter, streamOpenRouter } from './openrouter.js';
import { appendPromptAuditLog, getPromptAuditLogPath } from './prompt-audit.js';

const rootDir = process.cwd();
const clientDistDir = path.resolve(rootDir, 'dist');
const publicDir = path.resolve(rootDir, 'public');
const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const defaultAllowedOrigins = [
  'https://ask.teamarion.org',
  'https://teamarion.org',
  'https://www.teamarion.org',
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4179',
  'http://127.0.0.1:4179',
];
const allowedOrigins = new Set(
  (process.env.ASK_ARION_ALLOWED_ORIGINS?.split(',') ?? defaultAllowedOrigins)
    .map((value) => value.trim())
    .filter(Boolean),
);
const allowedHosts = new Set(
  Array.from(allowedOrigins)
    .map((value) => {
      try {
        return new URL(value).host;
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value)),
);
const rateLimitWindowMs = Number.parseInt(process.env.ASK_ARION_RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const rateLimitMaxRequests = Number.parseInt(
  process.env.ASK_ARION_RATE_LIMIT_MAX_REQUESTS ?? '24',
  10,
);
const rateLimitBuckets = new Map<string, number[]>();

const requestSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  conversationId: z.string().trim().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/images', express.static(path.join(publicDir, 'images')));
app.use('/api', corsMiddleware);
app.use('/api', apiProtectionMiddleware);

function getClientIp(request: Request) {
  const cfIp = request.header('cf-connecting-ip')?.trim();
  if (cfIp) {
    return cfIp;
  }

  const forwardedFor = request.header('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor
      .split(',')
      .map((part) => part.trim())
      .find(Boolean);
    if (firstIp) {
      return firstIp;
    }
  }

  return request.header('x-real-ip')?.trim() || request.socket.remoteAddress || '-';
}

function isLoopbackIp(value: string) {
  return (
    value === '127.0.0.1' ||
    value === '::1' ||
    value === '::ffff:127.0.0.1' ||
    value === 'localhost'
  );
}

function extractOriginCandidate(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function resolveAllowedCorsOrigin(request: Request) {
  const origin = extractOriginCandidate(request.header('origin') ?? undefined);
  return origin && allowedOrigins.has(origin) ? origin : null;
}

function applyCorsHeaders(request: Request, response: Response) {
  const origin = resolveAllowedCorsOrigin(request);
  if (!origin) {
    return;
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Max-Age', '86400');
}

function corsMiddleware(request: Request, response: Response, next: NextFunction) {
  applyCorsHeaders(request, response);

  if (request.method !== 'OPTIONS') {
    next();
    return;
  }

  if (resolveAllowedCorsOrigin(request) || !request.header('origin')) {
    response.status(204).end();
    return;
  }

  rejectJson(response, 403, 'Ask Arion blocked this request because the origin is not allowed.');
}

function looksLikeBrowserUserAgent(value: string | undefined) {
  const normalized = value?.toLowerCase() ?? '';
  if (!normalized) {
    return false;
  }

  return /(mozilla|chrome|safari|firefox|edg|opera|opr|mobile|webkit)/.test(normalized);
}

function isAllowedOriginRequest(request: Request) {
  const origin = extractOriginCandidate(request.header('origin') ?? undefined);
  const referer = extractOriginCandidate(request.header('referer') ?? undefined);
  const host = request.header('host')?.trim().toLowerCase() ?? '';
  const userAgent = request.header('user-agent') ?? undefined;

  if (origin && allowedOrigins.has(origin)) {
    return true;
  }

  if (referer && allowedOrigins.has(referer)) {
    return true;
  }

  if (!origin && !referer && isLoopbackIp(getClientIp(request))) {
    return true;
  }

  if (!origin && !referer && host && allowedHosts.has(host) && looksLikeBrowserUserAgent(userAgent)) {
    return true;
  }

  return false;
}

function rejectJson(response: Response, status: number, error: string, retryAfterSeconds?: number) {
  if (retryAfterSeconds) {
    response.setHeader('Retry-After', String(retryAfterSeconds));
  }

  response.status(status).json({ error });
}

function applyRateLimit(request: Request) {
  const now = Date.now();
  const key = getClientIp(request);
  const recentHits = (rateLimitBuckets.get(key) ?? []).filter(
    (timestamp) => now - timestamp < rateLimitWindowMs,
  );

  if (recentHits.length >= rateLimitMaxRequests) {
    rateLimitBuckets.set(key, recentHits);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recentHits[0] + rateLimitWindowMs - now) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  recentHits.push(now);
  rateLimitBuckets.set(key, recentHits);
  return { allowed: true, retryAfterSeconds: 0 };
}

function apiProtectionMiddleware(request: Request, response: Response, next: NextFunction) {
  if (request.path === '/health') {
    next();
    return;
  }

  if (!isAllowedOriginRequest(request)) {
    addRecentLog('error', 'server', 'Blocked API request with disallowed origin or referer.', {
      path: request.path,
      ip: getClientIp(request),
      origin: request.header('origin') ?? null,
      referer: request.header('referer') ?? null,
    });
    rejectJson(response, 403, 'Ask Arion blocked this request because the origin is not allowed.');
    return;
  }

  const rateLimit = applyRateLimit(request);
  if (!rateLimit.allowed) {
    addRecentLog('error', 'server', 'Rate limit exceeded for API request.', {
      path: request.path,
      ip: getClientIp(request),
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
    rejectJson(
      response,
      429,
      'Ask Arion is receiving too many requests from this connection. Please wait a moment and try again.',
      rateLimit.retryAfterSeconds,
    );
    return;
  }

  next();
}

function recordPromptAudit(
  request: Request,
  {
    route,
    mode,
    conversationId,
    prompt,
  }: {
    route: '/api/chat' | '/api/chat/stream';
    mode: 'non-stream' | 'stream';
    conversationId: string;
    prompt: string;
  },
) {
  void appendPromptAuditLog({
    timestamp: new Date().toISOString(),
    route,
    mode,
    conversationId,
    prompt,
    ip: getClientIp(request),
    forwardedFor: request.header('x-forwarded-for') ?? undefined,
    userAgent: request.header('user-agent') ?? undefined,
    acceptLanguage: request.header('accept-language') ?? undefined,
    referer: request.header('referer') ?? undefined,
    host: request.header('host') ?? undefined,
  });
}

function resolveConversationHistory(
  conversation: { reset: boolean; recentMessages: Array<{ role: 'user' | 'assistant'; text: string }> },
  clientHistory: Array<{ role: 'user' | 'assistant'; text: string }>,
) {
  if (conversation.reset && clientHistory.length) {
    return clientHistory;
  }

  return conversation.recentMessages;
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/logs', (_request, response) => {
  response.json({ logs: getRecentLogs() });
});

app.get('/api/images/:tag', (request, response) => {
  const asset = imageAssets[request.params.tag];
  if (!asset) {
    response.status(404).json({ error: 'Unknown image tag.' });
    return;
  }

  response.redirect(asset.path);
});

app.post('/api/chat', async (request, response) => {
  const parsed = requestSchema.safeParse(request.body);
  if (!parsed.success) {
    addRecentLog('error', 'chat', 'Rejected invalid chat request.', parsed.error.flatten());
    response.status(400).json({ error: 'Please send a short question.' });
    return;
  }

  try {
    const conversation = getConversationContext(parsed.data.conversationId);
    recordPromptAudit(request, {
      route: '/api/chat',
      mode: 'non-stream',
      conversationId: conversation.id,
      prompt: parsed.data.message,
    });
    const includeSuggestedPrompts = conversation.turnCount < 3;
    addRecentLog('info', 'chat', 'Received chat request.', {
      messagePreview: parsed.data.message.slice(0, 140),
      mode: 'non-stream',
      conversationId: conversation.id,
      recentHistoryCount: conversation.recentMessages.length,
      effectiveHistoryCount: resolveConversationHistory(conversation, parsed.data.history).length,
      summaryLength: conversation.summary.length,
      completedTurnCount: conversation.turnCount,
      includeSuggestedPrompts,
      clientHistoryCount: parsed.data.history.length,
    });
    const payload = await askOpenRouter(parsed.data.message, {
      history: resolveConversationHistory(conversation, parsed.data.history),
      conversationSummary: conversation.summary,
      includeSuggestedPrompts,
    });
    appendConversationTurn(conversation.id, parsed.data.message, payload.text);
    addRecentLog('info', 'chat', 'Completed chat request.', {
      conversationId: conversation.id,
      textPreview: payload.text.slice(0, 220),
    });
    response.json({
      ...payload,
      conversationId: conversation.id,
      conversationReset: conversation.reset,
    });
  } catch (error) {
    console.error('Ask Arion chat request failed', error);
    addRecentLog('error', 'chat', 'Chat request failed.', error);
    response.status(502).json({
      error:
        'Ask Arion could not answer just now. Please try again in a moment.',
    });
  }
});

app.post('/api/chat/stream', async (request, response) => {
  const parsed = requestSchema.safeParse(request.body);
  if (!parsed.success) {
    addRecentLog('error', 'stream', 'Rejected invalid stream request.', parsed.error.flatten());
    response.status(400).json({ error: 'Please send a short question.' });
    return;
  }

  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
  response.write(
    `${JSON.stringify({ type: 'status', message: 'Connecting to Ask Arion…' })}\n`,
  );

  const heartbeatMessages = [
    'Reviewing Team Arion’s information…',
    'Still working on your answer…',
  ];
  let heartbeatIndex = 0;
  const heartbeatId = globalThis.setInterval(() => {
    if (response.writableEnded || response.destroyed) {
      return;
    }

    response.write(
      `${JSON.stringify({
        type: 'status',
        message: heartbeatMessages[heartbeatIndex % heartbeatMessages.length],
      })}\n`,
    );
    heartbeatIndex += 1;
  }, 10_000);

  try {
    const conversation = getConversationContext(parsed.data.conversationId);
    recordPromptAudit(request, {
      route: '/api/chat/stream',
      mode: 'stream',
      conversationId: conversation.id,
      prompt: parsed.data.message,
    });
    addRecentLog('info', 'stream', 'Received streaming chat request.', {
      messagePreview: parsed.data.message.slice(0, 140),
      mode: 'stream',
      conversationId: conversation.id,
      recentHistoryCount: conversation.recentMessages.length,
      effectiveHistoryCount: resolveConversationHistory(conversation, parsed.data.history).length,
      summaryLength: conversation.summary.length,
      clientHistoryCount: parsed.data.history.length,
    });

    await streamOpenRouter(
      parsed.data.message,
      {
        history: resolveConversationHistory(conversation, parsed.data.history),
        conversationSummary: conversation.summary,
      },
      {
      onDelta: (delta) => {
        if (!delta) {
          return;
        }
        response.write(`${JSON.stringify({ type: 'delta', delta })}\n`);
      },
      onDone: (payload) => {
        appendConversationTurn(conversation.id, parsed.data.message, payload.text);
        addRecentLog('info', 'stream', 'Completed streaming chat request.', {
          conversationId: conversation.id,
          textPreview: payload.text.slice(0, 220),
        });
        response.write(
          `${JSON.stringify({
            type: 'done',
            payload: {
              ...payload,
              conversationId: conversation.id,
              conversationReset: conversation.reset,
            },
          })}\n`,
        );
        response.end();
      },
    });
  } catch (error) {
    console.error('Ask Arion streaming chat request failed', error);
    addRecentLog('error', 'stream', 'Streaming chat request failed.', error);
    response.write(
      `${JSON.stringify({
        type: 'error',
        error: 'Ask Arion could not answer just now. Please try again in a moment.',
      })}\n`,
    );
    response.end();
  } finally {
    globalThis.clearInterval(heartbeatId);
  }
});

app.use(express.static(clientDistDir));

app.get('/{*path}', (_request, response) => {
  response.sendFile(path.join(clientDistDir, 'index.html'));
});

app.listen(port, () => {
  addRecentLog('info', 'server', `Ask Arion server started on port ${port}.`);
  addRecentLog('info', 'server', `Prompt audit log path: ${getPromptAuditLogPath()}`);
  addRecentLog('info', 'server', `Allowed origins: ${Array.from(allowedOrigins).join(', ')}`);
  addRecentLog(
    'info',
    'server',
    `Rate limit: ${rateLimitMaxRequests} requests per ${rateLimitWindowMs}ms per IP.`,
  );
  console.log(`Ask Arion listening on http://0.0.0.0:${port}`);
});
