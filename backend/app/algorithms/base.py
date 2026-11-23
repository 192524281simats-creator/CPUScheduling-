from typing import Any, Dict, List, Optional

from app.services.metrics_service import calculate_metrics
from app.utils.validators import ValidationError, validate_processes


def make_timeline_entry(
    pid: str,
    start_time: int,
    end_time: int,
    queue_level: Optional[int] = None,
    event_type: str = "execution",
    from_pid: Optional[str] = None,
    to_pid: Optional[str] = None,
) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "pid": pid,
        "start_time": int(start_time),
        "end_time": int(end_time),
        "duration": int(end_time - start_time),
        "queue_level": queue_level,
        "event_type": event_type,
    }
    if from_pid is not None:
        entry["from_pid"] = from_pid
    if to_pid is not None:
        entry["to_pid"] = to_pid
    return entry


def make_event(
    event_time: int,
    pid: str,
    previous_queue: Optional[int],
    current_queue: Optional[int],
    selected_algorithm: str,
    remaining_burst_time: int,
    selected_time_quantum: Optional[int],
    event_type: str,
    explanation: str,
) -> Dict[str, Any]:
    return {
        "event_time": int(event_time),
        "pid": pid,
        "previous_queue": previous_queue,
        "current_queue": current_queue,
        "selected_algorithm": selected_algorithm,
        "remaining_burst_time": int(remaining_burst_time),
        "selected_time_quantum": selected_time_quantum,
        "event_type": event_type,
        "explanation": explanation,
    }


def append_or_merge_execution(
    timeline: List[Dict[str, Any]],
    pid: str,
    start_time: int,
    end_time: int,
    queue_level: Optional[int] = None,
) -> None:
    """Append an execution slice, merging with the immediately preceding slice if identical PID & queue."""
    if end_time <= start_time:
        return
    if timeline:
        prev = timeline[-1]
        if (
            prev["event_type"] == "execution"
            and prev["pid"] == pid
            and prev["queue_level"] == queue_level
            and prev["end_time"] == start_time
        ):
            prev["end_time"] = int(end_time)
            prev["duration"] = int(end_time - prev["start_time"])
            return
    timeline.append(
        make_timeline_entry(
            pid=pid,
            start_time=start_time,
            end_time=end_time,
            queue_level=queue_level,
            event_type="execution",
        )
    )


def finalize_schedule_result(
    algorithm: str,
    processes: List[Dict[str, Any]],
    timeline: List[Dict[str, Any]],
    first_starts: Dict[str, int],
    completions: Dict[str, int],
    events: List[Dict[str, Any]],
    context_switch_cost: int = 0,
    extra_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    process_results: List[Dict[str, Any]] = []
    for proc in sorted(processes, key=lambda p: (p["arrival_time"], p["pid"])):
        pid = proc["pid"]
        first_start = first_starts[pid]
        completion = completions[pid]
        tat = completion - proc["arrival_time"]
        wt = tat - proc["burst_time"]
        rt = first_start - proc["arrival_time"]
        process_results.append(
            {
                "pid": pid,
                "arrival_time": proc["arrival_time"],
                "burst_time": proc["burst_time"],
                "priority": proc["priority"],
                "first_start_time": first_start,
                "completion_time": completion,
                "turnaround_time": tat,
                "waiting_time": wt,
                "response_time": rt,
            }
        )

    metrics = calculate_metrics(
        process_results=process_results,
        timeline=timeline,
        context_switch_cost=context_switch_cost,
    )
    if extra_metadata:
        metrics.update(extra_metadata)

    return {
        "algorithm": algorithm,
        "timeline": timeline,
        "process_results": process_results,
        "metrics": metrics,
        "events": events,
    }


def schedule(processes: List[Dict[str, Any]], **kwargs: Any) -> Dict[str, Any]:
    """
    Common scheduling interface dispatching to the requested algorithm.
    Supported 'algorithm' kwargs: fcfs, sjf, rr, priority, hybrid.
    """
    validate_processes(processes)
    algorithm = str(kwargs.get("algorithm", "hybrid")).strip().lower()

    if algorithm == "fcfs":
        from app.algorithms.fcfs import fcfs_schedule

        return fcfs_schedule(
            processes,
            context_switch_cost=kwargs.get("context_switch_cost", 0),
        )
    if algorithm == "sjf":
        from app.algorithms.sjf import sjf_schedule

        return sjf_schedule(
            processes,
            context_switch_cost=kwargs.get("context_switch_cost", 0),
        )
    if algorithm in ("rr", "round_robin"):
        from app.algorithms.round_robin import round_robin_schedule

        return round_robin_schedule(
            processes,
            time_quantum=kwargs.get("time_quantum", 4),
            context_switch_cost=kwargs.get("context_switch_cost", 0),
        )
    if algorithm == "priority":
        from app.algorithms.priority import priority_schedule

        return priority_schedule(
            processes,
            preemptive=kwargs.get("preemptive", False),
            context_switch_cost=kwargs.get("context_switch_cost", 0),
            aging_enabled=kwargs.get("aging_enabled", False),
            aging_interval=kwargs.get("aging_interval", 5),
        )
    if algorithm == "hybrid":
        from app.algorithms.hybrid import hybrid_schedule

        return hybrid_schedule(
            processes,
            high_quantum=kwargs.get("high_quantum", 2),
            medium_quantum=kwargs.get("medium_quantum", 4),
            aging_threshold=kwargs.get("aging_threshold", 10),
            context_switch_cost=kwargs.get("context_switch_cost", 0),
            max_quantum=kwargs.get("max_quantum", 12),
        )

    raise ValidationError(f"Unsupported scheduling algorithm: '{algorithm}'.")
