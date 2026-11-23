import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Cpu,
  History,
  Layers,
  ListChecks,
  Play,
  Scale,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GanttChart } from '../charts/GanttChart';
import {
  EmptyState,
  ErrorAlert,
  KpiCard,
  LoadingSkeleton,
  PageHeader,
} from '../components/PageState';
import { useSchedulerSettings, useToast } from '../hooks/useAppHooks';
import { extractApiError, schedulerApi } from '../services/api';
import type { DashboardAnalytics } from '../types/scheduler';
import { formatDateTime, formatNumber } from '../utils/formatters';

export function OverviewDashboard() {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningQuick, setRunningQuick] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { notify } = useToast();
  const { settings } = useSchedulerSettings();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await schedulerApi.getDashboardAnalytics();
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load dashboard overview.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleRunQuickHybrid = async () => {
    setRunningQuick(true);
    try {
      const { simulation } = await schedulerApi.saveSimulation({
        name: 'Quick Adaptive Hybrid Run',
        algorithm: 'hybrid',
        configuration: {
          high_quantum: settings.high_quantum,
          medium_quantum: settings.medium_quantum,
          max_quantum: settings.max_quantum,
          aging_threshold: settings.aging_threshold,
          context_switch_cost: settings.context_switch_cost,
        },
      });
      notify(`Saved simulation #${simulation.id} (${simulation.algorithm}).`, 'success');
      await loadDashboard();
    } catch (err) {
      notify(extractApiError(err, 'Could not execute simulation.'), 'error');
    } finally {
      setRunningQuick(false);
    }
  };

  const chartData =
    data?.live_comparison?.comparisons.map((c) => ({
      name: c.algorithm.replace('Adaptive Hybrid MLFQ', 'Hybrid MLFQ'),
      'Avg Wait': c.metrics.average_waiting_time,
      'Avg Turnaround': c.metrics.average_turnaround_time,
      'Avg Response': c.metrics.average_response_time,
    })) || [];

  const latest = data?.latest_simulation;
  const bestWait = data?.live_comparison?.best_by_metric?.average_waiting_time;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Adaptive Hybrid CPU Scheduling Framework"
        subtitle="Intelligent Scheduling. Efficient Execution. Fair Process Management."
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate('/processes')}
              className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Manage Processes
            </button>
            <button
              type="button"
              onClick={handleRunQuickHybrid}
              disabled={runningQuick || (data?.process_count ?? 0) === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              {runningQuick ? 'Running...' : 'Run & Save Hybrid Simulation'}
            </button>
          </>
        }
      />

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={loadDashboard} />
      ) : !data ? null : (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Active Ready-Queue Processes"
              value={data.process_count}
              subtext={
                data.live_comparison
                  ? `${data.live_comparison.workload.workload_type}`
                  : 'Add processes to begin'
              }
              icon={<ListChecks className="w-4 h-4" />}
            />
            <KpiCard
              label="Persisted Simulations"
              value={data.total_simulations}
              subtext={latest ? `Latest: ${latest.algorithm}` : 'No saved simulations yet'}
              icon={<History className="w-4 h-4" />}
            />
            <KpiCard
              label="Lowest Avg Waiting (Live Benchmark)"
              value={bestWait ? `${formatNumber(bestWait.value, 2)} u` : '—'}
              subtext={bestWait ? `Leader: ${bestWait.winners.join(', ')}` : 'Requires >= 1 process'}
              icon={<Activity className="w-4 h-4" />}
            />
            <KpiCard
              label="Latest Fairness & CPU Utilization"
              value={
                latest
                  ? `${formatNumber(latest.cpu_utilization, 1)}%`
                  : data.live_comparison
                    ? `${formatNumber(data.live_comparison.comparisons[4]?.metrics.cpu_utilization, 1)}%`
                    : '—'
              }
              subtext={
                latest
                  ? `Fairness Index: ${formatNumber(latest.fairness_index, 3)}`
                  : 'Run a simulation to persist metrics'
              }
              icon={<Scale className="w-4 h-4" />}
            />
          </div>

          {data.process_count === 0 ? (
            <EmptyState
              title="No processes in the active workload"
              description="Add processes manually, import a CSV file, or load one of the built-in OS workloads to benchmark all five scheduling algorithms."
              action={
                <button
                  type="button"
                  onClick={() => navigate('/processes')}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Open Process Management
                </button>
              }
            />
          ) : (
            <>
              {/* Live 5-Algorithm Benchmark Chart + Workload Recommendation */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Live 5-Algorithm Benchmark on Active Workload
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Computed in Python across identical process inputs ({data.process_count}{' '}
                        processes)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/comparison')}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-cyan-400 hover:underline whitespace-nowrap"
                    >
                      Full Comparison <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#1e293b',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="Avg Wait" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Avg Turnaround" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Avg Response" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Workload Intelligence Panel */}
                {data.live_comparison && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 dark:text-cyan-400">
                        <Layers className="w-4 h-4" />
                        Workload Classification
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {data.live_comparison.workload.workload_type}
                      </h3>
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {data.live_comparison.workload.recommendation_reason}
                      </p>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono tabular-nums">
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">
                            Recommended Policy
                          </span>
                          <span className="font-semibold text-blue-600 dark:text-cyan-400 uppercase">
                            {data.live_comparison.workload.recommended_algorithm}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Avg Burst Time</span>
                          <span>{data.live_comparison.workload.statistics.avg_burst_time} u</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">
                            Burst Coeff. of Variation
                          </span>
                          <span>{data.live_comparison.workload.statistics.burst_cv}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">
                            Short / Long Jobs
                          </span>
                          <span>
                            {data.live_comparison.workload.statistics.short_job_count} /{' '}
                            {data.live_comparison.workload.statistics.long_job_count}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => navigate('/workload')}
                        className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Inspect Workload
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/what-if')}
                        className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                      >
                        What-If Studio
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Latest Persisted Simulation Gantt Preview */}
              {latest && latest.timeline && (
                <GanttChart
                  timeline={latest.timeline}
                  title={`Latest Saved Simulation (#${latest.id}) · ${latest.algorithm}`}
                />
              )}

              {/* Recent Simulations Table */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Recent Persisted Simulations
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/history')}
                    className="text-xs font-medium text-blue-600 dark:text-cyan-400 hover:underline"
                  >
                    View All History
                  </button>
                </div>

                {data.recent_simulations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    No simulations have been saved to SQLite yet. Click &ldquo;Run &amp; Save Hybrid
                    Simulation&rdquo; above or run any scheduler.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-2.5">Simulation</th>
                          <th className="px-4 py-2.5">Algorithm</th>
                          <th className="px-4 py-2.5 text-right">Processes</th>
                          <th className="px-4 py-2.5 text-right">Avg Wait</th>
                          <th className="px-4 py-2.5 text-right">Avg TAT</th>
                          <th className="px-4 py-2.5 text-right">CPU Util</th>
                          <th className="px-4 py-2.5 text-right">Switches</th>
                          <th className="px-4 py-2.5 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 font-mono tabular-nums">
                        {data.recent_simulations.map((sim) => (
                          <tr
                            key={sim.id}
                            onClick={() => navigate(`/gantt?simId=${sim.id}`)}
                            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                          >
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
                            <td className="px-4 py-2.5 text-right">{sim.total_context_switches}</td>
                            <td className="px-4 py-2.5 text-right font-sans text-xs text-slate-500">
                              {formatDateTime(sim.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
