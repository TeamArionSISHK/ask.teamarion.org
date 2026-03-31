import { FormEvent } from 'react';

interface ComposerProps {
  value: string;
  loading?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function Composer({ value, loading, onChange, onSubmit }: ComposerProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  const disabled = loading || !value.trim();

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.35rem] border border-white/10 bg-[rgba(14,19,38,0.92)] p-3 shadow-[0_10px_32px_rgba(0,0,0,0.2)]"
    >
      <label htmlFor="chat-input" className="sr-only">
        Ask Ask Arion a question
      </label>
      <div className="flex items-end gap-3">
        <textarea
          id="chat-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          placeholder="Ask about our car, engineering, or team..."
          className="min-h-[88px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[1rem] leading-[1.65] text-slate-50 outline-none placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[color:var(--accent)] px-5 text-[0.95rem] font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[rgba(92,62,216,0.35)] disabled:text-white/75"
        >
          {loading ? 'Thinking...' : 'Send'}
        </button>
      </div>
    </form>
  );
}
