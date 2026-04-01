import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import type { Request } from 'express';
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
    addRecentLog('info', 'chat', 'Received chat request.', {
      messagePreview: parsed.data.message.slice(0, 140),
      mode: 'non-stream',
      conversationId: conversation.id,
      recentHistoryCount: conversation.recentMessages.length,
      summaryLength: conversation.summary.length,
      clientHistoryCount: parsed.data.history.length,
    });
    const payload = await askOpenRouter(parsed.data.message, {
      history: conversation.recentMessages,
      conversationSummary: conversation.summary,
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

  try {
    const conversation = getConversationContext(parsed.data.conversationId);
    let lastSentText = '';
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
      summaryLength: conversation.summary.length,
      clientHistoryCount: parsed.data.history.length,
    });

    await streamOpenRouter(
      parsed.data.message,
      {
        history: conversation.recentMessages,
        conversationSummary: conversation.summary,
      },
      {
      onDelta: (text) => {
        const delta = text.slice(lastSentText.length);
        if (!delta) {
          return;
        }
        lastSentText = text;
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
  }
});

app.use(express.static(clientDistDir));

app.get('/{*path}', (_request, response) => {
  response.sendFile(path.join(clientDistDir, 'index.html'));
});

app.listen(port, () => {
  addRecentLog('info', 'server', `Ask Arion server started on port ${port}.`);
  addRecentLog('info', 'server', `Prompt audit log path: ${getPromptAuditLogPath()}`);
  console.log(`Ask Arion listening on http://0.0.0.0:${port}`);
});
