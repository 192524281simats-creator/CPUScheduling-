import axios from 'axios';
import type {
  ComparisonResponse,
  DashboardAnalytics,
  PerformanceAnalyticsResponse,
  ProcessItem,
  ScheduleRunResult,
  SchedulingEvent,
  SimulationRecord,
  WhatIfResponse,
  WorkloadClassification,
} from '../types/scheduler';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function extractApiError(err: unknown, fallback = 'Request failed'): string {
  if (axios.isAxiosError(err)) {
    const serverMsg = (err.response?.data as { error?: string } | undefined)?.error;
    return serverMsg || err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export const schedulerApi = {
  async health(): Promise<{ status: string; service: string }> {
    const { data } = await api.get('/health');
    return data;
  },

  async listProcesses(): Promise<ProcessItem[]> {
    const { data } = await api.get<{ processes: ProcessItem[] }>('/processes');
    return data.processes;
  },

  async createProcess(payload: Omit<ProcessItem, 'id' | 'created_at'>): Promise<ProcessItem> {
    const { data } = await api.post<{ process: ProcessItem }>('/processes', payload);
    return data.process;
  },

  async updateProcess(id: number, payload: Partial<ProcessItem>): Promise<ProcessItem> {
    const { data } = await api.put<{ process: ProcessItem }>(`/processes/${id}`, payload);
    return data.process;
  },

  async deleteProcess(id: number): Promise<void> {
    await api.delete(`/processes/${id}`);
  },

  async clearProcesses(): Promise<void> {
    await api.delete('/processes');
  },

  async bulkImportProcesses(processes: ProcessItem[], replace = true): Promise<ProcessItem[]> {
    const { data } = await api.post<{ processes: ProcessItem[] }>('/processes/bulk', {
      processes,
      replace,
    });
    return data.processes;
  },

  async loadSampleWorkload(preset: string, count = 6): Promise<ProcessItem[]> {
    const { data } = await api.post<{ processes: ProcessItem[] }>('/processes/sample', {
      preset,
      count,
    });
    return data.processes;
  },

  async runSchedule(
    algorithm: 'fcfs' | 'sjf' | 'rr' | 'priority' | 'hybrid',
    payload: Record<string, unknown> = {},
  ): Promise<ScheduleRunResult> {
    const { data } = await api.post<ScheduleRunResult>(`/schedule/${algorithm}`, payload);
    return data;
  },

  async saveSimulation(payload: {
    name?: string;
    algorithm: string;
    processes?: ProcessItem[];
    configuration?: Record<string, unknown>;
  }): Promise<{ simulation: SimulationRecord; workload: WorkloadClassification }> {
    const { data } = await api.post('/simulations', payload);
    return data;
  },

  async listSimulations(): Promise<SimulationRecord[]> {
    const { data } = await api.get<{ simulations: SimulationRecord[] }>('/simulations');
    return data.simulations;
  },

  async getSimulation(id: number): Promise<SimulationRecord> {
    const { data } = await api.get<{ simulation: SimulationRecord }>(`/simulations/${id}`);
    return data.simulation;
  },

  async deleteSimulation(id: number): Promise<void> {
    await api.delete(`/simulations/${id}`);
  },

  async getDashboardAnalytics(): Promise<DashboardAnalytics> {
    const { data } = await api.get<DashboardAnalytics>('/analytics/dashboard');
    return data;
  },

  async runComparison(params?: Record<string, unknown>): Promise<ComparisonResponse> {
    if (params && Object.keys(params).length > 0) {
      const { data } = await api.post<ComparisonResponse>('/analytics/comparison', params);
      return data;
    }
    const { data } = await api.get<ComparisonResponse>('/analytics/comparison');
    return data;
  },

  async getPerformanceAnalytics(simId: number): Promise<PerformanceAnalyticsResponse> {
    const { data } = await api.get<PerformanceAnalyticsResponse>(`/analytics/performance/${simId}`);
    return data;
  },

  async classifyWorkload(processes?: ProcessItem[]): Promise<WorkloadClassification> {
    const { data } = await api.post<WorkloadClassification>(
      '/workload/classify',
      processes ? { processes } : {},
    );
    return data;
  },

  async runWhatIf(payload: {
    processes?: ProcessItem[];
    baseline_algorithm: string;
    baseline_config: Record<string, unknown>;
    modified_algorithm: string;
    modified_config: Record<string, unknown>;
  }): Promise<WhatIfResponse> {
    const { data } = await api.post<WhatIfResponse>('/simulations/what-if', payload);
    return data;
  },

  async getEvents(simId: number): Promise<SchedulingEvent[]> {
    const { data } = await api.get<{ events: SchedulingEvent[] }>(`/events/${simId}`);
    return data.events;
  },

  getReportUrl(simId: number, format: 'pdf' | 'csv' | 'json'): string {
    const base = import.meta.env.VITE_API_BASE_URL || '/api';
    return `${base}/reports/${simId}?format=${format}`;
  },
};
