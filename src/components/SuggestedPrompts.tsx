import { motion } from 'framer-motion';

interface SuggestedPromptsProps {
  prompts: string[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
  tone?: 'default' | 'follow-up';
}

export function SuggestedPrompts({
  prompts,
  disabled,
  onSelect,
  tone = 'default',
}: SuggestedPromptsProps) {
  return (
    <div className={`prompt-grid ${tone === 'follow-up' ? 'prompt-grid--follow-up' : ''}`}>
      {prompts.map((prompt, index) => (
        <motion.button
          key={prompt}
          type="button"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: index * 0.04 }}
          onClick={() => onSelect(prompt)}
          disabled={disabled}
          className={`prompt-card ${tone === 'follow-up' ? 'prompt-card--follow-up' : ''}`}
        >
          <span className="prompt-card__text">{prompt}</span>
        </motion.button>
      ))}
    </div>
  );
}
