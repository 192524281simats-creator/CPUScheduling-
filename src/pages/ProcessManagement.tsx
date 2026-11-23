import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Download,
  Edit3,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { EmptyState, ErrorAlert, LoadingSkeleton, PageHeader } from '../components/PageState';
import { useToast } from '../hooks/useAppHooks';
import { extractApiError, schedulerApi } from '../services/api';
import type { ProcessItem } from '../types/scheduler';
import { exportProcessesToCsv, getProcessColor, parseProcessesCsv } from '../utils/formatters';

const PRESETS = [
  { id: 'classic', label: 'Classic 4-Process' },
  { id: 'interactive', label: 'Interactive Short-Burst' },
  { id: 'batch', label: 'CPU-Bound Batch' },
  { id: 'convoy', label: 'Convoy Risk Mix' },
  { id: 'priority_heavy', label: 'Priority-Critical' },
  { id: 'mixed', label: 'Mixed Heterogeneous' },
];

export function ProcessManagement() {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pid, setPid] = useState('P5');
  const [arrivalTime, setArrivalTime] = useState('0');
  const [burstTime, setBurstTime] = useState('4');
  const [priority, setPriority] = useState('2');
  const [submitting, setSubmitting] = useState(false);

  const [samplePreset, setSamplePreset] = useState('classic');
  const [sampleCount, setSampleCount] = useState(6);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { notify } = useToast();

  const loadProcesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await schedulerApi.listProcesses();
      setProcesses(list);
      if (editingId === null) {
        setPid(`P${list.length + 1}`);
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to load processes.'));
    } finally {
      setLoading(false);
    }
  }, [editingId]);

  useEffect(() => {
    void loadProcesses();
  }, [loadProcesses]);

  const resetForm = (nextCount: number) => {
    setEditingId(null);
    setPid(`P${nextCount + 1}`);
    setArrivalTime('0');
    setBurstTime('4');
    setPriority('2');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanPid = pid.trim();
    const at = Number(arrivalTime);
    const bt = Number(burstTime);
    const pr = Number(priority);

    if (!cleanPid) {
      notify('Process ID cannot be empty.', 'error');
      return;
    }
    if (!Number.isInteger(at) || at < 0) {
      notify('Arrival time must be a non-negative integer.', 'error');
      return;
    }
    if (!Number.isInteger(bt) || bt <= 0) {
      notify('Burst time must be a positive integer (> 0).', 'error');
      return;
    }
    if (!Number.isInteger(pr) || pr < 0) {
      notify('Priority must be a non-negative integer (lower = higher priority).', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId !== null) {
        await schedulerApi.updateProcess(editingId, {
          pid: cleanPid,
          arrival_time: at,
          burst_time: bt,
          priority: pr,
        });
        notify(`Updated process ${cleanPid}.`, 'success');
      } else {
        await schedulerApi.createProcess({
          pid: cleanPid,
          arrival_time: at,
          burst_time: bt,
          priority: pr,
        });
        notify(`Added process ${cleanPid}.`, 'success');
      }
      const list = await schedulerApi.listProcesses();
      setProcesses(list);
      resetForm(list.length);
    } catch (err) {
      notify(extractApiError(err, 'Failed to save process.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (p: ProcessItem) => {
    if (!p.id) return;
    setEditingId(p.id);
    setPid(p.pid);
    setArrivalTime(String(p.arrival_time));
    setBurstTime(String(p.burst_time));
    setPriority(String(p.priority));
  };

  const handleDelete = async (p: ProcessItem) => {
    if (!p.id) return;
    try {
      await schedulerApi.deleteProcess(p.id);
      notify(`Deleted process ${p.pid}.`, 'info');
      await loadProcesses();
    } catch (err) {
      notify(extractApiError(err, 'Failed to delete process.'), 'error');
    }
  };

  const handleClearAll = async () => {
    try {
      await schedulerApi.clearProcesses();
      notify('Cleared all processes from queue.', 'info');
      setProcesses([]);
      resetForm(0);
    } catch (err) {
      notify(extractApiError(err, 'Failed to clear processes.'), 'error');
    }
  };

  const handleLoadSample = async () => {
    try {
      const list = await schedulerApi.loadSampleWorkload(samplePreset, sampleCount);
      setProcesses(list);
      resetForm(list.length);
      notify(`Loaded '${samplePreset}' sample workload (${list.length} processes).`, 'success');
    } catch (err) {
      notify(extractApiError(err, 'Failed to generate sample workload.'), 'error');
    }
  };

  const handleCsvUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseProcessesCsv(text);
      const saved = await schedulerApi.bulkImportProcesses(parsed, true);
      setProcesses(saved);
      resetForm(saved.length);
      notify(`Imported ${saved.length} processes from CSV.`, 'success');
    } catch (err) {
      notify(extractApiError(err, 'CSV import failed.'), 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportCsv = () => {
    if (processes.length === 0) {
      notify('No processes available to export.', 'error');
      return;
    }
    const csv = exportProcessesToCsv(processes);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cpu_processes.csv';
    a.click();
    URL.revokeObjectURL(url);
    notify('Exported process list to CSV.', 'success');
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return processes;
    const q = search.toLowerCase();
    return processes.filter((p) => p.pid.toLowerCase().includes(q));
  }, [processes, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Process Management"
        subtitle="Create, edit, import CSV workloads, or generate sample Operating Systems process sets persisted in SQLite."
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Add/Edit Form + Sample Generator */}
        <div className="space-y-6">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {editingId !== null ? `Edit Process (${pid})` : 'Add New Process'}
              </h2>
              {editingId !== null && (
                <button
                  type="button"
                  onClick={() => resetForm(processes.length)}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Process ID
                </label>
                <input
                  type="text"
                  value={pid}
                  onChange={(e) => setPid(e.target.value)}
                  placeholder="P1"
                  required
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Priority (lower = higher)
                </label>
                <input
                  type="number"
                  min={0}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Arrival Time
                </label>
                <input
                  type="number"
                  min={0}
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Burst Time (&gt; 0)
                </label>
                <input
                  type="number"
                  min={1}
                  value={burstTime}
                  onChange={(e) => setBurstTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              {submitting
                ? 'Saving...'
                : editingId !== null
                  ? 'Update Process'
                  : 'Add Process to Queue'}
            </button>
          </form>

          {/* Sample Workload Generator */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Sample Workload Generator
              </h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Workload Preset
                </label>
                <select
                  value={samplePreset}
                  onChange={(e) => setSamplePreset(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {samplePreset !== 'classic' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Process Count ({sampleCount})
                  </label>
                  <input
                    type="range"
                    min={3}
                    max={15}
                    value={sampleCount}
                    onChange={(e) => setSampleCount(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleLoadSample}
                className="w-full px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white transition-colors"
              >
                Load Sample Workload
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Active Process Table */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : error ? (
            <ErrorAlert message={error} onRetry={loadProcesses} />
          ) : processes.length === 0 ? (
            <EmptyState
              title="No processes defined"
              description="Add processes using the form on the left, import a CSV file (pid,arrival_time,burst_time,priority), or load a sample preset."
              action={
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Load Classic 4-Process Sample
                </button>
              }
            />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Ready Queue Dataset ({filtered.length} processes)
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search PID..."
                      className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-300 dark:border-rose-800/70 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">PID</th>
                      <th className="px-4 py-2.5 text-right">Arrival Time</th>
                      <th className="px-4 py-2.5 text-right">Burst Time</th>
                      <th className="px-4 py-2.5 text-right">Priority</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 font-mono tabular-nums">
                    {filtered.map((p) => {
                      const c = getProcessColor(p.pid);
                      return (
                        <tr
                          key={p.id || p.pid}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900/40"
                        >
                          <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                            <span className="inline-flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-sm ${c.bg}`} />
                              {p.pid}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">{p.arrival_time}</td>
                          <td className="px-4 py-2.5 text-right">{p.burst_time}</td>
                          <td className="px-4 py-2.5 text-right">{p.priority}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEdit(p)}
                                className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Edit process"
                                aria-label={`Edit ${p.pid}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(p)}
                                className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Delete process"
                                aria-label={`Delete ${p.pid}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
