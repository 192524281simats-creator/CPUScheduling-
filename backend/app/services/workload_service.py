import math
import random
from typing import Any, Dict, List

from app.utils.validators import validate_processes


DEFAULT_SAMPLE_PROCESSES = [
    {"pid": "P1", "arrival_time": 0, "burst_time": 8, "priority": 3},
    {"pid": "P2", "arrival_time": 1, "burst_time": 3, "priority": 1},
    {"pid": "P3", "arrival_time": 2, "burst_time": 6, "priority": 2},
    {"pid": "P4", "arrival_time": 3, "burst_time": 2, "priority": 4},
]


def classify_workload(processes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze statistical characteristics of a process workload and classify it
    with an empirical algorithm recommendation.
    """
    procs = validate_processes(processes)
    n = len(procs)
    bursts = [p["burst_time"] for p in procs]
    arrivals = [p["arrival_time"] for p in procs]
    priorities = [p["priority"] for p in procs]

    avg_burst = sum(bursts) / n
    min_burst = min(bursts)
    max_burst = max(bursts)
    burst_var = sum((b - avg_burst) ** 2 for b in bursts) / n
    burst_std = math.sqrt(burst_var)
    burst_cv = (burst_std / avg_burst) if avg_burst > 0 else 0.0

    short_jobs = sum(1 for b in bursts if b <= 4)
    medium_jobs = sum(1 for b in bursts if 5 <= b <= 9)
    long_jobs = sum(1 for b in bursts if b >= 10)

    short_ratio = short_jobs / n
    long_ratio = long_jobs / n

    arrival_span = max(arrivals) - min(arrivals)
    unique_priorities = len(set(priorities))
    priority_spread = max(priorities) - min(priorities)

    # Classification logic grounded in OS scheduling theory
    if short_ratio >= 0.65 and avg_burst <= 5.0:
        workload_type = "Interactive / Short-Burst Dominant"
        recommended_algorithm = "rr"
        recommendation_reason = (
            "Majority of processes have short CPU bursts (<= 4 units). Round Robin or "
            "Adaptive Hybrid MLFQ keeps response times low and prevents long jobs from blocking interactive tasks."
        )
    elif long_ratio >= 0.6 and burst_cv < 0.45:
        workload_type = "CPU-Intensive / Batch Heavy"
        recommended_algorithm = "sjf"
        recommendation_reason = (
            "Uniformly long CPU-bound bursts benefit from non-preemptive SJF or FCFS to minimize "
            "context-switch overhead while optimizing turnaround time."
        )
    elif burst_cv >= 0.55 and short_jobs >= 1 and long_jobs >= 1:
        workload_type = "Burst-Skewed (Convoy Risk)"
        recommended_algorithm = "hybrid"
        recommendation_reason = (
            "High burst variance mixes short interactive and long CPU-bound jobs. Adaptive Hybrid MLFQ "
            "separates short jobs in Queue 1 from CPU-bound jobs demoted to Queue 3 while aging prevents starvation."
        )
    elif unique_priorities >= min(3, n) and priority_spread >= 3:
        workload_type = "Priority-Critical / Heterogeneous"
        recommended_algorithm = "priority"
        recommendation_reason = (
            "Wide priority spread across processes indicates differentiated SLA importance; "
            "Preemptive Priority Scheduling (with aging enabled) respects urgency without starvation."
        )
    else:
        workload_type = "Mixed / Balanced Workload"
        recommended_algorithm = "hybrid"
        recommendation_reason = (
            "Balanced arrival and burst distribution makes Adaptive Hybrid MLFQ or SJF effective "
            "for balancing response time, waiting time, and throughput."
        )

    return {
        "workload_type": workload_type,
        "recommended_algorithm": recommended_algorithm,
        "recommendation_reason": recommendation_reason,
        "statistics": {
            "process_count": n,
            "total_burst_time": sum(bursts),
            "avg_burst_time": round(avg_burst, 2),
            "min_burst_time": min_burst,
            "max_burst_time": max_burst,
            "burst_std_dev": round(burst_std, 2),
            "burst_cv": round(burst_cv, 3),
            "arrival_span": arrival_span,
            "short_job_count": short_jobs,
            "medium_job_count": medium_jobs,
            "long_job_count": long_jobs,
            "short_job_ratio": round(short_ratio * 100, 1),
            "long_job_ratio": round(long_ratio * 100, 1),
            "unique_priorities": unique_priorities,
            "priority_spread": priority_spread,
        },
    }


def generate_sample_workload(preset: str = "mixed", count: int = 6) -> List[Dict[str, Any]]:
    """Generate deterministic/realistic sample OS workloads for testing and demos."""
    preset_key = preset.strip().lower()
    count = max(2, min(25, int(count)))

    if preset_key == "classic":
        return [dict(p) for p in DEFAULT_SAMPLE_PROCESSES]

    generated: List[Dict[str, Any]] = []
    if preset_key == "interactive":
        for i in range(1, count + 1):
            generated.append(
                {
                    "pid": f"P{i}",
                    "arrival_time": (i - 1) * random.randint(0, 2),
                    "burst_time": random.randint(1, 4),
                    "priority": random.randint(1, 4),
                }
            )
    elif preset_key == "batch":
        for i in range(1, count + 1):
            generated.append(
                {
                    "pid": f"P{i}",
                    "arrival_time": random.randint(0, 4),
                    "burst_time": random.randint(10, 22),
                    "priority": random.randint(2, 5),
                }
            )
    elif preset_key == "priority_heavy":
        for i in range(1, count + 1):
            generated.append(
                {
                    "pid": f"P{i}",
                    "arrival_time": random.randint(0, 6),
                    "burst_time": random.randint(3, 14),
                    "priority": ((i - 1) % 5) + 1,
                }
            )
    elif preset_key == "convoy":
        generated.append({"pid": "P1", "arrival_time": 0, "burst_time": 18, "priority": 4})
        for i in range(2, count + 1):
            generated.append(
                {
                    "pid": f"P{i}",
                    "arrival_time": i - 1,
                    "burst_time": random.randint(1, 3),
                    "priority": random.randint(1, 3),
                }
            )
    else:  # mixed
        for i in range(1, count + 1):
            burst = random.randint(1, 4) if i % 2 == 0 else random.randint(6, 15)
            generated.append(
                {
                    "pid": f"P{i}",
                    "arrival_time": random.randint(0, max(3, count)),
                    "burst_time": burst,
                    "priority": random.randint(1, 5),
                }
            )

    return generated
