import { motion } from 'framer-motion';
import type { RecentLogEntry } from '../types/chat';

interface RecentLogsPanelProps {
  logs: RecentLogEntry[];
  loading?: boolean;
  onRefresh: () => void;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

export function RecentLogsPanel({ logs, loading, onRefresh }: RecentLogsPanelProps) {
  return (
    <aside className="rounded-2xl border border-white/10 bg-[color:var(--surface)] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.78rem] uppercase tracking-[0.14em] text-slate-400">
            Recent logs
          </div>
          <div className="mt-1 text-[0.92rem] text-slate-300">
            Latest backend request activity
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-[0.86rem] font-medium text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-3">
        {logs.length ? (
          logs.map((log) => (
            <motion.article
              key={log.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
              className="rounded-xl border border-white/8 bg-black/10 px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.12em] text-slate-400">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${
                      log.level === 'error' ? 'bg-red-400' : 'bg-emerald-400'
                    }`}
                  />
                  {log.scope}
                </div>
                <time className="font-mono text-[0.74rem] text-slate-500">
                  {timeFormatter.format(new Date(log.timestamp))}
                </time>
              </div>
              <p className="mt-2 text-[0.92rem] leading-[1.5] text-slate-100">
                {log.message}
              </p>
              {log.detail ? (
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/6 bg-black/20 px-3 py-2 font-mono text-[0.74rem] leading-[1.45] text-slate-300">
                  {log.detail}
                </pre>
              ) : null}
            </motion.article>
          ))
        ) : (
          <div className="rounded-xl border border-white/8 bg-black/10 px-3 py-4 text-[0.9rem] text-slate-400">
            No backend logs yet.
          </div>
        )}
      </div>
    </aside>
  );
}
