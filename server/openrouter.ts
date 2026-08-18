import { z } from 'zod';
import { assistantRules, teamKnowledge, type KnowledgeSection } from './data/knowledge.js';
import { deriveOfficialActions, type OfficialActionPayload } from './official-actions.js';

interface ConversationHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface AskOpenRouterOptions {
  conversationSummary?: string;
  history?: ConversationHistoryMessage[];
  includeSuggestedPrompts?: boolean;
}

interface AssistantResponsePayload {
  text: string;
  image_tags: string[];
  suggested_prompts: string[];
  official_actions: OfficialActionPayload[];
}

interface OpenRouterResolvedResponse {
  response: Response;
  model: string;
}

interface OpenRouterCompletionResponse {
  model: string;
  payload: unknown;
  rawText: string;
  status: number;
  contentType: string | null;
}

const OPENROUTER_TIMEOUT_MS = 25_000;
const DEFAULT_PRIMARY_MODEL = 'deepseek/deepseek-v4-flash';
const DEFAULT_FALLBACK_MODEL = 'qwen/qwen3.5-27b';

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

function buildSystemPrompt(includeSuggestedPrompts: boolean) {
  const knowledge = buildKnowledgeText();
  const suggestedPromptsShape = includeSuggestedPrompts
    ? '["short follow-up question", "short follow-up question"]'
    : '[]';
  const suggestedPromptInstructions = includeSuggestedPrompts
    ? `Rules for suggested_prompts:
- Return 2 or 3 suggestions on normal informative replies.
- Keep them strictly focused on Team Arion.
- Make them short, natural, and specific.
- Each suggestion must be a question the visitor could tap next.
- Do not suggest unrelated chat.
- Do not mention images, files, attachments, or hidden system details.
- Do not place follow-up questions inside the text field.
- Put follow-up questions only inside suggested_prompts.
- Do not end the text with invitation lines such as "Would you like to know more about..." or "I can also tell you about...".
- Use an empty array only if the conversation is clearly ending, the user is refusing to engage, or no sensible Team Arion follow-up exists.`
    : `Rules for suggested_prompts:
- Do not generate suggested prompts for this reply.
- Return suggested_prompts as an empty array.
- Do not place follow-up questions inside the text field.
- Do not end the text with invitation lines such as "Would you like to know more about..." or "I can also tell you about...".`;

  return `${assistantRules.join('\n')}

Return a strict JSON object with this shape:
{
  "text": "your answer as a string",
  "suggested_prompts": ${suggestedPromptsShape}
}

${suggestedPromptInstructions}

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

function splitStructuredTail(raw: string) {
  if (!raw) {
    return { prose: '', structured: '' };
  }

  if (raw.trimStart().startsWith('{')) {
    return { prose: '', structured: raw.trim() };
  }

  const jsonLineMatch = raw.match(/\n\s*\{/);
  if (!jsonLineMatch || jsonLineMatch.index === undefined) {
    return { prose: raw.trim(), structured: '' };
  }

  const structuredStart = raw.indexOf('{', jsonLineMatch.index);
  if (structuredStart === -1) {
    return { prose: raw.trim(), structured: '' };
  }

  return {
    prose: raw.slice(0, structuredStart).trim(),
    structured: raw.slice(structuredStart).trim(),
  };
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

function cleanQuestionLine(value: string) {
  return value
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTrailingSuggestedPrompts(text: string) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return { cleanedText: text.trim(), suggestedPrompts: [] as string[] };
  }

  const lastParagraph = paragraphs[paragraphs.length - 1];
  const lines = lastParagraph
    .split('\n')
    .map((line) => cleanQuestionLine(line))
    .filter(Boolean);

  const candidateLines = lines.filter((line) => line.endsWith('?'));
  if (candidateLines.length >= 2 && candidateLines.length <= 3 && candidateLines.length === lines.length) {
    return {
      cleanedText: paragraphs.slice(0, -1).join('\n\n').trim(),
      suggestedPrompts: normalizeSuggestedPrompts(candidateLines),
    };
  }

  if (paragraphs.length >= 2) {
    const maybeLabel = paragraphs[paragraphs.length - 2].toLowerCase();
    if (
      maybeLabel.includes('follow-up') ||
      maybeLabel.includes('next question') ||
      maybeLabel.includes('next prompt')
    ) {
      const questions = normalizeSuggestedPrompts(candidateLines);
      if (questions.length >= 2) {
        return {
          cleanedText: paragraphs.slice(0, -2).join('\n\n').trim(),
          suggestedPrompts: questions,
        };
      }
    }
  }

  return { cleanedText: text.trim(), suggestedPrompts: [] as string[] };
}

function extractLabeledFollowUpPrompts(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(
    /(?:^|\n|\s)(Suggested follow-ups?|Suggested prompts?|Suggested next prompts?|Next questions?)\s*:\s*([\s\S]+)$/i,
  );

  if (!match || match.index === undefined) {
    return { cleanedText: trimmed, suggestedPrompts: [] as string[] };
  }

  const rawCandidates = match[2]
    .split('\n')
    .map((line) => cleanQuestionLine(line))
    .filter(Boolean)
    .slice(0, 6);

  const prompts = normalizeSuggestedPrompts(
    rawCandidates
      .map((line) => (line.endsWith('?') ? line : toQuestionPrompt(line)))
      .filter(Boolean)
      .slice(0, 3),
  );

  if (prompts.length < 2) {
    return { cleanedText: trimmed, suggestedPrompts: [] as string[] };
  }

  return {
    cleanedText: trimmed.slice(0, match.index).trim(),
    suggestedPrompts: prompts,
  };
}

function toQuestionPrompt(topic: string) {
  const normalized = topic.replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '');
  if (!normalized) {
    return '';
  }

  const lower = normalized.toLowerCase();
  if (lower.startsWith('your ') || lower.startsWith('the ') || lower.startsWith('team ')) {
    return `Can you tell me more about ${normalized}?`;
  }

  return `Can you tell me more about ${normalized}?`;
}

function splitInvitationTopics(raw: string) {
  return raw
    .split(/\s*,\s*|\s+or\s+/i)
    .map((part) => part.replace(/^about\s+/i, '').trim())
    .filter(Boolean);
}

function extractInlineInvitationPrompts(text: string) {
  const trimmed = text.trim();
  const patterns = [
    /(?:^|\n|\s)(Would you like to know more about\s+(.+?)\?)$/i,
    /(?:^|\n|\s)(Would you like to hear more about\s+(.+?)\?)$/i,
    /(?:^|\n|\s)(I can also tell you about\s+(.+?)\.)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) {
      continue;
    }

    const invitation = match[1].trim();
    const topics = splitInvitationTopics(match[2] ?? '')
      .map(toQuestionPrompt)
      .filter(Boolean)
      .slice(0, 3);

    if (topics.length >= 2) {
      return {
        cleanedText: trimmed.slice(0, match.index).trim(),
        suggestedPrompts: normalizeSuggestedPrompts(topics),
        invitation,
      };
    }
  }

  return { cleanedText: trimmed, suggestedPrompts: [] as string[], invitation: '' };
}

function extractInvitationListPrompts(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(
    /(?:^|\n|\s)(Would you like to know more about|Would you like to hear more about|I can also tell you about):\s*([\s\S]+)$/i,
  );

  if (!match || match.index === undefined) {
    return { cleanedText: trimmed, suggestedPrompts: [] as string[], invitation: '' };
  }

  const rawList = match[2]
    .split('\n')
    .map((line) => cleanQuestionLine(line))
    .filter(Boolean)
    .slice(0, 5);

  const prompts = normalizeSuggestedPrompts(
    rawList
      .map((line) => (line.endsWith('?') ? line : toQuestionPrompt(line)))
      .filter(Boolean)
      .slice(0, 3),
  );

  if (prompts.length < 2) {
    return { cleanedText: trimmed, suggestedPrompts: [] as string[], invitation: '' };
  }

  return {
    cleanedText: trimmed.slice(0, match.index).trim(),
    suggestedPrompts: prompts,
    invitation: match[1].trim(),
  };
}

function normalizeAssistantResponse(raw: string, userPrompt = ''): AssistantResponsePayload {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Model returned an empty response.');
  }

  const finalizePlainText = (value: string): AssistantResponsePayload => {
    const labeledFollowUps = extractLabeledFollowUpPrompts(value);
    if (labeledFollowUps.suggestedPrompts.length) {
      return {
        text: labeledFollowUps.cleanedText || value,
        image_tags: [],
        suggested_prompts: labeledFollowUps.suggestedPrompts,
        official_actions: deriveOfficialActions(labeledFollowUps.cleanedText || value, userPrompt),
      };
    }

    const extracted = extractTrailingSuggestedPrompts(value);
    if (extracted.suggestedPrompts.length) {
      return {
        text: extracted.cleanedText || value,
        image_tags: [],
        suggested_prompts: extracted.suggestedPrompts,
        official_actions: deriveOfficialActions(extracted.cleanedText || value, userPrompt),
      };
    }

    const inlineInvitation = extractInlineInvitationPrompts(value);
    if (inlineInvitation.suggestedPrompts.length) {
      return {
        text: inlineInvitation.cleanedText || value,
        image_tags: [],
        suggested_prompts: inlineInvitation.suggestedPrompts,
        official_actions: deriveOfficialActions(inlineInvitation.cleanedText || value, userPrompt),
      };
    }

    const invitationList = extractInvitationListPrompts(value);
    return {
      text: invitationList.cleanedText || value,
      image_tags: [],
      suggested_prompts: invitationList.suggestedPrompts,
      official_actions: deriveOfficialActions(invitationList.cleanedText || value, userPrompt),
    };
  };

  const { prose, structured } = splitStructuredTail(trimmed);
  if (structured) {
    try {
      const parsedResponse = JSON.parse(extractJsonObject(structured)) as {
        text?: unknown;
        suggested_prompts?: unknown;
      };
      const text =
        typeof parsedResponse.text === 'string'
          ? parsedResponse.text.trim()
          : extractPartialTextFromJsonPrefix(structured);

      const resolvedText = text || prose;
      if (!resolvedText) {
        throw new Error('Model returned an empty response.');
      }

      const normalizedPrompts = normalizeSuggestedPrompts(parsedResponse.suggested_prompts);
      if (normalizedPrompts.length) {
        const cleanedInline = extractInlineInvitationPrompts(resolvedText);
        return {
          text: cleanedInline.cleanedText || resolvedText,
          image_tags: [],
          suggested_prompts: normalizedPrompts,
          official_actions: deriveOfficialActions(cleanedInline.cleanedText || resolvedText, userPrompt),
        };
      }

      return finalizePlainText(resolvedText);
    } catch {
      if (prose) {
        return finalizePlainText(prose);
      }
    }
  }

  return finalizePlainText(trimmed);
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

function resolveOpenRouterModels() {
  const primary = (process.env.OPENROUTER_MODEL || DEFAULT_PRIMARY_MODEL).trim();
  const fallback = (process.env.OPENROUTER_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL).trim();

  if (!fallback || fallback === primary) {
    return [primary];
  }

  return [primary, fallback];
}

function shouldOmitReasoningOverride(model: string) {
  const normalized = model.trim().toLowerCase();
  return normalized === 'qwen/qwen3.6-plus-preview:free';
}

function shouldRetryWithFallback(
  status: number | null,
  payload: unknown,
  error: unknown,
  currentModel: string,
  attemptedModels: string[],
) {
  if (!attemptedModels.length || attemptedModels[attemptedModels.length - 1] !== currentModel) {
    return false;
  }

  if (attemptedModels.length < 2) {
    return false;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timed out') ||
      message.includes('network') ||
      message.includes('fetch failed') ||
      message.includes('temporarily unavailable')
    ) {
      return true;
    }
  }

  if (typeof status === 'number') {
    if (status === 408 || status === 409 || status === 425 || status === 429) {
      return true;
    }

    if (status >= 500) {
      return true;
    }
  }

  const payloadText = payload ? JSON.stringify(payload).toLowerCase() : '';
  return (
    payloadText.includes('no endpoints found') ||
    payloadText.includes('provider returned error') ||
    payloadText.includes('temporarily unavailable') ||
    payloadText.includes('rate limit') ||
    payloadText.includes('unreachable') ||
    payloadText.includes('reasoning is mandatory')
  );
}

function summarizeBodyPreview(rawText: string) {
  const compact = rawText.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '[empty]';
  }

  return compact.slice(0, 240);
}

async function readOpenRouterPayload(response: Response) {
  const rawText = await response.text().catch(() => '');
  const contentType = response.headers.get('content-type');
  const trimmed = rawText.trim();

  if (!trimmed) {
    return {
      payload: null as unknown,
      rawText,
      contentType,
    };
  }

  try {
    return {
      payload: JSON.parse(trimmed) as unknown,
      rawText,
      contentType,
    };
  } catch {
    return {
      payload: null as unknown,
      rawText,
      contentType,
    };
  }
}

async function executeOpenRouterRequest(
  model: string,
  message: string,
  { history = [], conversationSummary = '', includeSuggestedPrompts = true }: AskOpenRouterOptions = {},
  stream = false,
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const requestBody = {
      model,
      temperature: 0.2,
      max_tokens: 320,
      stream,
      messages: [
        {
          role: 'system',
          content: stream ? buildStreamingPrompt() : buildSystemPrompt(includeSuggestedPrompts),
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
          role: 'user' as const,
          content: message,
        },
      ],
      ...(shouldOmitReasoningOverride(model)
        ? {}
        : {
            reasoning: {
              effort: 'none',
              exclude: true,
            },
          }),
    };

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
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The model provider timed out before starting the response.');
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function requestOpenRouter(
  message: string,
  options: AskOpenRouterOptions = {},
  stream = false,
): Promise<OpenRouterResolvedResponse> {
  const models = resolveOpenRouterModels();
  let lastError: unknown = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];

    try {
      const response = await executeOpenRouterRequest(model, message, options, stream);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (index < models.length - 1 && shouldRetryWithFallback(response.status, payload, null, model, models)) {
          continue;
        }

        const providerMessage =
          payload && typeof payload === 'object' && 'error' in payload
            ? JSON.stringify(payload.error)
            : 'OpenRouter request failed.';
        throw new Error(`${providerMessage} (model: ${model})`);
      }

      return { response, model };
    } catch (error) {
      lastError = error;
      if (index < models.length - 1 && shouldRetryWithFallback(null, null, error, model, models)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter request failed.');
}

async function requestOpenRouterCompletion(
  message: string,
  options: AskOpenRouterOptions = {},
): Promise<OpenRouterCompletionResponse> {
  const models = resolveOpenRouterModels();
  let lastError: unknown = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];

    try {
      const response = await executeOpenRouterRequest(model, message, options, false);
      const { payload, rawText, contentType } = await readOpenRouterPayload(response);

      if (!response.ok) {
        if (
          index < models.length - 1 &&
          shouldRetryWithFallback(response.status, payload, null, model, models)
        ) {
          continue;
        }

        const providerMessage =
          payload && typeof payload === 'object' && 'error' in payload
            ? JSON.stringify(payload.error)
            : `OpenRouter request failed with status ${response.status}, content-type ${contentType ?? 'unknown'}, body ${summarizeBodyPreview(rawText)}`;
        throw new Error(`${providerMessage} (model: ${model})`);
      }

      const parsed = openRouterResponseSchema.safeParse(payload);
      if (!parsed.success) {
        if (index < models.length - 1) {
          continue;
        }

        throw new Error(
          `OpenRouter returned an invalid success body (status: ${response.status}, content-type: ${contentType ?? 'unknown'}, body: ${summarizeBodyPreview(rawText)}, model: ${model})`,
        );
      }

      return {
        model,
        payload: parsed.data,
        rawText,
        status: response.status,
        contentType,
      };
    } catch (error) {
      lastError = error;
      if (index < models.length - 1 && shouldRetryWithFallback(null, null, error, model, models)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter request failed.');
}

export async function askOpenRouter(
  message: string,
  options: AskOpenRouterOptions = {},
) {
  const { payload, model } = await requestOpenRouterCompletion(message, options);

  const parsedPayload = payload as z.infer<typeof openRouterResponseSchema>;
  const firstChoice = parsedPayload.choices[0];
  const rawContent = extractMessageText(firstChoice?.message.content ?? null);
  if (!rawContent) {
    const finishReason = firstChoice?.finish_reason ?? 'unknown';
    const reasoningPresent = Boolean(firstChoice?.message.reasoning?.trim());
    throw new Error(
      `Model returned no visible text (model: ${model}, finish_reason: ${finishReason}, reasoning_present: ${reasoningPresent}).`,
    );
  }

  const normalizedResponse = normalizeAssistantResponse(rawContent, message);
  if (options.includeSuggestedPrompts === false) {
    return {
      ...normalizedResponse,
      suggested_prompts: [],
    };
  }

  return normalizedResponse;
}

export async function streamOpenRouter(
  message: string,
  options: AskOpenRouterOptions = {},
  handlers: {
    onDelta: (delta: string) => void;
    onDone: (payload: AssistantResponsePayload) => void;
  },
) {
  const { response, model } = await requestOpenRouter(message, options, true);
  if (!response.body) {
    throw new Error(`OpenRouter stream body missing (model: ${model}).`);
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
            official_actions: [],
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
    official_actions: [],
  });
}
