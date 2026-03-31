import { FormEvent, KeyboardEvent, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const PLACEHOLDERS = [
  'Ask about our car design...',
  'Ask about our engineering process...',
  'Ask about our awards...',
  'Ask how we built our car...',
];

interface ComposerProps {
  value: string;
  loading?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function Composer({ value, loading, onChange, onSubmit }: ComposerProps) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PLACEHOLDERS.length);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  const disabled = loading || !value.trim();

  return (
    <form onSubmit={handleSubmit} className="composer">
      <label htmlFor="chat-input" className="sr-only">
        Ask Ask Arion a question
      </label>

      <textarea
        id="chat-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        className="composer__input"
      />

      <AnimatePresence mode="wait" initial={false}>
        {!value ? (
          <motion.div
            key={PLACEHOLDERS[placeholderIndex]}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className="composer__placeholder"
            aria-hidden="true"
          >
            {PLACEHOLDERS[placeholderIndex]}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button type="submit" disabled={disabled} className="composer__submit">
        {loading ? 'Thinking…' : 'Send'}
      </button>
    </form>
  );
}
