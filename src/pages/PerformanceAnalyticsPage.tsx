import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  EmptyState,
  ErrorAlert,
  KpiCard,
  LoadingSkeleton,
  PageHeader,
} from '../components/PageState';
import { ProcessResultsTable } from '../components/ProcessResultsTable';
import { extractApiError, schedulerApi } from '../services/api';
import type { PerformanceAnalyticsResponse, SimulationRecord } from '../types/scheduler';
import { formatNumber } from '../utils/formatters';

export function PerformanceAnalyticsPage() {
  const [simulations, setSimulations] = useState<SimulationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [perf, setPerf] = useState<PerformanceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (targetId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const sims = await schedulerApi.listSimulations();
      setSimulations(sims);
      if (sims.length === 0) {
        setPerf(null);
        return;
      }
      const id = targetId ?? sims[0].id;
      setSelectedId(id);
      const data = await schedulerApi.getPerformanceAnalytics(id);
      setPerf(data);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load performance analytics.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const cpuBreakdown = perf
    ? [
        {
          name: 'Productive Busy Time',
          value: perf.context_switch_analysis.productive_busy_time,
          color: '#2563eb',
        },
        {
          name: 'CPU Idle Time',
          value: perf.context_switch_analysis.cpu_idle_time,
          color: '#64748b',
        },
        {
          name: 'Context Switch Overhead',
          value: perf.context_switch_analysis.total_scheduling_overhead,
          color: '#f59e0b',
        },
      ].filter((d) => d.value > 0)
    : [];

  const processChartData =
    perf?.simulation.process_results?.map((p) => ({
      pid: p.pid,
      'Waiting Time': p.waiting_time,
      'Turnaround Time': p.turnaround_time,
      'Response Time': p.response_time,
    })) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Analytics"
        subtitle="Detailed per-process timing metrics, CPU time utilization breakdown, throughput, and fairness indicators."
        actions={
          simulations.length > 0 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => void loadAnalytics(Number(e.target.value))}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              {simulations.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} · {s.name}
                </option>
              ))}
            </select>
          )
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={() => void loadAnalytics(selectedId ?? undefined)} />
      ) : !perf ? (
        <EmptyState
          title="No persisted simulation selected"
          description="Save at least one simulation from the Algorithms or Adaptive Hybrid page to inspect deep performance analytics."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Avg Waiting Time"
              value={`${formatNumber(perf.simulation.avg_waiting_time, 2)} u`}
              subtext={`Std Dev: ${formatNumber(perf.starvation_and_fairness.waiting_time_std_dev, 2)} u`}
            />
            <KpiCard
              label="Avg Turnaround Time"
              value={`${formatNumber(perf.simulation.avg_turnaround_time, 2)} u`}
              subtext={`Avg Response: ${formatNumber(perf.simulation.avg_response_time, 2)} u`}
            />
            <KpiCard
              label="CPU Utilization"
              value={`${formatNumber(perf.simulation.cpu_utilization, 2)}%`}
              subtext={`Throughput: ${formatNumber(perf.simulation.throughput, 3)} proc/u`}
            />
            <KpiCard
              label="Jain Fairness Index"
              value={formatNumber(perf.starvation_and_fairness.fairness_index, 4)}
              subtext={`Max Wait: ${perf.starvation_and_fairness.max_waiting_time} u`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Per-Process Waiting, Turnaround &amp; Response Time
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
                    <XAxis dataKey="pid" tick={{ fontSize: 11, fill: '#94a3b8' }} />
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
                    <Bar dataKey="Waiting Time" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Turnaround Time" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Response Time" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 flex flex-col justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                CPU Time Allocation
              </h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cpuBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={3}
                    >
                      {cpuBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#1e293b',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#f8fafc',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 text-center">
                Total Simulation Horizon: {perf.simulation.total_simulation_time} time units
              </div>
            </div>
          </div>

          <ProcessResultsTable results={perf.simulation.process_results || []} />
        </>
      )}
    </div>
  );
}
