import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ThemeMode = 'dark' | 'light';

export interface SchedulerDefaults {
  time_quantum: number;
  high_quantum: number;
  medium_quantum: number;
  max_quantum: number;
  aging_threshold: number;
  preemptive_priority: boolean;
  aging_enabled: boolean;
  aging_interval: number;
  context_switch_cost: number;
}

const DEFAULT_SETTINGS: SchedulerDefaults = {
  time_quantum: 4,
  high_quantum: 2,
  medium_quantum: 4,
  max_quantum: 12,
  aging_threshold: 10,
  preemptive_priority: false,
  aging_enabled: true,
  aging_interval: 5,
  context_switch_cost: 0,
};

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('scheduler_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('scheduler_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggleTheme };
}

export function useSchedulerSettings() {
  const [settings, setSettings] = useState<SchedulerDefaults>(() => {
    try {
      const raw = localStorage.getItem('scheduler_defaults');
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SETTINGS;
  });

  const updateSettings = useCallback((next: Partial<SchedulerDefaults>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem('scheduler_defaults', JSON.stringify(merged));
      } catch {
        // ignore
      }
      return merged;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem('scheduler_defaults');
  }, []);

  return { settings, updateSettings, resetSettings };
}

interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextValue {
  notify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextValue>({ notify: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm transition-all ${
              t.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-700/70 text-emerald-100'
                : t.type === 'error'
                  ? 'bg-rose-950/95 border-rose-700/70 text-rose-100'
                  : 'bg-slate-900/95 border-slate-700 text-slate-100'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : t.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            )}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-white shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
