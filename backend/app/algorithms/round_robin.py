from collections import deque
from typing import Any, Deque, Dict, List, Set

from app.algorithms.base import (
    finalize_schedule_result,
    make_event,
    make_timeline_entry,
)
from app.utils.validators import (
    validate_non_negative_int,
    validate_positive_int,
    validate_processes,
)


def round_robin_schedule(
    processes: List[Dict[str, Any]],
    time_quantum: int = 4,
    context_switch_cost: int = 0,
) -> Dict[str, Any]:
    """
    Round Robin (RR) preemptive CPU scheduling with a FIFO ready queue.
    """
    procs = validate_processes(processes)
    quantum = validate_positive_int(time_quantum, "time_quantum")
    cs_cost = validate_non_negative_int(context_switch_cost, "context_switch_cost")

    ordered = sorted(procs, key=lambda p: (p["arrival_time"], p["pid"]))
    proc_map = {p["pid"]: p for p in ordered}
    remaining_bt = {p["pid"]: p["burst_time"] for p in ordered}

    ready_queue: Deque[str] = deque()
    in_queue: Set[str] = set()
    completed: Set[str] = set()
    next_arrival_idx = 0
    n = len(ordered)

    def enqueue_arrivals(up_to_time: int) -> None:
        nonlocal next_arrival_idx
        while next_arrival_idx < n and ordered[next_arrival_idx]["arrival_time"] <= up_to_time:
            pid_arr = ordered[next_arrival_idx]["pid"]
            if pid_arr not in completed and pid_arr not in in_queue:
                ready_queue.append(pid_arr)
                in_queue.add(pid_arr)
            next_arrival_idx += 1

    current_time = 0
    last_pid = None
    timeline: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []
    first_starts: Dict[str, int] = {}
    completions: Dict[str, int] = {}

    enqueue_arrivals(current_time)

    while len(completed) < n:
        if not ready_queue:
            next_arrival_time = ordered[next_arrival_idx]["arrival_time"]
            timeline.append(
                make_timeline_entry(
                    pid="IDLE",
                    start_time=current_time,
                    end_time=next_arrival_time,
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
                    selected_algorithm=f"Round Robin (q={quantum})",
                    remaining_burst_time=0,
                    selected_time_quantum=quantum,
                    event_type="idle",
                    explanation=f"CPU idle from t={current_time} to t={next_arrival_time} awaiting next process arrival.",
                )
            )
            current_time = next_arrival_time
            last_pid = None
            enqueue_arrivals(current_time)
            continue

        pid = ready_queue.popleft()
        in_queue.discard(pid)

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
                        selected_algorithm=f"Round Robin (q={quantum})",
                        remaining_burst_time=remaining_bt[pid],
                        selected_time_quantum=quantum,
                        event_type="context_switch",
                        explanation=f"Context switch from {last_pid} to {pid} incurred {cs_cost} time unit(s) of overhead.",
                    )
                )
                current_time += cs_cost
                enqueue_arrivals(current_time)

        if pid not in first_starts:
            first_starts[pid] = current_time

        exec_slice = min(quantum, remaining_bt[pid])
        start_time = current_time
        end_time = start_time + exec_slice

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
                selected_algorithm=f"Round Robin (q={quantum})",
                remaining_burst_time=remaining_bt[pid],
                selected_time_quantum=quantum,
                event_type="dispatch",
                explanation=f"Process {pid} was dispatched from the FIFO ready queue for up to {quantum} time unit(s) (remaining={remaining_bt[pid]}).",
            )
        )

        remaining_bt[pid] -= exec_slice
        current_time = end_time
        last_pid = pid

        # Enqueue arrivals up to current_time before requeuing preempted process
        enqueue_arrivals(current_time)

        if remaining_bt[pid] > 0:
            ready_queue.append(pid)
            in_queue.add(pid)
            events.append(
                make_event(
                    event_time=current_time,
                    pid=pid,
                    previous_queue=None,
                    current_queue=None,
                    selected_algorithm=f"Round Robin (q={quantum})",
                    remaining_burst_time=remaining_bt[pid],
                    selected_time_quantum=quantum,
                    event_type="preemption",
                    explanation=f"Process {pid} consumed its time quantum ({quantum}) and was re-queued with {remaining_bt[pid]} time unit(s) remaining.",
                )
            )
        else:
            completed.add(pid)
            completions[pid] = current_time
            events.append(
                make_event(
                    event_time=current_time,
                    pid=pid,
                    previous_queue=None,
                    current_queue=None,
                    selected_algorithm=f"Round Robin (q={quantum})",
                    remaining_burst_time=0,
                    selected_time_quantum=quantum,
                    event_type="completion",
                    explanation=f"Process {pid} finished all {proc_map[pid]['burst_time']} burst units at t={current_time}.",
                )
            )

    return finalize_schedule_result(
        algorithm="Round Robin",
        processes=procs,
        timeline=timeline,
        first_starts=first_starts,
        completions=completions,
        events=events,
        context_switch_cost=cs_cost,
        extra_metadata={"time_quantum": quantum},
    )
