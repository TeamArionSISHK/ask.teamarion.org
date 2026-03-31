import { startTransition, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Header } from './components/Header';
import { SuggestedPrompts } from './components/SuggestedPrompts';
import { ChatMessageCard } from './components/ChatMessageCard';
import { Composer } from './components/Composer';
import { sendChatMessage, streamChatMessage } from './lib/api';
import { suggestedPrompts } from './lib/suggestions';
import type { ChatMessage } from './types/chat';

const initialAssistantMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text:
    "Hi, I'm Ask Arion. I can answer short questions about Team Arion, the car, and the team's AI workflow using the information currently loaded into this app.",
};

const MAX_CONTEXT_MESSAGES = 10;

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([initialAssistantMessage]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildRequestPayload(message: string) {
    const history = messages
      .filter((entry) => entry.id !== 'welcome' && entry.status !== 'error' && entry.text.trim())
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((entry) => ({
        role: entry.role,
        text: entry.text,
      }));

    return {
      message,
      history,
    };
  }

  async function submitMessage(rawMessage?: string) {
    const message = (rawMessage ?? draft).trim();
    if (!message || loading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: message,
    };

    startTransition(() => {
      setMessages((current) => [...current, userMessage]);
      setDraft('');
      setError(null);
    });
    setLoading(true);

    const assistantMessageId = crypto.randomUUID();
    let startedStreaming = false;

    try {
      await streamChatMessage(
        buildRequestPayload(message),
        {
          onStart: () => {
            startedStreaming = true;
            startTransition(() => {
              setMessages((current) => [
                ...current,
                {
                  id: assistantMessageId,
                  role: 'assistant',
                  text: '',
                  status: 'streaming',
                },
              ]);
            });
          },
          onDelta: (delta) => {
            startTransition(() => {
              setMessages((current) =>
                current.map((entry) =>
                  entry.id === assistantMessageId
                    ? {
                        ...entry,
                        text: entry.text + delta,
                        status: 'streaming',
                      }
                    : entry,
                ),
              );
            });
          },
          onDone: (response) => {
            startTransition(() => {
              setMessages((current) =>
                current.map((entry) =>
                  entry.id === assistantMessageId
                    ? {
                        ...entry,
                        text: response.text,
                        status: 'idle',
                      }
                    : entry,
                ),
              );
            });
          },
          onError: (messageText) => {
            throw new Error(messageText);
          },
        },
      );
    } catch (caughtError) {
      if (startedStreaming) {
        const fallback =
          caughtError instanceof Error
            ? caughtError.message
            : 'The assistant is unavailable right now.';
        setError(fallback);
        startTransition(() => {
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantMessageId
                ? {
                    ...entry,
                    text: fallback,
                    status: 'error',
                  }
                : entry,
            ),
          );
        });
      } else {
        try {
          const response = await sendChatMessage(buildRequestPayload(message));
          startTransition(() => {
            setMessages((current) => [
              ...current,
              {
                id: assistantMessageId,
                role: 'assistant',
                text: response.text,
                status: 'idle',
              },
            ]);
          });
        } catch (fallbackError) {
          const fallback =
            fallbackError instanceof Error
              ? fallbackError.message
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
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-slate-50">
      <div className="page-glow" aria-hidden="true" />
      <Header />
      <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-5xl flex-col px-6 pb-8 pt-8">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="mb-6"
        >
          <div>
            <h1 className="max-w-3xl text-[1.95rem] font-semibold tracking-[-0.02em] text-slate-50">
              Ask Team Arion a quick question.
            </h1>
            <p className="mt-3 max-w-2xl text-[1rem] leading-[1.68] text-slate-300">
              Short answers, grounded in the current Team Arion knowledge pack and focused on the team, the cars, and the wider mission behind the project.
            </p>
          </div>
        </motion.section>

        <section className="mb-6">
          <SuggestedPrompts
            prompts={suggestedPrompts}
            disabled={loading}
            onSelect={(prompt) => void submitMessage(prompt)}
          />
        </section>

        <section className="flex-1 rounded-[1.75rem] border border-white/10 bg-[rgba(10,14,30,0.78)] p-4 shadow-[0_18px_52px_rgba(0,0,0,0.22)] backdrop-blur-sm">
          <div className="custom-scroll flex h-full min-h-[26rem] flex-col gap-4 overflow-y-auto pr-2">
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <ChatMessageCard key={message.id} message={message} />
              ))}
            </AnimatePresence>
            {loading && !messages.some((message) => message.status === 'streaming' && message.text) ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mr-auto max-w-md rounded-2xl border border-white/10 bg-[color:var(--surface)] px-5 py-4"
                aria-live="polite"
              >
                <div className="mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-slate-400">
                  Ask Arion
                </div>
                <div className="flex items-center gap-2 text-[0.98rem] text-slate-300">
                  <span className="typing-dot" />
                  <span className="typing-dot [animation-delay:120ms]" />
                  <span className="typing-dot [animation-delay:240ms]" />
                  Thinking through that...
                </div>
              </motion.div>
            ) : null}
          </div>
        </section>

        <div className="mt-5">
          <Composer
            value={draft}
            loading={loading}
            onChange={setDraft}
            onSubmit={() => void submitMessage()}
          />
          {error ? (
            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[0.92rem] text-red-100">
              {error}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
