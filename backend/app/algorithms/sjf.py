from typing import Any, Dict, List

from app.algorithms.base import (
    finalize_schedule_result,
    make_event,
    make_timeline_entry,
)
from app.utils.validators import validate_non_negative_int, validate_processes


def sjf_schedule(
    processes: List[Dict[str, Any]],
    context_switch_cost: int = 0,
) -> Dict[str, Any]:
    """
    Non-preemptive Shortest Job First (SJF) CPU scheduling.
    Always selects the ready process with minimum burst_time, breaking ties by
    arrival_time and then pid.
    """
    procs = validate_processes(processes)
    cs_cost = validate_non_negative_int(context_switch_cost, "context_switch_cost")

    remaining = list(procs)
    current_time = 0
    last_pid = None
    timeline: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []
    first_starts: Dict[str, int] = {}
    completions: Dict[str, int] = {}

    while remaining:
        ready = [p for p in remaining if p["arrival_time"] <= current_time]

        if not ready:
            next_arrival = min(p["arrival_time"] for p in remaining)
            timeline.append(
                make_timeline_entry(
                    pid="IDLE",
                    start_time=current_time,
                    end_time=next_arrival,
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
                    selected_algorithm="SJF",
                    remaining_burst_time=0,
                    selected_time_quantum=None,
                    event_type="idle",
                    explanation=f"CPU idle from t={current_time} to t={next_arrival} because no processes were ready.",
                )
            )
            current_time = next_arrival
            last_pid = None
            continue

        chosen = min(ready, key=lambda p: (p["burst_time"], p["arrival_time"], p["pid"]))
        pid = chosen["pid"]
        burst = chosen["burst_time"]

        if last_pid is not None and last_pid != pid:
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
                        selected_algorithm="SJF",
                        remaining_burst_time=burst,
                        selected_time_quantum=None,
                        event_type="context_switch",
                        explanation=f"Context switch from {last_pid} to {pid} incurred {cs_cost} time unit(s) of overhead.",
                    )
                )
                current_time += cs_cost
                # Re-check ready queue? Non-preemptive SJF commits to chosen or re-evaluates before dispatch;
                # choosing before CS and dispatching chosen is deterministic.

        start_time = current_time
        end_time = start_time + burst
        first_starts[pid] = start_time
        completions[pid] = end_time

        ready_summary = ", ".join(f"{p['pid']}(bt={p['burst_time']})" for p in ready)
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
                selected_algorithm="SJF",
                remaining_burst_time=burst,
                selected_time_quantum=None,
                event_type="dispatch",
                explanation=f"Process {pid} was selected because it had the shortest burst time ({burst}) among ready processes [{ready_summary}].",
            )
        )
        events.append(
            make_event(
                event_time=end_time,
                pid=pid,
                previous_queue=None,
                current_queue=None,
                selected_algorithm="SJF",
                remaining_burst_time=0,
                selected_time_quantum=None,
                event_type="completion",
                explanation=f"Process {pid} completed execution at t={end_time}.",
            )
        )

        current_time = end_time
        last_pid = pid
        remaining.remove(chosen)

    return finalize_schedule_result(
        algorithm="SJF",
        processes=procs,
        timeline=timeline,
        first_starts=first_starts,
        completions=completions,
        events=events,
        context_switch_cost=cs_cost,
    )
