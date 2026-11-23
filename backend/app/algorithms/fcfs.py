from typing import Any, Dict, List

from app.algorithms.base import (
    finalize_schedule_result,
    make_event,
    make_timeline_entry,
)
from app.utils.validators import validate_non_negative_int, validate_processes


def fcfs_schedule(
    processes: List[Dict[str, Any]],
    context_switch_cost: int = 0,
) -> Dict[str, Any]:
    """
    First Come First Serve (FCFS) non-preemptive CPU scheduling.
    Processes are sorted by arrival_time with pid as deterministic tie-breaker.
    """
    procs = validate_processes(processes)
    cs_cost = validate_non_negative_int(context_switch_cost, "context_switch_cost")

    ordered = sorted(procs, key=lambda p: (p["arrival_time"], p["pid"]))

    current_time = 0
    last_pid = None
    timeline: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []
    first_starts: Dict[str, int] = {}
    completions: Dict[str, int] = {}

    for proc in ordered:
        pid = proc["pid"]
        arrival = proc["arrival_time"]
        burst = proc["burst_time"]

        if current_time < arrival:
            timeline.append(
                make_timeline_entry(
                    pid="IDLE",
                    start_time=current_time,
                    end_time=arrival,
                    queue_level=None,
                    event_type="idle",
                )
            )
            events.append(
                make_event(
                    event_time=current_time,
                    pid="IDLE",
                    previous_queue=None,
                    current_queue=None,
                    selected_algorithm="FCFS",
                    remaining_burst_time=0,
                    selected_time_quantum=None,
                    event_type="idle",
                    explanation=f"CPU remained idle from t={current_time} to t={arrival} waiting for process {pid} to arrive.",
                )
            )
            current_time = arrival
            last_pid = None
        elif last_pid is not None and last_pid != pid:
            if cs_cost > 0:
                timeline.append(
                    make_timeline_entry(
                        pid="CS",
                        start_time=current_time,
                        end_time=current_time + cs_cost,
                        queue_level=None,
                        event_type="context_switch",
                        from_pid=last_pid,
                        to_pid=pid,
                    )
                )
                events.append(
                    make_event(
                        event_time=current_time,
                        pid=pid,
                        previous_queue=None,
                        current_queue=None,
                        selected_algorithm="FCFS",
                        remaining_burst_time=burst,
                        selected_time_quantum=None,
                        event_type="context_switch",
                        explanation=f"Context switch from {last_pid} to {pid} incurred {cs_cost} time unit(s) of overhead.",
                    )
                )
                current_time += cs_cost

        start_time = current_time
        end_time = start_time + burst
        first_starts[pid] = start_time
        completions[pid] = end_time

        timeline.append(
            make_timeline_entry(
                pid=pid,
                start_time=start_time,
                end_time=end_time,
                queue_level=None,
                event_type="execution",
            )
        )
        events.append(
            make_event(
                event_time=start_time,
                pid=pid,
                previous_queue=None,
                current_queue=None,
                selected_algorithm="FCFS",
                remaining_burst_time=burst,
                selected_time_quantum=None,
                event_type="dispatch",
                explanation=f"Process {pid} (arrival={arrival}, burst={burst}) was selected next in arrival order under FCFS.",
            )
        )
        events.append(
            make_event(
                event_time=end_time,
                pid=pid,
                previous_queue=None,
                current_queue=None,
                selected_algorithm="FCFS",
                remaining_burst_time=0,
                selected_time_quantum=None,
                event_type="completion",
                explanation=f"Process {pid} completed execution at t={end_time}.",
            )
        )

        current_time = end_time
        last_pid = pid

    return finalize_schedule_result(
        algorithm="FCFS",
        processes=procs,
        timeline=timeline,
        first_starts=first_starts,
        completions=completions,
        events=events,
        context_switch_cost=cs_cost,
    )
