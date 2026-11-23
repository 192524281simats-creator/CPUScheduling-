import copy
from typing import Any, Dict, List

from app.algorithms.fcfs import fcfs_schedule
from app.algorithms.hybrid import hybrid_schedule
from app.algorithms.priority import priority_schedule
from app.algorithms.round_robin import round_robin_schedule
from app.algorithms.sjf import sjf_schedule
from app.services.workload_service import classify_workload
from app.utils.validators import ValidationError, validate_processes


ALGORITHM_DISPLAY_NAMES = {
    "fcfs": "FCFS",
    "sjf": "SJF",
    "rr": "Round Robin",
    "round_robin": "Round Robin",
    "priority": "Priority",
    "hybrid": "Adaptive Hybrid MLFQ",
}


def run_algorithm(
    algorithm: str,
    processes: List[Dict[str, Any]],
    config: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Validate inputs and execute a single scheduling algorithm on an isolated deep copy
    of the process list.
    """
    cfg = config or {}
    clean_processes = validate_processes(processes)
    algo_key = str(algorithm).strip().lower()

    cs_cost = cfg.get("context_switch_cost", 0)

    if algo_key == "fcfs":
        result = fcfs_schedule(
            copy.deepcopy(clean_processes),
            context_switch_cost=cs_cost,
        )
    elif algo_key == "sjf":
        result = sjf_schedule(
            copy.deepcopy(clean_processes),
            context_switch_cost=cs_cost,
        )
    elif algo_key in ("rr", "round_robin"):
        result = round_robin_schedule(
            copy.deepcopy(clean_processes),
            time_quantum=cfg.get("time_quantum", 4),
            context_switch_cost=cs_cost,
        )
    elif algo_key == "priority":
        result = priority_schedule(
            copy.deepcopy(clean_processes),
            preemptive=cfg.get("preemptive", False),
            context_switch_cost=cs_cost,
            aging_enabled=cfg.get("aging_enabled", False),
            aging_interval=cfg.get("aging_interval", 5),
        )
    elif algo_key == "hybrid":
        result = hybrid_schedule(
            copy.deepcopy(clean_processes),
            high_quantum=cfg.get("high_quantum", 2),
            medium_quantum=cfg.get("medium_quantum", 4),
            aging_threshold=cfg.get("aging_threshold", 10),
            context_switch_cost=cs_cost,
            max_quantum=cfg.get("max_quantum", 12),
        )
    else:
        raise ValidationError(
            f"Unsupported algorithm '{algorithm}'. Choose from fcfs, sjf, rr, priority, hybrid."
        )

    workload_info = classify_workload(clean_processes)
    result["workload"] = workload_info
    result["algorithm_key"] = "rr" if algo_key == "round_robin" else algo_key
    result["configuration"] = {
        "algorithm": result["algorithm_key"],
        "time_quantum": cfg.get("time_quantum", 4),
        "high_quantum": cfg.get("high_quantum", 2),
        "medium_quantum": cfg.get("medium_quantum", 4),
        "max_quantum": cfg.get("max_quantum", 12),
        "aging_threshold": cfg.get("aging_threshold", 10),
        "preemptive": cfg.get("preemptive", False),
        "aging_enabled": cfg.get("aging_enabled", False),
        "aging_interval": cfg.get("aging_interval", 5),
        "context_switch_cost": cs_cost,
    }
    return result


def compare_all_algorithms(
    processes: List[Dict[str, Any]],
    config: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Run FCFS, SJF, Round Robin, Priority, and Adaptive Hybrid MLFQ on identical
    process inputs and identify empirical best performers per metric.
    """
    cfg = config or {}
    clean_processes = validate_processes(processes)

    algo_keys = ["fcfs", "sjf", "rr", "priority", "hybrid"]
    results: List[Dict[str, Any]] = []

    for key in algo_keys:
        res = run_algorithm(key, copy.deepcopy(clean_processes), cfg)
        results.append(
            {
                "algorithm_key": key,
                "algorithm": res["algorithm"],
                "metrics": res["metrics"],
                "timeline": res["timeline"],
                "process_results": res["process_results"],
                "events_count": len(res["events"]),
            }
        )

    metric_objectives = {
        "average_waiting_time": ("min", "Lowest Average Waiting Time"),
        "average_turnaround_time": ("min", "Lowest Average Turnaround Time"),
        "average_response_time": ("min", "Lowest Average Response Time"),
        "cpu_utilization": ("max", "Highest CPU Utilization"),
        "throughput": ("max", "Highest Throughput"),
        "total_context_switches": ("min", "Fewest Context Switches"),
        "fairness_index": ("max", "Highest Fairness Index"),
    }

    best_by_metric: Dict[str, Dict[str, Any]] = {}
    for metric_key, (direction, label) in metric_objectives.items():
        if direction == "min":
            best_val = min(item["metrics"][metric_key] for item in results)
        else:
            best_val = max(item["metrics"][metric_key] for item in results)

        winners = [
            item["algorithm"]
            for item in results
            if item["metrics"][metric_key] == best_val
        ]
        best_by_metric[metric_key] = {
            "label": label,
            "value": best_val,
            "winners": winners,
        }

    workload = classify_workload(clean_processes)

    return {
        "process_count": len(clean_processes),
        "processes": clean_processes,
        "workload": workload,
        "comparisons": results,
        "best_by_metric": best_by_metric,
    }


def run_what_if_comparison(
    processes: List[Dict[str, Any]],
    baseline_algorithm: str,
    baseline_config: Dict[str, Any],
    modified_algorithm: str,
    modified_config: Dict[str, Any],
) -> Dict[str, Any]:
    """Compare before-and-after performance between two configurations/algorithms."""
    clean_processes = validate_processes(processes)
    baseline = run_algorithm(baseline_algorithm, copy.deepcopy(clean_processes), baseline_config)
    modified = run_algorithm(modified_algorithm, copy.deepcopy(clean_processes), modified_config)

    b_m = baseline["metrics"]
    m_m = modified["metrics"]

    tracked = [
        "average_waiting_time",
        "average_turnaround_time",
        "average_response_time",
        "cpu_utilization",
        "throughput",
        "total_context_switches",
        "total_scheduling_overhead",
        "fairness_index",
    ]
    deltas = {}
    for key in tracked:
        diff = round(m_m[key] - b_m[key], 4)
        pct = round((diff / b_m[key]) * 100.0, 2) if b_m[key] not in (0, 0.0) else None
        deltas[key] = {
            "baseline": b_m[key],
            "modified": m_m[key],
            "delta": diff,
            "percent_change": pct,
        }

    return {
        "baseline": baseline,
        "modified": modified,
        "deltas": deltas,
    }
