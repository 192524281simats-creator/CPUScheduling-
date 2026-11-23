import { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import { extractApiError, schedulerApi } from '../services/api';
import type { ProcessItem, ScheduleRunResult } from '../types/scheduler';
import { formatNumber } from '../utils/formatters';

interface SweepPoint {
  csCost: number;
  cpuUtil: number;
  overheadPct: number;
  avgWait: number;
  switches: number;
}

export function ContextSwitchAnalyzerPage() {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [algo, setAlgo] = useState<'rr' | 'hybrid' | 'priority' | 'sjf' | 'fcfs'>('hybrid');
  const [sweep, setSweep] = useState<SweepPoint[]>([]);
  const [sampleRun, setSampleRun] = useState<ScheduleRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await schedulerApi.listProcesses();
      setProcesses(list);
      if (list.length === 0) {
        setSweep([]);
        setSampleRun(null);
        return;
      }

      const costs = [0, 1, 2, 3, 5];
      const results = await Promise.all(
        costs.map((cost) =>
          schedulerApi.runSchedule(algo, {
            processes: list,
            context_switch_cost: cost,
            preemptive: algo === 'priority',
          }),
        ),
      );

      setSweep(
        results.map((r, idx) => ({
          csCost: costs[idx],
          cpuUtil: Number(r.metrics.cpu_utilization.toFixed(2)),
          overheadPct: Number(r.metrics.overhead_percentage.toFixed(2)),
          avgWait: Number(r.metrics.average_waiting_time.toFixed(2)),
          switches: r.metrics.total_context_switches,
        })),
      );
      setSampleRun(results[1]); // CS cost = 1 for transition inspection
    } catch (err) {
      setError(extractApiError(err, 'Context-switch analysis failed.'));
    } finally {
      setLoading(false);
    }
  }, [algo]);

  useEffect(() => {
    void runAnalysis();
  }, [runAnalysis]);

  const transitions =
    sampleRun?.timeline.filter((t) => t.event_type === 'context_switch') || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Context Switch Analyzer"
        subtitle="Measure process-to-process transitions, scheduling overhead percentage, and CPU utilization degradation across context-switch costs."
        actions={
          <select
            value={algo}
            onChange={(e) => setAlgo(e.target.value as typeof algo)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="hybrid">Adaptive Hybrid MLFQ</option>
            <option value="rr">Round Robin (q=4)</option>
            <option value="priority">Preemptive Priority</option>
            <option value="sjf">SJF</option>
            <option value="fcfs">FCFS</option>
          </select>
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={runAnalysis} />
      ) : processes.length === 0 || !sampleRun ? (
        <EmptyState
          title="No processes available"
          description="Add processes in Process Management to analyze context-switch overhead."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Context Switches"
              value={sampleRun.metrics.total_context_switches}
              subtext="Excludes initial dispatch & idle gaps"
              icon={<Activity className="w-4 h-4" />}
            />
            <KpiCard
              label="Overhead at CS=1"
              value={`${sampleRun.metrics.total_scheduling_overhead} u`}
              subtext={`${formatNumber(sampleRun.metrics.overhead_percentage, 2)}% of timeline`}
            />
            <KpiCard
              label="Productive Busy Time"
              value={`${sampleRun.metrics.productive_busy_time} u`}
              subtext={`CPU Utilization: ${formatNumber(sampleRun.metrics.cpu_utilization, 2)}%`}
            />
            <KpiCard
              label="Utilization Drop (CS=0 → 5)"
              value={
                sweep.length >= 2
                  ? `${formatNumber(sweep[0].cpuUtil - sweep[sweep.length - 1].cpuUtil, 2)}%`
                  : '0%'
              }
              subtext="Sensitivity across overhead range"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Context-Switch Cost Sensitivity (CS Cost = 0, 1, 2, 3, 5)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sweep}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
                  <XAxis dataKey="csCost" tick={{ fontSize: 11, fill: '#94a3b8' }} />
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
                  <Line
                    type="monotone"
                    dataKey="cpuUtil"
                    name="CPU Utilization (%)"
                    stroke="#2563eb"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="overheadPct"
                    name="Overhead (%)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgWait"
                    name="Avg Waiting Time"
                    stroke="#06b6d4"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Recorded Process Transitions (at CS Cost = 1)
              </h3>
            </div>
            {transitions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Zero process-to-process context switches occurred under this workload and algorithm.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2">Switch #</th>
                      <th className="px-4 py-2">From Process</th>
                      <th className="px-4 py-2">To Process</th>
                      <th className="px-4 py-2 text-right">Start Time</th>
                      <th className="px-4 py-2 text-right">End Time</th>
                      <th className="px-4 py-2 text-right">Overhead</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                    {transitions.map((t, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2">#{idx + 1}</td>
                        <td className="px-4 py-2">{t.from_pid || '—'}</td>
                        <td className="px-4 py-2 font-semibold text-cyan-600 dark:text-cyan-400">
                          {t.to_pid || '—'}
                        </td>
                        <td className="px-4 py-2 text-right">t={t.start_time}</td>
                        <td className="px-4 py-2 text-right">t={t.end_time}</td>
                        <td className="px-4 py-2 text-right">{t.duration} u</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
