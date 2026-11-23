import { useCallback, useEffect, useState } from 'react';
import { Play, Save } from 'lucide-react';
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

type AlgoKey = 'fcfs' | 'sjf' | 'rr' | 'priority';

const ALGO_TABS: Array<{ id: AlgoKey; label: string; summary: string }> = [
  {
    id: 'fcfs',
    label: 'FCFS',
    summary: 'Non-preemptive First Come First Serve ordered by arrival time and PID.',
  },
  {
    id: 'sjf',
    label: 'SJF',
    summary: 'Non-preemptive Shortest Job First selecting minimum burst among arrived processes.',
  },
  {
    id: 'rr',
    label: 'Round Robin',
    summary: 'Preemptive FIFO time-sliced scheduling with configurable time quantum.',
  },
  {
    id: 'priority',
    label: 'Priority',
    summary: 'Non-preemptive or preemptive priority scheduling with optional anti-starvation aging.',
  },
];

export function AlgorithmsPage() {
  const { settings } = useSchedulerSettings();
  const { notify } = useToast();

  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [selectedAlgo, setSelectedAlgo] = useState<AlgoKey>('fcfs');
  const [timeQuantum, setTimeQuantum] = useState(settings.time_quantum);
  const [preemptive, setPreemptive] = useState(settings.preemptive_priority);
  const [agingEnabled, setAgingEnabled] = useState(settings.aging_enabled);
  const [agingInterval, setAgingInterval] = useState(settings.aging_interval);
  const [contextSwitchCost, setContextSwitchCost] = useState(settings.context_switch_cost);

  const [result, setResult] = useState<ScheduleRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeAlgorithm = useCallback(
    async (algo: AlgoKey, procs?: ProcessItem[]) => {
      const targetProcs = procs ?? processes;
      if (targetProcs.length === 0) {
        setResult(null);
        return;
      }
      setRunning(true);
      setError(null);
      try {
        const res = await schedulerApi.runSchedule(algo, {
          processes: targetProcs,
          time_quantum: timeQuantum,
          preemptive,
          aging_enabled: agingEnabled,
          aging_interval: agingInterval,
          context_switch_cost: contextSwitchCost,
        });
        setResult(res);
      } catch (err) {
        setError(extractApiError(err, 'Algorithm execution failed.'));
      } finally {
        setRunning(false);
      }
    },
    [processes, timeQuantum, preemptive, agingEnabled, agingInterval, contextSwitchCost],
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const list = await schedulerApi.listProcesses();
        setProcesses(list);
        if (list.length > 0) {
          const res = await schedulerApi.runSchedule('fcfs', {
            processes: list,
            context_switch_cost: settings.context_switch_cost,
          });
          setResult(res);
        }
      } catch (err) {
        setError(extractApiError(err, 'Failed to load processes.'));
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [settings.context_switch_cost]);

  const handleSaveToHistory = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const { simulation } = await schedulerApi.saveSimulation({
        name: `${result.algorithm} Benchmark`,
        algorithm: selectedAlgo,
        processes,
        configuration: {
          time_quantum: timeQuantum,
          preemptive,
          aging_enabled: agingEnabled,
          aging_interval: agingInterval,
          context_switch_cost: contextSwitchCost,
        },
      });
      notify(`Saved simulation #${simulation.id} to SQLite history.`, 'success');
    } catch (err) {
      notify(extractApiError(err, 'Failed to save simulation.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Traditional CPU Scheduling Algorithms"
        subtitle="Execute and inspect FCFS, SJF, Round Robin, and Priority Scheduling directly via the Python engine."
        actions={
          result && (
            <button
              type="button"
              onClick={handleSaveToHistory}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-blue-600/40 bg-blue-600/10 text-blue-600 dark:text-cyan-400 hover:bg-blue-600/20 transition-colors whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Simulation'}
            </button>
          )
        }
      />

      {/* Algorithm Selector & Parameter Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
            {ALGO_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedAlgo(tab.id);
                  void executeAlgorithm(tab.id);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  selectedAlgo === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void executeAlgorithm(selectedAlgo)}
            disabled={running || processes.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Running...' : 'Execute Algorithm'}
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          {ALGO_TABS.find((t) => t.id === selectedAlgo)?.summary}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Context Switch Cost (units)
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={contextSwitchCost}
              onChange={(e) => setContextSwitchCost(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-1.5 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          {selectedAlgo === 'rr' && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Round Robin Time Quantum
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={timeQuantum}
                onChange={(e) => setTimeQuantum(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-1.5 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          )}

          {selectedAlgo === 'priority' && (
            <>
              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preemptive}
                    onChange={(e) => setPreemptive(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  Preemptive Priority
                </label>
              </div>
              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agingEnabled}
                    onChange={(e) => setAgingEnabled(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  Enable Priority Aging
                </label>
              </div>
              {agingEnabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Aging Interval (units)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={agingInterval}
                    onChange={(e) => setAgingInterval(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={() => void executeAlgorithm(selectedAlgo)} />
      ) : processes.length === 0 ? (
        <EmptyState
          title="No active processes"
          description="Add processes in Process Management before running CPU scheduling simulations."
        />
      ) : result ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Average Waiting Time"
              value={`${formatNumber(result.metrics.average_waiting_time, 2)} u`}
              subtext={`Max: ${result.metrics.max_waiting_time} u`}
            />
            <KpiCard
              label="Average Turnaround Time"
              value={`${formatNumber(result.metrics.average_turnaround_time, 2)} u`}
              subtext={`Avg Response: ${formatNumber(result.metrics.average_response_time, 2)} u`}
            />
            <KpiCard
              label="CPU Utilization"
              value={`${formatNumber(result.metrics.cpu_utilization, 2)}%`}
              subtext={`Throughput: ${formatNumber(result.metrics.throughput, 3)} proc/u`}
            />
            <KpiCard
              label="Context Switches"
              value={result.metrics.total_context_switches}
              subtext={`Overhead: ${result.metrics.total_scheduling_overhead} u · Fairness ${formatNumber(result.metrics.fairness_index, 3)}`}
            />
          </div>

          <GanttChart timeline={result.timeline} title={`${result.algorithm} Execution Timeline`} />
          <ProcessResultsTable results={result.process_results} />
          <SchedulingEventLog events={result.events} />
        </>
      ) : null}
    </div>
  );
}
