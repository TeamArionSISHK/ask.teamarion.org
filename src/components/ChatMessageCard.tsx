import { Fragment } from 'react';
import { motion } from 'framer-motion';
import type { ChatMessage } from '../types/chat';
import { RichTextMessage } from './RichTextMessage';

interface ChatMessageCardProps {
  message: ChatMessage;
}

export function ChatMessageCard({ message }: ChatMessageCardProps) {
  const isUser = message.role === 'user';
  const hasOfficialActions = !isUser && Boolean(message.officialActions?.length);

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
          {hasOfficialActions ? (
            <p className="message-card__links" aria-label="Official Team Arion links">
              <span className="message-card__links-label">Official links:</span>{' '}
              {message.officialActions?.map((action, index) => (
                <Fragment key={action.id}>
                  {index > 0 ? <span className="message-card__links-separator"> · </span> : null}
                  <a
                    className="message-card__inline-link"
                    href={action.href}
                    target={action.kind === 'external' ? '_blank' : undefined}
                    rel={action.kind === 'external' ? 'noreferrer noopener' : undefined}
                    aria-label={action.label}
                  >
                    {action.label}
                  </a>
                </Fragment>
              ))}
            </p>
          ) : null}
        </div>
      </article>
    </motion.div>
  );
}
