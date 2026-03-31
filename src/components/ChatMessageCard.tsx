import { motion } from 'framer-motion';
import type { ChatMessage } from '../types/chat';
import { RichTextMessage } from './RichTextMessage';

interface ChatMessageCardProps {
  message: ChatMessage;
}

export function ChatMessageCard({ message }: ChatMessageCardProps) {
  const isUser = message.role === 'user';

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`rounded-2xl border px-5 py-4 ${
        isUser
          ? 'ml-auto max-w-[42rem] border-[color:var(--accent-soft)] bg-[rgba(92,62,216,0.14)]'
          : 'mr-auto max-w-[46rem] border-white/10 bg-[color:var(--surface)]'
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.14em] text-slate-400">
        <span>{isUser ? 'You' : 'Ask Arion'}</span>
        {message.status === 'error' ? (
          <span className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-[0.65rem] tracking-[0.08em] text-red-200">
            issue
          </span>
        ) : null}
      </div>
      <div className="space-y-3">
        <RichTextMessage text={message.text} />
        {message.status === 'streaming' ? (
          <span className="inline-block h-[1.05em] w-[0.62rem] translate-y-[0.12em] rounded-sm bg-[color:var(--accent)] align-baseline opacity-80 animate-pulse" />
        ) : null}
      </div>
    </motion.article>
  );
}
