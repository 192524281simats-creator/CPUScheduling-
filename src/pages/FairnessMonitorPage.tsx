import { useCallback, useEffect, useState } from 'react';
import { ArrowUpCircle, Scale } from 'lucide-react';
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

export function FairnessMonitorPage() {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [noAgingPriority, setNoAgingPriority] = useState<ScheduleRunResult | null>(null);
  const [hybridResult, setHybridResult] = useState<ScheduleRunResult | null>(null);
  const [agingThreshold, setAgingThreshold] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFairness = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await schedulerApi.listProcesses();
      setProcesses(list);
      if (list.length === 0) {
        setNoAgingPriority(null);
        setHybridResult(null);
        return;
      }

      const [prioRes, hybRes] = await Promise.all([
        schedulerApi.runSchedule('priority', {
          processes: list,
          preemptive: true,
          aging_enabled: false,
        }),
        schedulerApi.runSchedule('hybrid', {
          processes: list,
          aging_threshold: agingThreshold,
        }),
      ]);

      setNoAgingPriority(prioRes);
      setHybridResult(hybRes);
    } catch (err) {
      setError(extractApiError(err, 'Failed to compute fairness metrics.'));
    } finally {
      setLoading(false);
    }
  }, [agingThreshold]);

  useEffect(() => {
    void loadFairness();
  }, [loadFairness]);

  const promotions =
    hybridResult?.events.filter((e) => e.event_type === 'promotion') || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Starvation & Fairness Monitor"
        subtitle="Track Jain's Fairness Index, waiting-time variance, starvation risk per process, and MLFQ aging promotions."
        actions={
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400">
              MLFQ Aging Threshold:
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={agingThreshold}
              onChange={(e) => setAgingThreshold(Math.max(1, Number(e.target.value)))}
              className="w-20 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={loadFairness} />
      ) : processes.length === 0 || !hybridResult || !noAgingPriority ? (
        <EmptyState
          title="No processes available"
          description="Add processes in Process Management to monitor starvation and fairness."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Hybrid Jain Fairness Index"
              value={formatNumber(hybridResult.metrics.fairness_index, 4)}
              subtext={`Priority (no aging): ${formatNumber(noAgingPriority.metrics.fairness_index, 4)}`}
              icon={<Scale className="w-4 h-4" />}
            />
            <KpiCard
              label="Max Waiting Time (Hybrid)"
              value={`${hybridResult.metrics.max_waiting_time} u`}
              subtext={`Priority (no aging): ${noAgingPriority.metrics.max_waiting_time} u`}
            />
            <KpiCard
              label="Waiting Time Std Dev"
              value={`${formatNumber(hybridResult.metrics.waiting_time_std_dev, 2)} u`}
              subtext="Lower dispersion indicates fairer service"
            />
            <KpiCard
              label="Aging Promotions Triggered"
              value={hybridResult.metrics.promotions ?? 0}
              subtext={`Demotions: ${hybridResult.metrics.demotions ?? 0}`}
              icon={<ArrowUpCircle className="w-4 h-4 text-emerald-500" />}
            />
          </div>

          {/* Per-Process Starvation Risk Assessment */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Process Fairness &amp; Wait-to-Burst Ratio Comparison
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5">PID</th>
                    <th className="px-4 py-2.5 text-right">Burst</th>
                    <th className="px-4 py-2.5 text-right">Priority</th>
                    <th className="px-4 py-2.5 text-right">Wait (No-Age Prio)</th>
                    <th className="px-4 py-2.5 text-right">Wait (Hybrid MLFQ)</th>
                    <th className="px-4 py-2.5 text-right">Wait/Burst Ratio</th>
                    <th className="px-4 py-2.5 text-right">Starvation Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {hybridResult.process_results.map((hp) => {
                    const np = noAgingPriority.process_results.find((p) => p.pid === hp.pid);
                    const ratio = hp.waiting_time / Math.max(1, hp.burst_time);
                    const risk =
                      ratio >= 3 ? 'Elevated' : ratio >= 1.5 ? 'Moderate' : 'Nominal';
                    return (
                      <tr key={hp.pid}>
                        <td className="px-4 py-2.5 font-semibold">{hp.pid}</td>
                        <td className="px-4 py-2.5 text-right">{hp.burst_time}</td>
                        <td className="px-4 py-2.5 text-right">{hp.priority}</td>
                        <td className="px-4 py-2.5 text-right">{np?.waiting_time ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right text-cyan-600 dark:text-cyan-400 font-semibold">
                          {hp.waiting_time}
                        </td>
                        <td className="px-4 py-2.5 text-right">{ratio.toFixed(2)}x</td>
                        <td
                          className={`px-4 py-2.5 text-right font-sans font-semibold ${
                            risk === 'Elevated'
                              ? 'text-amber-500'
                              : risk === 'Moderate'
                                ? 'text-blue-500'
                                : 'text-emerald-500'
                          }`}
                        >
                          {risk}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Aging Promotions Log */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Anti-Starvation Aging Promotion Log
              </h3>
            </div>
            {promotions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No processes waited long enough to exceed the aging threshold ({agingThreshold}{' '}
                units). Try lowering the aging threshold or loading a heavier workload.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {promotions.map((ev, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                      t={ev.event_time} · {ev.pid} (Q{ev.previous_queue} → Q{ev.current_queue})
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 flex-1">{ev.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
