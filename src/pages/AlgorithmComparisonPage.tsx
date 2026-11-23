import { useCallback, useEffect, useState } from 'react';
import { Award, Play } from 'lucide-react';
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
import { EmptyState, ErrorAlert, LoadingSkeleton, PageHeader } from '../components/PageState';
import { useSchedulerSettings } from '../hooks/useAppHooks';
import { extractApiError, schedulerApi } from '../services/api';
import type { ComparisonResponse } from '../types/scheduler';
import { formatNumber } from '../utils/formatters';

export function AlgorithmComparisonPage() {
  const { settings } = useSchedulerSettings();
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [timeQuantum, setTimeQuantum] = useState(settings.time_quantum);
  const [highQuantum, setHighQuantum] = useState(settings.high_quantum);
  const [mediumQuantum, setMediumQuantum] = useState(settings.medium_quantum);
  const [agingThreshold, setAgingThreshold] = useState(settings.aging_threshold);
  const [csCost, setCsCost] = useState(settings.context_switch_cost);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runComparison = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await schedulerApi.runComparison({
        time_quantum: timeQuantum,
        high_quantum: highQuantum,
        medium_quantum: mediumQuantum,
        aging_threshold: agingThreshold,
        context_switch_cost: csCost,
      });
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to compare algorithms.'));
    } finally {
      setLoading(false);
    }
  }, [timeQuantum, highQuantum, mediumQuantum, agingThreshold, csCost]);

  useEffect(() => {
    void runComparison();
  }, [runComparison]);

  const chartData =
    data?.comparisons.map((c) => ({
      name: c.algorithm.replace('Adaptive Hybrid MLFQ', 'Hybrid MLFQ'),
      'Avg Wait': c.metrics.average_waiting_time,
      'Avg Turnaround': c.metrics.average_turnaround_time,
      'Avg Response': c.metrics.average_response_time,
    })) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="5-Algorithm Empirical Comparison"
        subtitle="Runs FCFS, SJF, Round Robin, Priority, and Adaptive Hybrid MLFQ on identical process inputs and identifies the empirical best performer per metric."
        actions={
          <button
            type="button"
            onClick={() => void runComparison()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            Re-run Comparison
          </button>
        }
      />

      {/* Parameters */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">RR Quantum</label>
          <input
            type="number"
            min={1}
            value={timeQuantum}
            onChange={(e) => setTimeQuantum(Math.max(1, Number(e.target.value)))}
            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Hybrid Q1</label>
          <input
            type="number"
            min={1}
            value={highQuantum}
            onChange={(e) => setHighQuantum(Math.max(1, Number(e.target.value)))}
            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Hybrid Q2</label>
          <input
            type="number"
            min={1}
            value={mediumQuantum}
            onChange={(e) => setMediumQuantum(Math.max(1, Number(e.target.value)))}
            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Aging Threshold</label>
          <input
            type="number"
            min={1}
            value={agingThreshold}
            onChange={(e) => setAgingThreshold(Math.max(1, Number(e.target.value)))}
            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">CS Cost</label>
          <input
            type="number"
            min={0}
            value={csCost}
            onChange={(e) => setCsCost(Math.max(0, Number(e.target.value)))}
            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          />
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={runComparison} />
      ) : !data || data.comparisons.length === 0 ? (
        <EmptyState
          title="No processes to compare"
          description="Add processes in Process Management to benchmark all five algorithms."
        />
      ) : (
        <>
          {/* Empirical Metric Winners */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(data.best_by_metric)
              .slice(0, 4)
              .map(([key, info]) => (
                <div
                  key={key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-4 space-y-1"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{info.label}</span>
                    <Award className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {info.winners.join(' · ')}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-cyan-600 dark:text-cyan-400">
                    Value: {formatNumber(info.value, 3)}
                  </div>
                </div>
              ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Waiting, Turnaround &amp; Response Time Comparison
            </h3>
            <div className="h-80">
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

          {/* Comparison Matrix */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Complete Comparison Matrix ({data.process_count} identical processes)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5">Algorithm</th>
                    <th className="px-4 py-2.5 text-right">Avg Wait</th>
                    <th className="px-4 py-2.5 text-right">Avg TAT</th>
                    <th className="px-4 py-2.5 text-right">Avg Resp</th>
                    <th className="px-4 py-2.5 text-right">CPU Util</th>
                    <th className="px-4 py-2.5 text-right">Throughput</th>
                    <th className="px-4 py-2.5 text-right">Context Switches</th>
                    <th className="px-4 py-2.5 text-right">Fairness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {data.comparisons.map((row) => (
                    <tr key={row.algorithm_key} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-2.5 font-sans font-semibold text-slate-900 dark:text-white">
                        {row.algorithm}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {formatNumber(row.metrics.average_waiting_time, 2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {formatNumber(row.metrics.average_turnaround_time, 2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {formatNumber(row.metrics.average_response_time, 2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {formatNumber(row.metrics.cpu_utilization, 2)}%
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {formatNumber(row.metrics.throughput, 4)}
                      </td>
                      <td className="px-4 py-2.5 text-right">{row.metrics.total_context_switches}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                        {formatNumber(row.metrics.fairness_index, 4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
