import { useCallback, useEffect, useState } from 'react';
import { Sliders } from 'lucide-react';
import { GanttChart } from '../charts/GanttChart';
import { EmptyState, ErrorAlert, LoadingSkeleton, PageHeader } from '../components/PageState';
import { extractApiError, schedulerApi } from '../services/api';
import type { ProcessItem, WhatIfResponse } from '../types/scheduler';
import { formatNumber } from '../utils/formatters';

const ALGOS = [
  { id: 'fcfs', label: 'FCFS' },
  { id: 'sjf', label: 'SJF' },
  { id: 'rr', label: 'Round Robin' },
  { id: 'priority', label: 'Priority' },
  { id: 'hybrid', label: 'Adaptive Hybrid MLFQ' },
];

export function WhatIfSimulationPage() {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [baseAlgo, setBaseAlgo] = useState('rr');
  const [baseQuantum, setBaseQuantum] = useState(4);
  const [baseCs, setBaseCs] = useState(0);

  const [modAlgo, setModAlgo] = useState('hybrid');
  const [modHighQ, setModHighQ] = useState(2);
  const [modMedQ, setModMedQ] = useState(4);
  const [modAge, setModAge] = useState(10);
  const [modCs, setModCs] = useState(0);

  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runWhatIf = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await schedulerApi.listProcesses();
      setProcesses(list);
      if (list.length === 0) {
        setResult(null);
        return;
      }
      const res = await schedulerApi.runWhatIf({
        processes: list,
        baseline_algorithm: baseAlgo,
        baseline_config: { time_quantum: baseQuantum, context_switch_cost: baseCs },
        modified_algorithm: modAlgo,
        modified_config: {
          time_quantum: baseQuantum,
          high_quantum: modHighQ,
          medium_quantum: modMedQ,
          aging_threshold: modAge,
          context_switch_cost: modCs,
        },
      });
      setResult(res);
    } catch (err) {
      setError(extractApiError(err, 'What-if simulation failed.'));
    } finally {
      setLoading(false);
    }
  }, [baseAlgo, baseQuantum, baseCs, modAlgo, modHighQ, modMedQ, modAge, modCs]);

  useEffect(() => {
    void runWhatIf();
  }, [runWhatIf]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="What-If Simulation Studio"
        subtitle="Compare before-and-after performance across different scheduling algorithms, time quanta, aging thresholds, and context-switch overheads."
        actions={
          <button
            type="button"
            onClick={() => void runWhatIf()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5" />
            Run What-If Analysis
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Baseline Configuration (Before)
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Algorithm</label>
              <select
                value={baseAlgo}
                onChange={(e) => setBaseAlgo(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              >
                {ALGOS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Time Quantum</label>
              <input
                type="number"
                min={1}
                value={baseQuantum}
                onChange={(e) => setBaseQuantum(Math.max(1, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">CS Cost</label>
              <input
                type="number"
                min={0}
                value={baseCs}
                onChange={(e) => setBaseCs(Math.max(0, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Modified Configuration (After)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Algorithm</label>
              <select
                value={modAlgo}
                onChange={(e) => setModAlgo(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              >
                {ALGOS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Q1 / Q2</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={1}
                  value={modHighQ}
                  onChange={(e) => setModHighQ(Math.max(1, Number(e.target.value)))}
                  className="w-1/2 px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
                <input
                  type="number"
                  min={1}
                  value={modMedQ}
                  onChange={(e) => setModMedQ(Math.max(1, Number(e.target.value)))}
                  className="w-1/2 px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Aging Threshold</label>
              <input
                type="number"
                min={1}
                value={modAge}
                onChange={(e) => setModAge(Math.max(1, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">CS Cost</label>
              <input
                type="number"
                min={0}
                value={modCs}
                onChange={(e) => setModCs(Math.max(0, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={runWhatIf} />
      ) : processes.length === 0 || !result ? (
        <EmptyState
          title="No processes available"
          description="Add processes in Process Management to run what-if experiments."
        />
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Before vs After Delta Analysis
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5">Metric</th>
                    <th className="px-4 py-2.5 text-right">
                      Baseline ({result.baseline.algorithm})
                    </th>
                    <th className="px-4 py-2.5 text-right">
                      Modified ({result.modified.algorithm})
                    </th>
                    <th className="px-4 py-2.5 text-right">Delta</th>
                    <th className="px-4 py-2.5 text-right">% Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {Object.entries(result.deltas).map(([key, d]) => (
                    <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-2.5 font-sans font-medium text-slate-900 dark:text-white">
                        {key.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-2.5 text-right">{formatNumber(d.baseline, 3)}</td>
                      <td className="px-4 py-2.5 text-right">{formatNumber(d.modified, 3)}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold ${
                          d.delta === 0
                            ? 'text-slate-500'
                            : d.delta < 0
                              ? 'text-cyan-600 dark:text-cyan-400'
                              : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {d.delta > 0 ? `+${formatNumber(d.delta, 3)}` : formatNumber(d.delta, 3)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500">
                        {d.percent_change !== null ? `${d.percent_change}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <GanttChart
            timeline={result.baseline.timeline}
            title={`Baseline Timeline · ${result.baseline.algorithm}`}
          />
          <GanttChart
            timeline={result.modified.timeline}
            title={`Modified Timeline · ${result.modified.algorithm}`}
          />
        </>
      )}
    </div>
  );
}
