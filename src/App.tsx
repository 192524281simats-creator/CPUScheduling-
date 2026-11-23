import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './hooks/useAppHooks';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AdaptiveHybridPage } from './pages/AdaptiveHybridPage';
import { AlgorithmComparisonPage } from './pages/AlgorithmComparisonPage';
import { AlgorithmsPage } from './pages/AlgorithmsPage';
import { ContextSwitchAnalyzerPage } from './pages/ContextSwitchAnalyzerPage';
import { FairnessMonitorPage } from './pages/FairnessMonitorPage';
import { GanttVisualizationPage } from './pages/GanttVisualizationPage';
import { OverviewDashboard } from './pages/OverviewDashboard';
import { PerformanceAnalyticsPage } from './pages/PerformanceAnalyticsPage';
import { ProcessManagement } from './pages/ProcessManagement';
import { ReportsExportPage } from './pages/ReportsExportPage';
import { SettingsPage } from './pages/SettingsPage';
import { SimulationHistoryPage } from './pages/SimulationHistoryPage';
import { WhatIfSimulationPage } from './pages/WhatIfSimulationPage';
import { WorkloadClassificationPage } from './pages/WorkloadClassificationPage';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<OverviewDashboard />} />
            <Route path="/processes" element={<ProcessManagement />} />
            <Route path="/algorithms" element={<AlgorithmsPage />} />
            <Route path="/hybrid" element={<AdaptiveHybridPage />} />
            <Route path="/gantt" element={<GanttVisualizationPage />} />
            <Route path="/analytics" element={<PerformanceAnalyticsPage />} />
            <Route path="/comparison" element={<AlgorithmComparisonPage />} />
            <Route path="/workload" element={<WorkloadClassificationPage />} />
            <Route path="/what-if" element={<WhatIfSimulationPage />} />
            <Route path="/context-switch" element={<ContextSwitchAnalyzerPage />} />
            <Route path="/fairness" element={<FairnessMonitorPage />} />
            <Route path="/history" element={<SimulationHistoryPage />} />
            <Route path="/reports" element={<ReportsExportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DashboardLayout>
      </BrowserRouter>
    </ToastProvider>
  );
}
