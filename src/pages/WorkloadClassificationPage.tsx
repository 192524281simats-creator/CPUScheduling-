import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Tag } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import type { ProcessItem, WorkloadClassification } from '../types/scheduler';

export function WorkloadClassificationPage() {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [classification, setClassification] = useState<WorkloadClassification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadWorkload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await schedulerApi.listProcesses();
      setProcesses(list);
      if (list.length > 0) {
        const res = await schedulerApi.classifyWorkload(list);
        setClassification(res);
      } else {
        setClassification(null);
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to classify workload.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkload();
  }, [loadWorkload]);

  const burstChart = processes.map((p) => ({
    pid: p.pid,
    'Burst Time': p.burst_time,
    'Arrival Time': p.arrival_time,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workload Classification & Recommendation"
        subtitle="Statistical profiling of arrival span, burst variance, and priority spread to recommend an appropriate scheduling policy."
        actions={
          classification && (
            <button
              type="button"
              onClick={() =>
                navigate(
                  classification.recommended_algorithm === 'hybrid' ? '/hybrid' : '/algorithms',
                )
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap"
            >
              Open Recommended Policy <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={loadWorkload} />
      ) : !classification ? (
        <EmptyState
          title="No processes to classify"
          description="Add processes in Process Management to analyze workload characteristics."
        />
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-6 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 dark:text-cyan-400">
              <Tag className="w-4 h-4" />
              Detected Workload Class · Recommended: {classification.recommended_algorithm.toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {classification.workload_type}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
              {classification.recommendation_reason}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Average Burst Time"
              value={`${classification.statistics.avg_burst_time} u`}
              subtext={`Range: ${classification.statistics.min_burst_time} – ${classification.statistics.max_burst_time} u`}
            />
            <KpiCard
              label="Burst Dispersion (Std / CV)"
              value={`${classification.statistics.burst_std_dev} / ${classification.statistics.burst_cv}`}
              subtext={`Total CPU Burst: ${classification.statistics.total_burst_time} u`}
            />
            <KpiCard
              label="Short vs Long Jobs"
              value={`${classification.statistics.short_job_count} / ${classification.statistics.long_job_count}`}
              subtext={`Short: ${classification.statistics.short_job_ratio}% · Long: ${classification.statistics.long_job_ratio}%`}
            />
            <KpiCard
              label="Priority Spread & Arrival Span"
              value={`${classification.statistics.priority_spread} / ${classification.statistics.arrival_span} u`}
              subtext={`${classification.statistics.unique_priorities} distinct priorities`}
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Process Burst &amp; Arrival Profile
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={burstChart}>
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
                  <Bar dataKey="Burst Time" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Arrival Time" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
