import type { ProcessResult } from '../types/scheduler';
import { getProcessColor } from '../utils/formatters';

export function ProcessResultsTable({ results }: { results: ProcessResult[] }) {
  if (results.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Process Completion Metrics
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {results.length} processes
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-2.5">PID</th>
              <th className="px-4 py-2.5 text-right">Arrival</th>
              <th className="px-4 py-2.5 text-right">Burst</th>
              <th className="px-4 py-2.5 text-right">Priority</th>
              <th className="px-4 py-2.5 text-right">First Start</th>
              <th className="px-4 py-2.5 text-right">Completion</th>
              <th className="px-4 py-2.5 text-right">Turnaround</th>
              <th className="px-4 py-2.5 text-right">Waiting</th>
              <th className="px-4 py-2.5 text-right">Response</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 font-mono tabular-nums text-xs sm:text-sm">
            {results.map((p) => {
              const c = getProcessColor(p.pid);
              return (
                <tr
                  key={p.pid}
                  className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                >
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-sm ${c.bg}`} />
                      {p.pid}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                    {p.arrival_time}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                    {p.burst_time}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                    {p.priority}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                    {p.first_start_time}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-900 dark:text-white">
                    {p.completion_time}
                  </td>
                  <td className="px-4 py-2.5 text-right text-blue-600 dark:text-blue-400 font-medium">
                    {p.turnaround_time}
                  </td>
                  <td className="px-4 py-2.5 text-right text-cyan-600 dark:text-cyan-400 font-medium">
                    {p.waiting_time}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                    {p.response_time}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
