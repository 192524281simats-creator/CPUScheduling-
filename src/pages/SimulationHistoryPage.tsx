import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Clock, FileSpreadsheet, Search, Trash2 } from 'lucide-react';
import { EmptyState, ErrorAlert, LoadingSkeleton, PageHeader } from '../components/PageState';
import { useToast } from '../hooks/useAppHooks';
import { extractApiError, schedulerApi } from '../services/api';
import type { SimulationRecord } from '../types/scheduler';
import { formatDateTime, formatNumber } from '../utils/formatters';

export function SimulationHistoryPage() {
  const [simulations, setSimulations] = useState<SimulationRecord[]>([]);
  const [search, setSearch] = useState('');
  const [algoFilter, setAlgoFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { notify } = useToast();

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await schedulerApi.listSimulations();
      setSimulations(list);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load simulation history.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleDelete = async (id: number) => {
    try {
      await schedulerApi.deleteSimulation(id);
      setSimulations((prev) => prev.filter((s) => s.id !== id));
      notify(`Deleted simulation #${id}.`, 'info');
    } catch (err) {
      notify(extractApiError(err, 'Failed to delete simulation.'), 'error');
    }
  };

  const algorithms = useMemo(() => {
    const s = new Set(simulations.map((sim) => sim.algorithm));
    return ['all', ...Array.from(s)];
  }, [simulations]);

  const filtered = useMemo(() => {
    return simulations.filter((s) => {
      if (algoFilter !== 'all' && s.algorithm !== algoFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.algorithm.toLowerCase().includes(q) ||
          String(s.id).includes(q)
        );
      }
      return true;
    });
  }, [simulations, algoFilter, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulation History"
        subtitle="Persistent SQLite record of executed scheduling runs, configurations, and performance metrics."
      />

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={loadHistory} />
      ) : simulations.length === 0 ? (
        <EmptyState
          title="No simulations saved yet"
          description="Run and save any algorithm from the Overview Dashboard, Algorithms, or Adaptive Hybrid Scheduler page."
          action={
            <button
              type="button"
              onClick={() => navigate('/hybrid')}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              Run Adaptive Hybrid Scheduler
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Saved Simulations ({filtered.length})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search simulations..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <select
                value={algoFilter}
                onChange={(e) => setAlgoFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              >
                {algorithms.map((a) => (
                  <option key={a} value={a}>
                    {a === 'all' ? 'All Algorithms' : a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-2.5">ID &amp; Name</th>
                  <th className="px-4 py-2.5">Algorithm</th>
                  <th className="px-4 py-2.5 text-right">Procs</th>
                  <th className="px-4 py-2.5 text-right">Avg Wait</th>
                  <th className="px-4 py-2.5 text-right">Avg TAT</th>
                  <th className="px-4 py-2.5 text-right">CPU Util</th>
                  <th className="px-4 py-2.5 text-right">Fairness</th>
                  <th className="px-4 py-2.5 text-right">Created</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {filtered.map((sim) => (
                  <tr key={sim.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-2.5 font-sans font-medium text-slate-900 dark:text-white">
                      #{sim.id} · {sim.name}
                    </td>
                    <td className="px-4 py-2.5 font-sans text-blue-600 dark:text-cyan-400">
                      {sim.algorithm}
                    </td>
                    <td className="px-4 py-2.5 text-right">{sim.process_count}</td>
                    <td className="px-4 py-2.5 text-right">
                      {formatNumber(sim.avg_waiting_time, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {formatNumber(sim.avg_turnaround_time, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {formatNumber(sim.cpu_utilization, 1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {formatNumber(sim.fairness_index, 3)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-sans text-xs text-slate-500">
                      {formatDateTime(sim.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/gantt?simId=${sim.id}`)}
                          title="View Gantt Timeline"
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-cyan-500"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/analytics`)}
                          title="View Analytics"
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-500"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/reports?simId=${sim.id}`)}
                          title="Export Report"
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-emerald-500"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(sim.id)}
                          title="Delete Simulation"
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
