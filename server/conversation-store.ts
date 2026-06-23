import crypto from 'node:crypto';

interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ConversationContext {
  id: string;
  summary: string;
  recentMessages: ConversationMessage[];
  turnCount: number;
  reset: boolean;
}

interface StoredConversation {
  id: string;
  summary: string;
  recentMessages: ConversationMessage[];
  turnCount: number;
  lastActiveAt: number;
}

const CONVERSATION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_RECENT_MESSAGES = 8;
const MAX_SUMMARY_CHARACTERS = 3200;
const SUMMARY_ENTRY_LIMIT = 280;

const conversations = new Map<string, StoredConversation>();

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function trimSummary(summary: string) {
  if (summary.length <= MAX_SUMMARY_CHARACTERS) {
    return summary;
  }

  return `…${summary.slice(-(MAX_SUMMARY_CHARACTERS - 1)).trimStart()}`;
}

function compactMessagePair(messages: ConversationMessage[]) {
  const pair = messages.slice(0, 2);
  if (!pair.length) {
    return '';
  }

  return pair
    .map((message) => {
      const speaker = message.role === 'user' ? 'User' : 'Assistant';
      return `${speaker}: ${truncateText(message.text.replace(/\s+/g, ' ').trim(), SUMMARY_ENTRY_LIMIT)}`;
    })
    .join('\n');
}

function createConversation(id?: string): StoredConversation {
  const conversationId = id ?? crypto.randomUUID();

  return {
    id: conversationId,
    summary: '',
    recentMessages: [],
    turnCount: 0,
    lastActiveAt: Date.now(),
  };
}

function isExpired(conversation: StoredConversation, now = Date.now()) {
  return now - conversation.lastActiveAt > CONVERSATION_TTL_MS;
}

function pruneExpiredConversations() {
  const now = Date.now();
  for (const [id, conversation] of conversations.entries()) {
    if (isExpired(conversation, now)) {
      conversations.delete(id);
    }
  }
}

function getExistingConversation(id: string | undefined) {
  if (!id) {
    return null;
  }

  const conversation = conversations.get(id);
  if (!conversation) {
    return null;
  }

  if (isExpired(conversation)) {
    conversations.delete(id);
    return null;
  }

  return conversation;
}

export function getConversationContext(conversationId?: string): ConversationContext {
  pruneExpiredConversations();

  const existingConversation = getExistingConversation(conversationId);
  if (existingConversation) {
    existingConversation.lastActiveAt = Date.now();
    return {
      id: existingConversation.id,
      summary: existingConversation.summary,
      recentMessages: [...existingConversation.recentMessages],
      turnCount: existingConversation.turnCount,
      reset: false,
    };
  }

  const conversation = createConversation();
  conversations.set(conversation.id, conversation);

  return {
    id: conversation.id,
    summary: '',
    recentMessages: [],
    turnCount: conversation.turnCount,
    reset: Boolean(conversationId),
  };
}

export function appendConversationTurn(
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
) {
  const conversation = getExistingConversation(conversationId) ?? createConversation(conversationId);
  conversation.lastActiveAt = Date.now();
  conversation.turnCount += 1;
  conversation.recentMessages.push(
    { role: 'user', text: userMessage.trim() },
    { role: 'assistant', text: assistantMessage.trim() },
  );

  while (conversation.recentMessages.length > MAX_RECENT_MESSAGES) {
    const summaryChunk = compactMessagePair(conversation.recentMessages);
    conversation.recentMessages = conversation.recentMessages.slice(Math.min(2, conversation.recentMessages.length));
    if (!summaryChunk) {
      continue;
    }

    conversation.summary = trimSummary(
      conversation.summary ? `${conversation.summary}\n\n${summaryChunk}` : summaryChunk,
    );
  }

  conversations.set(conversation.id, conversation);
}

setInterval(pruneExpiredConversations, 30 * 60 * 1000).unref();
