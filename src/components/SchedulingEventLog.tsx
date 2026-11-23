import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { SchedulingEvent } from '../types/scheduler';

export function SchedulingEventLog({ events }: { events: SchedulingEvent[] }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const eventTypes = useMemo(() => {
    const s = new Set(events.map((e) => e.event_type));
    return ['all', ...Array.from(s)];
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (typeFilter !== 'all' && ev.event_type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          ev.pid.toLowerCase().includes(q) ||
          ev.explanation.toLowerCase().includes(q) ||
          ev.selected_algorithm.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [events, search, typeFilter]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Scheduling Decision Explanations
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Generated directly from real scheduling events ({filtered.length} of {events.length} events)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter PID or reason..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All Event Types' : t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No scheduling events match the active filter.
          </div>
        ) : (
          filtered.map((ev, idx) => (
            <div
              key={`${ev.event_time}-${ev.pid}-${idx}`}
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs hover:bg-slate-50 dark:hover:bg-slate-900/40"
            >
              <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                <span className="text-slate-500 dark:text-slate-400 w-12">t={ev.event_time}</span>
                <span className="font-semibold text-slate-900 dark:text-white w-14 truncate">
                  {ev.pid}
                </span>
                <span
                  className={`font-medium w-28 truncate ${
                    ev.event_type === 'promotion'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : ev.event_type === 'demotion'
                        ? 'text-amber-600 dark:text-amber-400'
                        : ev.event_type === 'quantum_adjustment'
                          ? 'text-cyan-600 dark:text-cyan-400'
                          : ev.event_type === 'context_switch'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {ev.event_type}
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 flex-1">{ev.explanation}</p>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                {ev.current_queue ? `Q${ev.current_queue}` : ev.selected_algorithm}
                {ev.selected_time_quantum ? ` · q=${ev.selected_time_quantum}` : ''}
                {` · rem=${ev.remaining_burst_time}`}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
