import { useState } from 'react';
import { CheckCircle2, Moon, RotateCcw, Server, Sun } from 'lucide-react';
import { PageHeader } from '../components/PageState';
import { useSchedulerSettings, useTheme, useToast } from '../hooks/useAppHooks';
import { extractApiError, schedulerApi } from '../services/api';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings, resetSettings } = useSchedulerSettings();
  const { notify } = useToast();
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const checkBackend = async () => {
    setChecking(true);
    try {
      const res = await schedulerApi.health();
      setHealthResult(`Connected: ${res.service} (status=${res.status})`);
      notify('Backend API health check passed.', 'success');
    } catch (err) {
      const msg = extractApiError(err, 'Backend unreachable.');
      setHealthResult(`Error: ${msg}`);
      notify(msg, 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Configure default scheduling parameters, UI theme preference, and verify Python backend connectivity."
        actions={
          <button
            type="button"
            onClick={() => {
              resetSettings();
              notify('Restored default scheduler settings.', 'info');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Theme & Appearance */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Interface Theme
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Switch between the deep navy dark console and crisp light workspace.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-xs font-semibold transition-colors ${
                theme === 'dark'
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Moon className="w-4 h-4" />
              Dark Navy Theme
            </button>
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-xs font-semibold transition-colors ${
                theme === 'light'
                  ? 'border-blue-600 bg-blue-600/10 text-blue-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sun className="w-4 h-4" />
              Light Slate Theme
            </button>
          </div>
        </div>

        {/* Backend Connectivity */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Backend API Verification
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Verify connection to the Python scheduling engine and SQLite persistence layer.
          </p>
          <button
            type="button"
            onClick={() => void checkBackend()}
            disabled={checking}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
          >
            <Server className="w-3.5 h-3.5" />
            {checking ? 'Checking...' : 'Test /api/health'}
          </button>
          {healthResult && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-3 py-2 text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{healthResult}</span>
            </div>
          )}
        </div>
      </div>

      {/* Default Scheduling Parameters */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Default Scheduling Parameters
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Default RR Time Quantum
            </label>
            <input
              type="number"
              min={1}
              value={settings.time_quantum}
              onChange={(e) =>
                updateSettings({ time_quantum: Math.max(1, Number(e.target.value)) })
              }
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Hybrid Q1 High Quantum
            </label>
            <input
              type="number"
              min={1}
              value={settings.high_quantum}
              onChange={(e) =>
                updateSettings({ high_quantum: Math.max(1, Number(e.target.value)) })
              }
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Hybrid Q2 Medium Quantum
            </label>
            <input
              type="number"
              min={1}
              value={settings.medium_quantum}
              onChange={(e) =>
                updateSettings({ medium_quantum: Math.max(1, Number(e.target.value)) })
              }
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Hybrid Max Adaptive Quantum
            </label>
            <input
              type="number"
              min={1}
              value={settings.max_quantum}
              onChange={(e) =>
                updateSettings({ max_quantum: Math.max(1, Number(e.target.value)) })
              }
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Hybrid Aging Threshold
            </label>
            <input
              type="number"
              min={1}
              value={settings.aging_threshold}
              onChange={(e) =>
                updateSettings({ aging_threshold: Math.max(1, Number(e.target.value)) })
              }
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Default Context Switch Cost
            </label>
            <input
              type="number"
              min={0}
              value={settings.context_switch_cost}
              onChange={(e) =>
                updateSettings({ context_switch_cost: Math.max(0, Number(e.target.value)) })
              }
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
