import { z } from 'zod';
import { assistantRules, teamKnowledge, type KnowledgeSection } from './data/knowledge.js';

interface ConversationHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface AskOpenRouterOptions {
  conversationSummary?: string;
  history?: ConversationHistoryMessage[];
}

interface AssistantResponsePayload {
  text: string;
  image_tags: string[];
  suggested_prompts: string[];
}

const OPENROUTER_TIMEOUT_MS = 40_000;

const openRouterResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.union([z.string(), z.null()]).optional(),
        message: z.object({
          content: z.union([
            z.string(),
            z.null(),
            z.array(
              z.object({
                type: z.string().optional(),
                text: z.string().optional(),
              }),
            ),
          ]),
          reasoning: z.union([z.string(), z.null()]).optional(),
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

Return a strict JSON object with this shape:
{
  "text": "your answer as a string",
  "suggested_prompts": ["short follow-up question", "short follow-up question"]
}

Rules for suggested_prompts:
- Return 2 or 3 suggestions when possible.
- Keep them strictly focused on Team Arion.
- Make them short, natural, and specific.
- Each suggestion must be a question the visitor could tap next.
- Do not suggest unrelated chat.
- Do not mention images, files, attachments, or hidden system details.
- If no good suggestion is available, return an empty array.

Knowledge:
${knowledge}`;
}

function buildConversationSummaryPrompt(summary: string) {
  return [
    'Conversation summary so far:',
    summary,
    '',
    'Use this summary only as continuity for the current conversation.',
    'Do not mix it with any other conversation.',
  ].join('\n');
}

function buildStreamingPrompt() {
  return [
    'You are Ask Arion, a Team Arion assistant.',
    'Answer in plain text only, with no JSON or code fences.',
    'Answer in 2 to 5 sentences.',
    'Be concise, calm, helpful, and warm.',
    'You may be lightly playful if the user is clearly joking, but keep it brief and tasteful.',
    'Keep the conversation focused on Team Arion, its people, cars, engineering, outreach, competitions, sponsors, or related project details.',
    'Do not engage in unrelated general chat. If the user drifts off-topic, gently bring the answer back to Team Arion.',
    'Use short paragraphs with blank lines between distinct ideas.',
    'Avoid dense walls of text.',
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

function normalizeSuggestedPrompts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const prompt = item.replace(/\s+/g, ' ').trim();
    if (!prompt || prompt.length > 120) {
      continue;
    }

    unique.add(prompt);
    if (unique.size >= 3) {
      break;
    }
  }

  return Array.from(unique);
}

function normalizeAssistantResponse(raw: string): AssistantResponsePayload {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Model returned an empty response.');
  }

  if (!trimmed.startsWith('{')) {
    return {
      text: trimmed,
      image_tags: [],
      suggested_prompts: [],
    };
  }

  const parsedResponse = JSON.parse(extractJsonObject(trimmed)) as {
    text?: unknown;
    suggested_prompts?: unknown;
  };
  const text =
    typeof parsedResponse.text === 'string'
      ? parsedResponse.text.trim()
      : extractPartialTextFromJsonPrefix(trimmed);

  if (!text) {
    throw new Error('Model returned an empty response.');
  }

  return {
    text,
    image_tags: [],
    suggested_prompts: normalizeSuggestedPrompts(parsedResponse.suggested_prompts),
  };
}

function extractMessageText(
  content: string | null | Array<{ type?: string; text?: string }>,
) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => part.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
    .trim();
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
  { history = [], conversationSummary = '' }: AskOpenRouterOptions = {},
  stream = false,
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const model = process.env.OPENROUTER_MODEL || 'qwen/qwen3.5-flash-02-23';
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
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
        max_tokens: 320,
        reasoning: {
          effort: 'none',
          exclude: true,
        },
        stream,
        messages: [
          {
            role: 'system',
            content: stream ? buildStreamingPrompt() : buildSystemPrompt(),
          },
          ...(conversationSummary.trim()
            ? [
                {
                  role: 'system' as const,
                  content: buildConversationSummaryPrompt(conversationSummary.trim()),
                },
              ]
            : []),
          ...normalizeHistory(history),
          {
            role: 'user',
            content: message,
          },
        ],
      }),
      signal: controller.signal,
    });

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('OpenRouter timed out after 40 seconds.');
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function askOpenRouter(
  message: string,
  options: AskOpenRouterOptions = {},
) {
  const response = await requestOpenRouter(message, options);

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage =
      payload && typeof payload === 'object' && 'error' in payload
        ? JSON.stringify(payload.error)
        : 'OpenRouter request failed.';
    throw new Error(providerMessage);
  }

  const parsedPayload = openRouterResponseSchema.parse(payload);
  const firstChoice = parsedPayload.choices[0];
  const rawContent = extractMessageText(firstChoice?.message.content ?? null);
  if (!rawContent) {
    const finishReason = firstChoice?.finish_reason ?? 'unknown';
    const reasoningPresent = Boolean(firstChoice?.message.reasoning?.trim());
    throw new Error(
      `Model returned no visible text (finish_reason: ${finishReason}, reasoning_present: ${reasoningPresent}).`,
    );
  }

  return normalizeAssistantResponse(rawContent);
}

export async function streamOpenRouter(
  message: string,
  options: AskOpenRouterOptions = {},
  handlers: {
    onDelta: (delta: string) => void;
    onDone: (payload: AssistantResponsePayload) => void;
  },
) {
  const response = await requestOpenRouter(message, options, true);
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
            suggested_prompts: [],
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
    suggested_prompts: [],
  });
}
