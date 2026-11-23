import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Clock,
  Cpu,
  FileSpreadsheet,
  GitCompare,
  History,
  Layers,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  Play,
  Scale,
  Settings,
  Sliders,
  Sun,
  Tag,
  X,
} from 'lucide-react';
import { useTheme } from '../hooks/useAppHooks';

interface NavSection {
  label: string;
  items: Array<{
    to: string;
    label: string;
    icon: ReactNode;
  }>;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Core Workspace',
    items: [
      { to: '/', label: 'Overview Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
      { to: '/processes', label: 'Process Management', icon: <ListChecks className="w-4 h-4" /> },
      { to: '/algorithms', label: 'CPU Scheduling Algorithms', icon: <Cpu className="w-4 h-4" /> },
      { to: '/hybrid', label: 'Adaptive Hybrid Scheduler', icon: <Layers className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Visualization & Analysis',
    items: [
      { to: '/gantt', label: 'Gantt Chart Visualization', icon: <Clock className="w-4 h-4" /> },
      { to: '/analytics', label: 'Performance Analytics', icon: <BarChart3 className="w-4 h-4" /> },
      { to: '/comparison', label: 'Algorithm Comparison', icon: <GitCompare className="w-4 h-4" /> },
      { to: '/workload', label: 'Workload Classification', icon: <Tag className="w-4 h-4" /> },
      { to: '/what-if', label: 'What-if Simulation', icon: <Sliders className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Monitoring & Reports',
    items: [
      { to: '/context-switch', label: 'Context Switch Analyzer', icon: <Activity className="w-4 h-4" /> },
      { to: '/fairness', label: 'Starvation & Fairness', icon: <Scale className="w-4 h-4" /> },
      { to: '/history', label: 'Simulation History', icon: <History className="w-4 h-4" /> },
      { to: '/reports', label: 'Reports and Export', icon: <FileSpreadsheet className="w-4 h-4" /> },
      { to: '/settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
    ],
  },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const currentTitle =
    NAV_SECTIONS.flatMap((s) => s.items).find((item) => item.to === location.pathname)?.label ||
    'Overview Dashboard';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#070d1a] dark:text-slate-100">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0a1120] flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800/90 flex items-center justify-between gap-2">
          <NavLink
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2.5 min-w-0"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate">
                AdaptiveCPU
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Hybrid OS Scheduler
              </div>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-blue-600/10 text-blue-600 dark:bg-cyan-500/10 dark:text-cyan-400'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                      }`
                    }
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800/90 text-[11px] text-slate-500 dark:text-slate-400">
          Intelligent Scheduling · Fair Execution
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800/90 bg-white/90 dark:bg-[#070d1a]/90 backdrop-blur flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500">
                Framework
              </span>
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500">/</span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {currentTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => navigate('/hybrid')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              Run Hybrid Scheduler
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
