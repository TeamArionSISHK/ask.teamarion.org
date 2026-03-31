import { motion } from 'framer-motion';

interface SuggestedPromptsProps {
  prompts: string[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
}

export function SuggestedPrompts({ prompts, disabled, onSelect }: SuggestedPromptsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {prompts.map((prompt, index) => (
        <motion.button
          key={prompt}
          type="button"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: index * 0.04 }}
          onClick={() => onSelect(prompt)}
          disabled={disabled}
          className="rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--surface-soft)] px-4 py-3 text-left text-[0.95rem] font-medium text-slate-100 transition hover:border-[color:var(--accent-soft)] hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {prompt}
        </motion.button>
      ))}
    </div>
  );
}
