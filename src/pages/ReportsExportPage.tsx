import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import { EmptyState, ErrorAlert, LoadingSkeleton, PageHeader } from '../components/PageState';
import { ProcessResultsTable } from '../components/ProcessResultsTable';
import { useToast } from '../hooks/useAppHooks';
import { extractApiError, schedulerApi } from '../services/api';
import type { SimulationRecord } from '../types/scheduler';
import { formatDateTime, formatNumber } from '../utils/formatters';

export function ReportsExportPage() {
  const [searchParams] = useSearchParams();
  const initialId = searchParams.get('simId');

  const [simulations, setSimulations] = useState<SimulationRecord[]>([]);
  const [selectedSim, setSelectedSim] = useState<SimulationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useToast();

  const loadSim = useCallback(async (id: number) => {
    const details = await schedulerApi.getSimulation(id);
    setSelectedSim(details);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sims = await schedulerApi.listSimulations();
      setSimulations(sims);
      if (sims.length > 0) {
        const target =
          initialId && sims.some((s) => s.id === Number(initialId))
            ? Number(initialId)
            : sims[0].id;
        await loadSim(target);
      } else {
        setSelectedSim(null);
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to load reports.'));
    } finally {
      setLoading(false);
    }
  }, [initialId, loadSim]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleDownload = (format: 'pdf' | 'csv' | 'json') => {
    if (!selectedSim) return;
    const url = schedulerApi.getReportUrl(selectedSim.id, format);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation_${selectedSim.id}_report.${format}`;
    a.click();
    notify(`Downloading ${format.toUpperCase()} report for Simulation #${selectedSim.id}.`, 'success');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Export"
        subtitle="Generate downloadable PDF, CSV, and JSON academic reports from persisted simulation runs."
        actions={
          simulations.length > 0 && (
            <select
              value={selectedSim?.id ?? ''}
              onChange={(e) => void loadSim(Number(e.target.value))}
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
        <ErrorAlert message={error} onRetry={loadAll} />
      ) : !selectedSim ? (
        <EmptyState
          title="No saved simulations to export"
          description="Run and save any simulation first so you can export PDF, CSV, and JSON reports."
        />
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <FileText className="w-4 h-4 text-cyan-500" />
                Simulation #{selectedSim.id} · {selectedSim.name}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedSim.algorithm} · {selectedSim.process_count} processes ·{' '}
                {formatDateTime(selectedSim.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownload('pdf')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => handleDownload('csv')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
              <button
                type="button"
                onClick={() => handleDownload('json')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs font-mono tabular-nums">
            <div>
              <div className="text-slate-500 font-sans">Avg Waiting</div>
              <div className="text-base font-bold mt-0.5">
                {formatNumber(selectedSim.avg_waiting_time, 2)} u
              </div>
            </div>
            <div>
              <div className="text-slate-500 font-sans">Avg Turnaround</div>
              <div className="text-base font-bold mt-0.5">
                {formatNumber(selectedSim.avg_turnaround_time, 2)} u
              </div>
            </div>
            <div>
              <div className="text-slate-500 font-sans">Avg Response</div>
              <div className="text-base font-bold mt-0.5">
                {formatNumber(selectedSim.avg_response_time, 2)} u
              </div>
            </div>
            <div>
              <div className="text-slate-500 font-sans">CPU Utilization</div>
              <div className="text-base font-bold mt-0.5">
                {formatNumber(selectedSim.cpu_utilization, 2)}%
              </div>
            </div>
            <div>
              <div className="text-slate-500 font-sans">Throughput</div>
              <div className="text-base font-bold mt-0.5">
                {formatNumber(selectedSim.throughput, 3)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 font-sans">Context Switches</div>
              <div className="text-base font-bold mt-0.5">{selectedSim.total_context_switches}</div>
            </div>
          </div>

          <ProcessResultsTable results={selectedSim.process_results || []} />
        </>
      )}
    </div>
  );
}
