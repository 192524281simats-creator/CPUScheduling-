import math
from typing import Any, Dict, List


def calculate_metrics(
    process_results: List[Dict[str, Any]],
    timeline: List[Dict[str, Any]],
    context_switch_cost: int = 0,
) -> Dict[str, Any]:
    """
    Compute comprehensive CPU scheduling performance metrics from finalized
    process results and execution timeline entries.
    """
    n = len(process_results)
    if n == 0:
        return {
            "average_waiting_time": 0.0,
            "average_turnaround_time": 0.0,
            "average_response_time": 0.0,
            "max_waiting_time": 0,
            "min_waiting_time": 0,
            "waiting_time_std_dev": 0.0,
            "cpu_utilization": 0.0,
            "effective_cpu_utilization": 0.0,
            "cpu_idle_time": 0,
            "productive_busy_time": 0,
            "total_simulation_time": 0,
            "throughput": 0.0,
            "total_context_switches": 0,
            "total_scheduling_overhead": 0,
            "context_switch_cost": context_switch_cost,
            "overhead_percentage": 0.0,
            "fairness_index": 1.0,
            "total_processes": 0,
        }

    waiting_times: List[int] = []
    turnaround_times: List[int] = []
    response_times: List[int] = []
    service_ratios: List[float] = []

    for proc in process_results:
        arrival = int(proc["arrival_time"])
        burst = int(proc["burst_time"])
        completion = int(proc["completion_time"])
        first_start = int(proc["first_start_time"])

        tat = completion - arrival
        wt = tat - burst
        rt = first_start - arrival

        proc["turnaround_time"] = tat
        proc["waiting_time"] = wt
        proc["response_time"] = rt

        turnaround_times.append(tat)
        waiting_times.append(wt)
        response_times.append(rt)
        service_ratios.append(burst / tat if tat > 0 else 1.0)

    productive_busy_time = sum(
        int(entry["duration"]) for entry in timeline if entry.get("event_type") == "execution"
    )
    cpu_idle_time = sum(
        int(entry["duration"]) for entry in timeline if entry.get("event_type") == "idle"
    )
    explicit_overhead_time = sum(
        int(entry["duration"]) for entry in timeline if entry.get("event_type") == "context_switch"
    )

    total_context_switches = 0
    last_exec_pid = None
    for entry in timeline:
        etype = entry.get("event_type")
        if etype == "idle":
            last_exec_pid = None
        elif etype == "execution":
            pid = entry.get("pid")
            if last_exec_pid is not None and last_exec_pid != pid:
                total_context_switches += 1
            last_exec_pid = pid

    total_scheduling_overhead = total_context_switches * int(context_switch_cost)
    if explicit_overhead_time != total_scheduling_overhead and explicit_overhead_time > 0:
        total_scheduling_overhead = explicit_overhead_time

    total_simulation_time = max((int(entry["end_time"]) for entry in timeline), default=0)

    if total_simulation_time > 0:
        cpu_utilization = (productive_busy_time / total_simulation_time) * 100.0
        effective_cpu_utilization = (
            (productive_busy_time + total_scheduling_overhead) / total_simulation_time
        ) * 100.0
        throughput = n / total_simulation_time
        overhead_percentage = (total_scheduling_overhead / total_simulation_time) * 100.0
    else:
        cpu_utilization = 0.0
        effective_cpu_utilization = 0.0
        throughput = 0.0
        overhead_percentage = 0.0

    avg_wt = sum(waiting_times) / n
    avg_tat = sum(turnaround_times) / n
    avg_rt = sum(response_times) / n

    variance_wt = sum((w - avg_wt) ** 2 for w in waiting_times) / n
    wt_std_dev = math.sqrt(variance_wt)

    # Jain's fairness index on burst/turnaround service ratios (bounded in (0, 1])
    sum_ratios = sum(service_ratios)
    sum_sq_ratios = sum(r * r for r in service_ratios)
    fairness_index = (
        (sum_ratios * sum_ratios) / (n * sum_sq_ratios) if sum_sq_ratios > 0 else 1.0
    )

    return {
        "average_waiting_time": round(avg_wt, 4),
        "average_turnaround_time": round(avg_tat, 4),
        "average_response_time": round(avg_rt, 4),
        "max_waiting_time": max(waiting_times),
        "min_waiting_time": min(waiting_times),
        "waiting_time_std_dev": round(wt_std_dev, 4),
        "cpu_utilization": round(cpu_utilization, 4),
        "effective_cpu_utilization": round(effective_cpu_utilization, 4),
        "cpu_idle_time": int(cpu_idle_time),
        "productive_busy_time": int(productive_busy_time),
        "total_simulation_time": int(total_simulation_time),
        "throughput": round(throughput, 4),
        "total_context_switches": int(total_context_switches),
        "total_scheduling_overhead": int(total_scheduling_overhead),
        "context_switch_cost": int(context_switch_cost),
        "overhead_percentage": round(overhead_percentage, 4),
        "fairness_index": round(fairness_index, 4),
        "total_processes": n,
    }
