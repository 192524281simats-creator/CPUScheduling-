import math
from typing import Any, Dict, List, Set

from app.algorithms.base import (
    append_or_merge_execution,
    finalize_schedule_result,
    make_event,
    make_timeline_entry,
)
from app.utils.validators import (
    validate_bool,
    validate_non_negative_int,
    validate_positive_int,
    validate_processes,
)


def priority_schedule(
    processes: List[Dict[str, Any]],
    preemptive: bool = False,
    context_switch_cost: int = 0,
    aging_enabled: bool = False,
    aging_interval: int = 5,
) -> Dict[str, Any]:
    """
    Priority CPU Scheduling (non-preemptive and preemptive).
    Lower integer priority value indicates higher priority (e.g., 1 > 3).

    Aging Policy (when aging_enabled=True):
      Every `aging_interval` time units a ready process waits since arrival or
      its most recent CPU execution improves its effective priority by 1 level
      (bounded below at priority 0) to prevent starvation.
    """
    procs = validate_processes(processes)
    is_preemptive = validate_bool(preemptive, "preemptive")
    cs_cost = validate_non_negative_int(context_switch_cost, "context_switch_cost")
    use_aging = validate_bool(aging_enabled, "aging_enabled")
    interval = validate_positive_int(aging_interval, "aging_interval")

    remaining_bt = {p["pid"]: p["burst_time"] for p in procs}
    last_active_time = {p["pid"]: p["arrival_time"] for p in procs}
    completed: Set[str] = set()
    first_starts: Dict[str, int] = {}
    completions: Dict[str, int] = {}
    timeline: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []

    def effective_priority(proc: Dict[str, Any], now: int) -> int:
        base_prio = proc["priority"]
        if not use_aging:
            return base_prio
        waited = max(0, now - last_active_time[proc["pid"]])
        boost = waited // interval
        return max(0, base_prio - boost)

    n = len(procs)
    current_time = 0
    last_pid = None
    active_pid = None
    algo_label = "Preemptive Priority" if is_preemptive else "Non-Preemptive Priority"

    while len(completed) < n:
        ready = [
            p
            for p in procs
            if p["pid"] not in completed and p["arrival_time"] <= current_time
        ]

        if not ready:
            next_arrival = min(
                p["arrival_time"] for p in procs if p["pid"] not in completed
            )
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
                    selected_algorithm=algo_label,
                    remaining_burst_time=0,
                    selected_time_quantum=None,
                    event_type="idle",
                    explanation=f"CPU idle from t={current_time} to t={next_arrival} awaiting process arrival.",
                )
            )
            current_time = next_arrival
            last_pid = None
            active_pid = None
            continue

        chosen = min(
            ready,
            key=lambda p: (
                effective_priority(p, current_time),
                p["arrival_time"],
                p["pid"],
            ),
        )
        pid = chosen["pid"]
        eff_prio = effective_priority(chosen, current_time)

        if last_pid is not None and last_pid != pid:
            if active_pid is not None and active_pid != pid and active_pid not in completed:
                events.append(
                    make_event(
                        event_time=current_time,
                        pid=active_pid,
                        previous_queue=None,
                        current_queue=None,
                        selected_algorithm=algo_label,
                        remaining_burst_time=remaining_bt[active_pid],
                        selected_time_quantum=None,
                        event_type="preemption",
                        explanation=f"Process {active_pid} was preempted by higher-priority process {pid} (effective priority={eff_prio}).",
                    )
                )
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
                        selected_algorithm=algo_label,
                        remaining_burst_time=remaining_bt[pid],
                        selected_time_quantum=None,
                        event_type="context_switch",
                        explanation=f"Context switch from {last_pid} to {pid} incurred {cs_cost} time unit(s) of overhead.",
                    )
                )
                current_time += cs_cost
                # Re-evaluate ready set after context switch time elapses
                ready = [
                    p
                    for p in procs
                    if p["pid"] not in completed and p["arrival_time"] <= current_time
                ]
                chosen = min(
                    ready,
                    key=lambda p: (
                        effective_priority(p, current_time),
                        p["arrival_time"],
                        p["pid"],
                    ),
                )
                pid = chosen["pid"]
                eff_prio = effective_priority(chosen, current_time)

        if pid not in first_starts:
            first_starts[pid] = current_time

        if active_pid != pid:
            aging_note = (
                f" (base priority={chosen['priority']}, effective={eff_prio} via aging)"
                if use_aging and eff_prio != chosen["priority"]
                else f" (priority={eff_prio})"
            )
            events.append(
                make_event(
                    event_time=current_time,
                    pid=pid,
                    previous_queue=None,
                    current_queue=None,
                    selected_algorithm=algo_label,
                    remaining_burst_time=remaining_bt[pid],
                    selected_time_quantum=None,
                    event_type="dispatch",
                    explanation=f"Process {pid}{aging_note} was selected as highest-priority ready process.",
                )
            )

        if not is_preemptive:
            exec_slice = remaining_bt[pid]
        else:
            completion_t = current_time + remaining_bt[pid]
            next_arrivals = [
                p["arrival_time"]
                for p in procs
                if p["pid"] not in completed and p["arrival_time"] > current_time
            ]
            next_arrival_t = min(next_arrivals) if next_arrivals else math.inf

            next_aging_t = math.inf
            if use_aging:
                for p in ready:
                    if p["pid"] == pid:
                        continue
                    if effective_priority(p, current_time) > 0:
                        waited = current_time - last_active_time[p["pid"]]
                        rem_to_boost = interval - (waited % interval)
                        next_aging_t = min(next_aging_t, current_time + rem_to_boost)

            step_end = int(min(completion_t, next_arrival_t, next_aging_t))
            exec_slice = max(1, step_end - current_time)

        start_time = current_time
        end_time = start_time + exec_slice
        append_or_merge_execution(
            timeline=timeline,
            pid=pid,
            start_time=start_time,
            end_time=end_time,
            queue_level=None,
        )

        remaining_bt[pid] -= exec_slice
        current_time = end_time
        last_active_time[pid] = current_time
        last_pid = pid
        active_pid = pid

        if remaining_bt[pid] == 0:
            completed.add(pid)
            completions[pid] = current_time
            active_pid = None
            events.append(
                make_event(
                    event_time=current_time,
                    pid=pid,
                    previous_queue=None,
                    current_queue=None,
                    selected_algorithm=algo_label,
                    remaining_burst_time=0,
                    selected_time_quantum=None,
                    event_type="completion",
                    explanation=f"Process {pid} completed execution at t={current_time}.",
                )
            )

    return finalize_schedule_result(
        algorithm=algo_label,
        processes=procs,
        timeline=timeline,
        first_starts=first_starts,
        completions=completions,
        events=events,
        context_switch_cost=cs_cost,
        extra_metadata={
            "preemptive": is_preemptive,
            "aging_enabled": use_aging,
            "aging_interval": interval if use_aging else None,
        },
    )
