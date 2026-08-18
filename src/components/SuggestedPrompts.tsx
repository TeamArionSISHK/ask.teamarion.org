import { motion } from 'framer-motion';

interface SuggestedPromptsProps {
  prompts: string[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
  scrollable?: boolean;
}

export function SuggestedPrompts({
  prompts,
  disabled,
  onSelect,
  scrollable = false,
}: SuggestedPromptsProps) {
  return (
    <div className={`prompt-grid ${scrollable ? 'prompt-grid--scroll' : ''}`}>
      {prompts.map((prompt, index) => (
        <motion.button
          key={prompt}
          type="button"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: index * 0.04 }}
          onClick={() => onSelect(prompt)}
          disabled={disabled}
          className="prompt-card"
        >
          <span className="prompt-card__text">{prompt}</span>
        </motion.button>
      ))}
    </div>
  );
}
