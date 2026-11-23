export interface ProcessItem {
  id?: number;
  pid: string;
  arrival_time: number;
  burst_time: number;
  priority: number;
  created_at?: string | null;
}

export interface TimelineEntry {
  id?: number;
  simulation_id?: number;
  step_index?: number;
  pid: string;
  start_time: number;
  end_time: number;
  duration: number;
  queue_level: number | null;
  event_type: 'execution' | 'idle' | 'context_switch';
  from_pid?: string;
  to_pid?: string;
}

export interface ProcessResult {
  pid: string;
  arrival_time: number;
  burst_time: number;
  priority: number;
  first_start_time: number;
  completion_time: number;
  turnaround_time: number;
  waiting_time: number;
  response_time: number;
}

export interface QuantumHistoryEntry {
  time: number;
  pid: string;
  queue_level: number;
  base_quantum: number;
  adaptive_quantum: number;
  ready_count: number;
  avg_remaining_burst: number;
}

export interface SimulationMetrics {
  average_waiting_time: number;
  average_turnaround_time: number;
  average_response_time: number;
  max_waiting_time: number;
  min_waiting_time: number;
  waiting_time_std_dev: number;
  cpu_utilization: number;
  effective_cpu_utilization: number;
  cpu_idle_time: number;
  productive_busy_time: number;
  total_simulation_time: number;
  throughput: number;
  total_context_switches: number;
  total_scheduling_overhead: number;
  context_switch_cost: number;
  overhead_percentage: number;
  fairness_index: number;
  total_processes: number;
  time_quantum?: number;
  high_quantum?: number;
  medium_quantum?: number;
  max_quantum?: number;
  aging_threshold?: number;
  demotions?: number;
  promotions?: number;
  quantum_history?: QuantumHistoryEntry[];
  preemptive?: boolean;
  aging_enabled?: boolean;
  aging_interval?: number | null;
}

export interface SchedulingEvent {
  id?: number;
  simulation_id?: number;
  event_index?: number;
  event_time: number;
  pid: string;
  previous_queue: number | null;
  current_queue: number | null;
  selected_algorithm: string;
  remaining_burst_time: number;
  selected_time_quantum: number | null;
  event_type: string;
  explanation: string;
}

export interface WorkloadClassification {
  workload_type: string;
  recommended_algorithm: string;
  recommendation_reason: string;
  statistics: {
    process_count: number;
    total_burst_time: number;
    avg_burst_time: number;
    min_burst_time: number;
    max_burst_time: number;
    burst_std_dev: number;
    burst_cv: number;
    arrival_span: number;
    short_job_count: number;
    medium_job_count: number;
    long_job_count: number;
    short_job_ratio: number;
    long_job_ratio: number;
    unique_priorities: number;
    priority_spread: number;
  };
}

export interface ScheduleConfiguration {
  id?: number;
  algorithm: string;
  time_quantum: number;
  high_quantum: number;
  medium_quantum: number;
  max_quantum: number;
  aging_threshold: number;
  preemptive: boolean;
  aging_enabled: boolean;
  aging_interval: number;
  context_switch_cost: number;
  created_at?: string;
}

export interface ScheduleRunResult {
  algorithm: string;
  algorithm_key?: string;
  timeline: TimelineEntry[];
  process_results: ProcessResult[];
  metrics: SimulationMetrics;
  events: SchedulingEvent[];
  workload?: WorkloadClassification;
  configuration?: ScheduleConfiguration;
}

export interface SimulationRecord {
  id: number;
  name: string;
  algorithm: string;
  configuration_id: number;
  configuration: ScheduleConfiguration | null;
  process_count: number;
  avg_waiting_time: number;
  avg_turnaround_time: number;
  avg_response_time: number;
  cpu_utilization: number;
  cpu_idle_time: number;
  throughput: number;
  total_context_switches: number;
  total_scheduling_overhead: number;
  total_simulation_time: number;
  fairness_index: number;
  workload_type: string | null;
  recommended_algorithm: string | null;
  metrics: SimulationMetrics;
  process_results?: ProcessResult[];
  timeline?: TimelineEntry[];
  events?: SchedulingEvent[];
  created_at: string;
}

export interface ComparisonEntry {
  algorithm_key: string;
  algorithm: string;
  metrics: SimulationMetrics;
  timeline: TimelineEntry[];
  process_results: ProcessResult[];
  events_count: number;
}

export interface ComparisonResponse {
  process_count: number;
  processes: ProcessItem[];
  workload: WorkloadClassification;
  comparisons: ComparisonEntry[];
  best_by_metric: Record<
    string,
    {
      label: string;
      value: number;
      winners: string[];
    }
  >;
}

export interface DashboardAnalytics {
  process_count: number;
  total_simulations: number;
  latest_simulation: SimulationRecord | null;
  recent_simulations: SimulationRecord[];
  algorithm_distribution: Record<string, number>;
  live_comparison: ComparisonResponse | null;
}

export interface WhatIfDelta {
  baseline: number;
  modified: number;
  delta: number;
  percent_change: number | null;
}

export interface WhatIfResponse {
  baseline: ScheduleRunResult;
  modified: ScheduleRunResult;
  deltas: Record<string, WhatIfDelta>;
}

export interface PerformanceAnalyticsResponse {
  simulation: SimulationRecord;
  starvation_and_fairness: {
    fairness_index: number;
    max_waiting_time: number;
    waiting_time_std_dev: number;
    promotions_count: number;
    demotions_count: number;
    promotions: SchedulingEvent[];
    per_process_wait: Array<{
      pid: string;
      waiting_time: number;
      turnaround_time: number;
      response_time: number;
      priority: number;
    }>;
  };
  context_switch_analysis: {
    total_context_switches: number;
    total_scheduling_overhead: number;
    overhead_percentage: number;
    productive_busy_time: number;
    cpu_idle_time: number;
    switches: TimelineEntry[];
  };
  quantum_adjustments: SchedulingEvent[];
}
