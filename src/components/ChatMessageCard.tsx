import { motion } from 'framer-motion';
import type { ChatMessage } from '../types/chat';
import { RichTextMessage } from './RichTextMessage';

interface ChatMessageCardProps {
  message: ChatMessage;
}

export function ChatMessageCard({ message }: ChatMessageCardProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`message-row ${isUser ? 'message-row--user' : 'message-row--assistant'}`}
    >
      <article className={`message-card ${isUser ? 'message-card--user' : 'message-card--assistant'}`}>
        <div className="message-card__body">
          <RichTextMessage text={message.text} />
          {message.status === 'streaming' ? <span className="message-card__cursor" /> : null}
        </div>
      </article>
    </motion.div>
  );
}
