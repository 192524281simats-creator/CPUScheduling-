import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Layers, Play, Save } from 'lucide-react';
import { GanttChart } from '../charts/GanttChart';
import {
  EmptyState,
  ErrorAlert,
  KpiCard,
  LoadingSkeleton,
  PageHeader,
} from '../components/PageState';
import { ProcessResultsTable } from '../components/ProcessResultsTable';
import { SchedulingEventLog } from '../components/SchedulingEventLog';
import { useSchedulerSettings, useToast } from '../hooks/useAppHooks';
import { extractApiError, schedulerApi } from '../services/api';
import type { ProcessItem, ScheduleRunResult } from '../types/scheduler';
import { formatNumber } from '../utils/formatters';

export function AdaptiveHybridPage() {
  const { settings } = useSchedulerSettings();
  const { notify } = useToast();

  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [highQuantum, setHighQuantum] = useState(settings.high_quantum);
  const [mediumQuantum, setMediumQuantum] = useState(settings.medium_quantum);
  const [maxQuantum, setMaxQuantum] = useState(settings.max_quantum);
  const [agingThreshold, setAgingThreshold] = useState(settings.aging_threshold);
  const [contextSwitchCost, setContextSwitchCost] = useState(settings.context_switch_cost);

  const [result, setResult] = useState<ScheduleRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runHybrid = useCallback(
    async (procs?: ProcessItem[]) => {
      const target = procs ?? processes;
      if (target.length === 0) {
        setResult(null);
        return;
      }
      setRunning(true);
      setError(null);
      try {
        const res = await schedulerApi.runSchedule('hybrid', {
          processes: target,
          high_quantum: highQuantum,
          medium_quantum: mediumQuantum,
          max_quantum: maxQuantum,
          aging_threshold: agingThreshold,
          context_switch_cost: contextSwitchCost,
        });
        setResult(res);
      } catch (err) {
        setError(extractApiError(err, 'Adaptive Hybrid execution failed.'));
      } finally {
        setRunning(false);
      }
    },
    [processes, highQuantum, mediumQuantum, maxQuantum, agingThreshold, contextSwitchCost],
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const list = await schedulerApi.listProcesses();
        setProcesses(list);
        if (list.length > 0) {
          const res = await schedulerApi.runSchedule('hybrid', {
            processes: list,
            high_quantum: settings.high_quantum,
            medium_quantum: settings.medium_quantum,
            max_quantum: settings.max_quantum,
            aging_threshold: settings.aging_threshold,
            context_switch_cost: settings.context_switch_cost,
          });
          setResult(res);
        }
      } catch (err) {
        setError(extractApiError(err, 'Failed to initialize Adaptive Hybrid scheduler.'));
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [settings]);

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const { simulation } = await schedulerApi.saveSimulation({
        name: `Adaptive Hybrid MLFQ (Q1=${highQuantum}, Q2=${mediumQuantum}, Age=${agingThreshold})`,
        algorithm: 'hybrid',
        processes,
        configuration: {
          high_quantum: highQuantum,
          medium_quantum: mediumQuantum,
          max_quantum: maxQuantum,
          aging_threshold: agingThreshold,
          context_switch_cost: contextSwitchCost,
        },
      });
      notify(`Saved simulation #${simulation.id} to SQLite.`, 'success');
    } catch (err) {
      notify(extractApiError(err, 'Failed to save simulation.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Adaptive Hybrid MLFQ Scheduler"
        subtitle="Three-level Multilevel Feedback Queue combining Adaptive Round Robin (Q1/Q2), FCFS (Q3), dynamic time quantum adjustment, and anti-starvation aging."
        actions={
          result && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-blue-600/40 bg-blue-600/10 text-blue-600 dark:text-cyan-400 hover:bg-blue-600/20 transition-colors whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save to History'}
            </button>
          )
        }
      />

      {/* 3-Level MLFQ Architecture Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">
              Queue 1 · High Priority
            </span>
            <span className="text-xs font-mono text-slate-500">Base q={highQuantum}</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Interactive &amp; newly arrived processes. Uses bounded Adaptive Round Robin. Full
            quantum consumption demotes to Queue 2.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Queue 2 · Medium Priority
            </span>
            <span className="text-xs font-mono text-slate-500">Base q={mediumQuantum}</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Medium-burst tasks. Uses Adaptive Round Robin. Promotes to Q1 on aging threshold;
            demotes to Q3 on quantum expiration.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Queue 3 · Batch / CPU-Bound
            </span>
            <span className="text-xs font-mono text-slate-500">FCFS</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Long CPU-intensive processes executed via FCFS (preemptible by Q1/Q2). Promotes to Q2
            after waiting {agingThreshold} units.
          </p>
        </div>
      </div>

      {/* Parameter Controls */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Queue 1 Quantum
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={highQuantum}
              onChange={(e) => setHighQuantum(Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Queue 2 Quantum
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={mediumQuantum}
              onChange={(e) => setMediumQuantum(Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Max Adaptive Quantum
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxQuantum}
              onChange={(e) => setMaxQuantum(Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Aging Threshold
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={agingThreshold}
              onChange={(e) => setAgingThreshold(Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Context Switch Cost
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={contextSwitchCost}
              onChange={(e) => setContextSwitchCost(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void runHybrid()}
            disabled={running || processes.length === 0}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Executing Hybrid MLFQ...' : 'Run Adaptive Hybrid Scheduler'}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={() => void runHybrid()} />
      ) : processes.length === 0 ? (
        <EmptyState
          title="No processes available"
          description="Add processes in Process Management to execute the Adaptive Hybrid MLFQ scheduler."
        />
      ) : result ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Avg Waiting / Turnaround"
              value={`${formatNumber(result.metrics.average_waiting_time, 2)} / ${formatNumber(result.metrics.average_turnaround_time, 2)}`}
              subtext={`Avg Response: ${formatNumber(result.metrics.average_response_time, 2)} u`}
              icon={<Layers className="w-4 h-4" />}
            />
            <KpiCard
              label="CPU Utilization"
              value={`${formatNumber(result.metrics.cpu_utilization, 2)}%`}
              subtext={`Throughput: ${formatNumber(result.metrics.throughput, 3)} proc/u`}
            />
            <KpiCard
              label="Queue Demotions"
              value={result.metrics.demotions ?? 0}
              subtext="Quantum-exhausting transitions"
              icon={<ArrowDown className="w-4 h-4 text-amber-500" />}
            />
            <KpiCard
              label="Aging Promotions"
              value={result.metrics.promotions ?? 0}
              subtext={`Fairness Index: ${formatNumber(result.metrics.fairness_index, 3)}`}
              icon={<ArrowUp className="w-4 h-4 text-emerald-500" />}
            />
          </div>

          <GanttChart
            timeline={result.timeline}
            title="Adaptive Hybrid MLFQ Execution Timeline (with Queue Levels)"
          />

          {/* Dynamic Quantum Adaptation Log */}
          {result.metrics.quantum_history && result.metrics.quantum_history.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Dynamic Time Quantum Trace
                </h3>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2">Time</th>
                      <th className="px-4 py-2">PID</th>
                      <th className="px-4 py-2">Queue</th>
                      <th className="px-4 py-2 text-right">Base Quantum</th>
                      <th className="px-4 py-2 text-right">Adaptive Quantum</th>
                      <th className="px-4 py-2 text-right">Ready Count</th>
                      <th className="px-4 py-2 text-right">Avg Rem Burst</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                    {result.metrics.quantum_history.map((qh, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <td className="px-4 py-2">t={qh.time}</td>
                        <td className="px-4 py-2 font-semibold">{qh.pid}</td>
                        <td className="px-4 py-2">Q{qh.queue_level}</td>
                        <td className="px-4 py-2 text-right">{qh.base_quantum}</td>
                        <td className="px-4 py-2 text-right font-semibold text-cyan-600 dark:text-cyan-400">
                          {qh.adaptive_quantum}
                        </td>
                        <td className="px-4 py-2 text-right">{qh.ready_count}</td>
                        <td className="px-4 py-2 text-right">{qh.avg_remaining_burst}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <ProcessResultsTable results={result.process_results} />
          <SchedulingEventLog events={result.events} />
        </>
      ) : null}
    </div>
  );
}
