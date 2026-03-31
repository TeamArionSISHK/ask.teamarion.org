import { z } from 'zod';
import { allowedImageTags } from './data/imageMap.js';
import { assistantRules, teamKnowledge, type KnowledgeSection } from './data/knowledge.js';

interface ConversationHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

const responseSchema = z.object({
  text: z.string().min(1).max(900),
  image_tags: z.array(z.string()).max(2),
});

const openRouterResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([z.string(), z.null()]),
        }),
      }),
    )
    .min(1),
});

const openRouterStreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.union([z.string(), z.null()]).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

function buildKnowledgeText() {
  const knowledge = teamKnowledge
    .map((section: KnowledgeSection) => `${section.title}:\n- ${section.details.join('\n- ')}`)
    .join('\n\n');

  return knowledge;
}

function buildSystemPrompt() {
  const knowledge = buildKnowledgeText();

  return `${assistantRules.join('\n')}

Knowledge:
${knowledge}

Output schema:
{
  "text": "short answer",
  "image_tags": []
}`;
}

function buildStreamingPrompt() {
  return [
    'You are Ask Arion, a Team Arion assistant.',
    'Answer in plain text only, with no JSON, markdown, bullets, or code fences.',
    'Answer in 2 to 5 sentences.',
    'Be concise, calm, and helpful.',
    'Use only the supplied knowledge. Do not invent facts.',
    'If the answer is not fully supported by the supplied knowledge, say that more team-specific detail is not currently loaded and then provide the safest high-level answer you can.',
    '',
    'Knowledge:',
    buildKnowledgeText(),
  ].join('\n');
}

function extractJsonObject(raw: string) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model did not return a JSON object.');
  }

  return raw.slice(start, end + 1);
}

function extractPartialTextFromJsonPrefix(raw: string) {
  const marker = '"text"';
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const colonIndex = raw.indexOf(':', markerIndex + marker.length);
  if (colonIndex === -1) {
    return null;
  }

  const openingQuoteIndex = raw.indexOf('"', colonIndex);
  if (openingQuoteIndex === -1) {
    return null;
  }

  let cursor = openingQuoteIndex + 1;
  let escaped = false;
  let output = '';

  while (cursor < raw.length) {
    const character = raw[cursor];
    if (escaped) {
      if (character === 'n') {
        output += '\n';
      } else if (character === 't') {
        output += '\t';
      } else {
        output += character;
      }
      escaped = false;
      cursor += 1;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      cursor += 1;
      continue;
    }

    if (character === '"') {
      return output.trim();
    }

    output += character;
    cursor += 1;
  }

  return output.trim();
}

function normalizeStructuredResponse(raw: string) {
  const parsedResponse = responseSchema.parse(JSON.parse(extractJsonObject(raw)));
  return {
    text: parsedResponse.text.trim(),
    image_tags: parsedResponse.image_tags.filter((tag) => allowedImageTags.includes(tag) && false),
  };
}

function normalizeHistory(history: ConversationHistoryMessage[]) {
  return history
    .filter((entry) => entry.text.trim())
    .slice(-12)
    .map((entry) => ({
      role: entry.role,
      content: entry.text.trim(),
    }));
}

async function requestOpenRouter(
  message: string,
  history: ConversationHistoryMessage[] = [],
  stream = false,
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const model = process.env.OPENROUTER_MODEL || 'qwen/qwen3.5-27b';
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(process.env.OPENROUTER_SITE_URL
        ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL }
        : {}),
      ...(process.env.OPENROUTER_APP_NAME
        ? { 'X-Title': process.env.OPENROUTER_APP_NAME }
        : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 220,
      stream,
      messages: [
        {
          role: 'system',
          content: stream ? buildStreamingPrompt() : buildSystemPrompt(),
        },
        ...normalizeHistory(history),
        {
          role: 'user',
          content: message,
        },
      ],
      ...(stream ? {} : { response_format: { type: 'json_object' } }),
    }),
  });

  return response;
}

export async function askOpenRouter(
  message: string,
  history: ConversationHistoryMessage[] = [],
) {
  const response = await requestOpenRouter(message, history);

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage =
      payload && typeof payload === 'object' && 'error' in payload
        ? JSON.stringify(payload.error)
        : 'OpenRouter request failed.';
    throw new Error(providerMessage);
  }

  const parsedPayload = openRouterResponseSchema.parse(payload);
  const rawContent = parsedPayload.choices[0]?.message.content?.trim() ?? '';
  if (!rawContent) {
    throw new Error('Model returned an empty response.');
  }

  return normalizeStructuredResponse(rawContent);
}

export async function streamOpenRouter(
  message: string,
  history: ConversationHistoryMessage[] = [],
  handlers: {
    onDelta: (delta: string) => void;
    onDone: (payload: { text: string; image_tags: string[] }) => void;
  },
) {
  const response = await requestOpenRouter(message, history, true);
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    const providerMessage =
      payload && typeof payload === 'object' && 'error' in payload
        ? JSON.stringify(payload.error)
        : 'OpenRouter request failed.';
    throw new Error(providerMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let sawContentDelta = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const lines = chunk
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue;
        }

        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          if (!sawContentDelta || !fullText.trim()) {
            throw new Error('Streaming was unavailable for this response.');
          }

          handlers.onDone({
            text: fullText.trim(),
            image_tags: [],
          });
          return;
        }

        const payload = openRouterStreamChunkSchema.parse(JSON.parse(data));
        const delta = payload.choices?.[0]?.delta?.content ?? '';
        if (!delta) {
          continue;
        }

        sawContentDelta = true;
        fullText += delta;
        handlers.onDelta(delta);
      }
    }
  }

  if (!sawContentDelta || !fullText.trim()) {
    throw new Error('Streaming was unavailable for this response.');
  }

  handlers.onDone({
    text: fullText.trim(),
    image_tags: [],
  });
}
