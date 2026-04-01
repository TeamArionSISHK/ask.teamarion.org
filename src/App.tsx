import { startTransition, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Header } from './components/Header';
import { SuggestedPrompts } from './components/SuggestedPrompts';
import { ChatMessageCard } from './components/ChatMessageCard';
import { Composer } from './components/Composer';
import { sendChatMessage } from './lib/api';
import { suggestedPrompts } from './lib/suggestions';
import type { ChatMessage } from './types/chat';

const initialAssistantMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text:
    'Hi, I’m Ask Arion. Ask me about our team, our car, or our engineering, and I’ll do my best to help.',
};

const CHAT_STORAGE_KEY = 'ask-arion-chat-session-v1';
const CHAT_CONVERSATION_KEY = 'ask-arion-conversation-id-v1';
const CHAT_ACTIVITY_KEY = 'ask-arion-chat-activity-v1';
const CHAT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.text === 'string' &&
    (candidate.status === undefined ||
      candidate.status === 'idle' ||
      candidate.status === 'error' ||
      candidate.status === 'streaming')
  );
}

function loadStoredMessages() {
  if (typeof window === 'undefined') {
    return [initialAssistantMessage];
  }

  try {
    const lastActivity = Number.parseInt(window.sessionStorage.getItem(CHAT_ACTIVITY_KEY) ?? '', 10);
    if (Number.isFinite(lastActivity) && Date.now() - lastActivity > CHAT_SESSION_TTL_MS) {
      window.sessionStorage.removeItem(CHAT_STORAGE_KEY);
      window.sessionStorage.removeItem(CHAT_CONVERSATION_KEY);
      window.sessionStorage.removeItem(CHAT_ACTIVITY_KEY);
      return [initialAssistantMessage];
    }

    const raw = window.sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) {
      return [initialAssistantMessage];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [initialAssistantMessage];
    }

    const storedMessages = parsed
      .filter(isChatMessage)
      .map((message) => {
        const normalizedMessage =
          message.status === 'streaming'
            ? {
                ...message,
                status: 'idle' as const,
              }
            : message;

        if (normalizedMessage.id === 'welcome' && normalizedMessage.role === 'assistant') {
          return initialAssistantMessage;
        }

        return normalizedMessage;
      });
    return storedMessages.length ? storedMessages : [initialAssistantMessage];
  } catch {
    return [initialAssistantMessage];
  }
}

function loadStoredConversationId() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const lastActivity = Number.parseInt(window.sessionStorage.getItem(CHAT_ACTIVITY_KEY) ?? '', 10);
    if (Number.isFinite(lastActivity) && Date.now() - lastActivity > CHAT_SESSION_TTL_MS) {
      window.sessionStorage.removeItem(CHAT_CONVERSATION_KEY);
      return null;
    }

    const conversationId = window.sessionStorage.getItem(CHAT_CONVERSATION_KEY);
    return conversationId?.trim() || null;
  } catch {
    return null;
  }
}

function isStoredSessionExpired() {
  if (typeof window === 'undefined') {
    return false;
  }

  const lastActivity = Number.parseInt(window.sessionStorage.getItem(CHAT_ACTIVITY_KEY) ?? '', 10);
  return Number.isFinite(lastActivity) && Date.now() - lastActivity > CHAT_SESSION_TTL_MS;
}

function clearStoredSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(CHAT_STORAGE_KEY);
  window.sessionStorage.removeItem(CHAT_CONVERSATION_KEY);
  window.sessionStorage.removeItem(CHAT_ACTIVITY_KEY);
}

function markChatActivity() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(CHAT_ACTIVITY_KEY, String(Date.now()));
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);
  const [conversationId, setConversationId] = useState<string | null>(loadStoredConversationId);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const isEmptyState = messages.length === 1;
  const hasUserMessages = messages.some((message) => message.role === 'user');

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }

    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: messages.length > 2 ? 'smooth' : 'auto',
    });
  }, [loading, messages]);

  useEffect(() => {
    if (!privacyOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPrivacyOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [privacyOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Ignore storage failures and keep the chat usable.
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (conversationId) {
        window.sessionStorage.setItem(CHAT_CONVERSATION_KEY, conversationId);
      } else {
        window.sessionStorage.removeItem(CHAT_CONVERSATION_KEY);
      }
    } catch {
      // Ignore storage failures and keep the chat usable.
    }
  }, [conversationId]);

  function buildRequestPayload(message: string, activeConversationId: string | null) {
    return {
      message,
      conversationId: activeConversationId ?? undefined,
    };
  }

  async function submitMessage(rawMessage?: string) {
    const message = (rawMessage ?? draft).trim();
    if (!message || loading) {
      return;
    }

    const sessionExpired = isStoredSessionExpired();
    const activeConversationId = sessionExpired ? null : conversationId;

    if (sessionExpired) {
      clearStoredSession();
      setConversationId(null);
      setMessages([initialAssistantMessage]);
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: message,
    };

    startTransition(() => {
      setMessages((current) =>
        sessionExpired ? [initialAssistantMessage, userMessage] : [...current, userMessage],
      );
      setDraft('');
      setError(null);
    });
    markChatActivity();
    setLoading(true);

    const assistantMessageId = crypto.randomUUID();

    try {
      const response = await sendChatMessage(buildRequestPayload(message, activeConversationId));
      setConversationId(response.conversationId);
      markChatActivity();
      startTransition(() => {
        const nextAssistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          text: response.text,
          status: 'idle',
        };

        if (response.conversationReset && !sessionExpired) {
          setMessages([initialAssistantMessage, userMessage, nextAssistantMessage]);
          return;
        }

        setMessages((current) => [...current, nextAssistantMessage]);
      });
    } catch (caughtError) {
      const fallback =
        caughtError instanceof Error
          ? caughtError.message
          : 'The assistant is unavailable right now.';
      setError(fallback);
      startTransition(() => {
        setMessages((current) => [
          ...current,
          {
            id: assistantMessageId,
            role: 'assistant',
            text: fallback,
            status: 'error',
          },
        ]);
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="page-glow" aria-hidden="true" />
      <Header />

      <main className="chat-page">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="chat-shell"
        >
          <div ref={threadRef} className="chat-thread custom-scroll">
            <div className="chat-shell__header">
              <div>
                <h1 className="chat-shell__title">Ask Arion</h1>
                <p className="chat-shell__subtitle">
                  Explore our engineering, our car, and what makes Team Arion unique.
                </p>
              </div>
            </div>

            {isEmptyState ? (
              <section className="chat-intro">
                <div className="chat-intro__message">
                  <ChatMessageCard message={messages[0]} />
                </div>
              </section>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <ChatMessageCard key={message.id} message={message} />
                ))}
              </AnimatePresence>
            )}

            {loading ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="message-row"
                aria-live="polite"
              >
                <article className="message-card message-card--assistant message-card--typing">
                  <div className="typing-indicator">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-indicator__text">Thinking through that…</span>
                  </div>
                </article>
              </motion.div>
            ) : null}
          </div>

          <div className="chat-shell__composer">
            {!hasUserMessages ? (
              <SuggestedPrompts
                prompts={suggestedPrompts}
                disabled={loading}
                onSelect={(prompt) => void submitMessage(prompt)}
              />
            ) : null}
            <Composer
              value={draft}
              loading={loading}
              onChange={setDraft}
              onSubmit={() => void submitMessage()}
            />
            <p className="chat-shell__composer-note">
              Ask Arion is AI-powered.{' '}
              <button
                type="button"
                className="chat-shell__composer-note-button"
                onClick={() => setPrivacyOpen(true)}
              >
                Important Information
              </button>
            </p>
            {error ? <div className="composer-error">{error}</div> : null}
          </div>
        </motion.section>
      </main>

      <AnimatePresence>
        {privacyOpen ? (
          <motion.div
            className="privacy-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPrivacyOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="privacy-modal-title"
              className="privacy-modal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="privacy-modal__header">
                <div>
                  <h2 id="privacy-modal-title" className="privacy-modal__title">
                    Important Information
                  </h2>
                  <p className="privacy-modal__subtitle">
                    How Ask Arion handles conversation data, analytics, and AI responses.
                  </p>
                </div>

                <button
                  type="button"
                  className="privacy-modal__close"
                  aria-label="Close privacy information"
                  onClick={() => setPrivacyOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="privacy-modal__body custom-scroll">
                <section className="privacy-modal__section">
                  <p className="privacy-modal__copy">
                    Copyright © 2026 Team Arion. Created by Mark Yu.
                  </p>
                </section>

                <section className="privacy-modal__section">
                  <h3 className="privacy-modal__section-title">Overview</h3>
                  <p className="privacy-modal__copy">
                    Ask Arion is an AI-powered assistant for Team Arion. This service is designed to
                    answer questions about the team, the car, and the engineering behind the
                    project. We aim to minimise data retention and keep conversations scoped only to
                    the current chat session.
                  </p>
                </section>

                <section className="privacy-modal__section">
                  <h3 className="privacy-modal__section-title">Conversation Storage</h3>
                  <p className="privacy-modal__copy">
                    Conversations are stored temporarily on the server to preserve context across
                    follow-up questions. Each conversation is isolated from other conversations and
                    is not cross-referenced with any other chat.
                  </p>
                  <p className="privacy-modal__copy">
                    Conversation context is retained for up to 12 hours after the user&apos;s last
                    activity. After that period, it expires automatically.
                  </p>
                </section>

                <section className="privacy-modal__section">
                  <h3 className="privacy-modal__section-title">Data We Use</h3>
                  <p className="privacy-modal__copy">
                    We collect anonymized usage data, such as the number of queries and performance
                    metrics, to improve the system. We use Cloudflare Web Analytics and Microsoft
                    Clarity for analytics and product understanding.
                  </p>
                  <p className="privacy-modal__copy">
                    Ask Arion also keeps a server-side prompt audit log containing submitted
                    prompts, timestamps, conversation IDs, IP-related request metadata, and browser
                    headers such as user agent. This is used for operations, safety review, and
                    debugging.
                  </p>
                </section>

                <section className="privacy-modal__section">
                  <h3 className="privacy-modal__section-title">Data Subprocessors</h3>
                  <p className="privacy-modal__copy">
                    Ask Arion currently relies on the following subprocessors for core service
                    operation:
                  </p>
                  <ul className="privacy-modal__list">
                    <li>OpenRouter, Inc.</li>
                    <li>Alibaba Cloud International</li>
                    <li>DigitalOcean</li>
                    <li>Cloudflare, Inc.</li>
                    <li>Microsoft Clarity</li>
                  </ul>
                </section>

                <section className="privacy-modal__section">
                  <h3 className="privacy-modal__section-title">User Responsibility</h3>
                  <p className="privacy-modal__copy">
                    Users should not submit sensitive or personal information, including passwords,
                    personal identifiers, or any confidential material that should not be processed
                    by an AI system.
                  </p>
                </section>

                <section className="privacy-modal__section">
                  <h3 className="privacy-modal__section-title">AI Disclaimer</h3>
                  <p className="privacy-modal__copy">
                    Responses are generated by AI and may be inaccurate, incomplete, or outdated.
                    Ask Arion should be treated as an informational assistant rather than a
                    substitute for official confirmation or professional judgement.
                  </p>
                </section>

                <section className="privacy-modal__section">
                  <h3 className="privacy-modal__section-title">Contact</h3>
                  <p className="privacy-modal__copy">
                    For privacy or data-handling questions, please contact{' '}
                    <a className="privacy-modal__link" href="mailto:privacy@teamarion.org">
                      privacy@teamarion.org
                    </a>
                    .
                  </p>
                  <p className="privacy-modal__copy">
                    For general Team Arion enquiries, please contact{' '}
                    <a className="privacy-modal__link" href="mailto:info@teamarion.org">
                      info@teamarion.org
                    </a>
                    .
                  </p>
                </section>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
