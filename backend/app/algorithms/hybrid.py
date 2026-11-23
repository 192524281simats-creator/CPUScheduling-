from collections import deque
import math
from typing import Any, Deque, Dict, List, Optional, Set, Tuple

from app.algorithms.base import (
    append_or_merge_execution,
    finalize_schedule_result,
    make_event,
    make_timeline_entry,
)
from app.utils.validators import (
    validate_non_negative_int,
    validate_positive_int,
    validate_processes,
)


def _compute_adaptive_quantum(
    base_quantum: int,
    max_quantum: int,
    queue_level: int,
    ready_total: int,
    avg_remaining_burst: float,
    process_remaining_burst: int,
) -> Tuple[int, str]:
    """
    Bounded adaptive time quantum formula:
      1. Congestion damping: when >= 5 ready processes contend for CPU, shorten
         the quantum by 1 (min 1) to protect interactive response times.
      2. Long-burst expansion: when average remaining burst in the active queue
         exceeds 2x base_quantum and contention is low (<= 3 processes), expand
         quantum by 1 to lower context-switch overhead.
      3. Finish-tail optimization: if a process needs exactly (q + 1) units and
         contention is low (<= 2 processes), extend by 1 to avoid a stray 1-unit
         preemption.
    Clamped strictly to [1, max_quantum].
    """
    q = base_quantum
    reasons: List[str] = []

    if ready_total >= 5:
        q -= 1
        reasons.append(f"ready queue contention ({ready_total} processes) reduced quantum by 1")
    elif ready_total <= 3 and avg_remaining_burst > base_quantum * 2.0:
        q += 1
        reasons.append(
            f"high avg remaining burst ({avg_remaining_burst:.1f}) with low contention expanded quantum by 1"
        )

    q = max(1, min(max_quantum, q))

    if (
        process_remaining_burst == q + 1
        and ready_total <= 2
        and q + 1 <= max_quantum
    ):
        q += 1
        reasons.append(
            f"tail optimization extended quantum by 1 to finish remaining {process_remaining_burst} unit(s) cleanly"
        )

    reason_text = "; ".join(reasons) if reasons else f"base quantum retained (ready={ready_total}, avg_rem={avg_remaining_burst:.1f})"
    return q, reason_text


def hybrid_schedule(
    processes: List[Dict[str, Any]],
    high_quantum: int = 2,
    medium_quantum: int = 4,
    aging_threshold: int = 10,
    context_switch_cost: int = 0,
    max_quantum: int = 12,
) -> Dict[str, Any]:
    """
    Adaptive Three-Level Multilevel Feedback Queue (MLFQ) Hybrid Scheduler:
      - Queue 1 (High Priority): Interactive processes using Adaptive Round Robin.
      - Queue 2 (Medium Priority): Medium processes using Adaptive Round Robin.
      - Queue 3 (Low Priority): CPU-intensive processes using FCFS (preemptible by
        newly arrived Queue 1 processes or aging-promoted processes).

    Features:
      - Newly arrived processes enter Queue 1.
      - Processes consuming a full quantum in Q1/Q2 are demoted to Q2/Q3.
      - Processes waiting >= aging_threshold in Q2/Q3 are promoted one queue level.
      - Dynamic time quantum adaptation recorded in decision events.
    """
    procs = validate_processes(processes)
    q1_base = validate_positive_int(high_quantum, "high_quantum")
    q2_base = validate_positive_int(medium_quantum, "medium_quantum")
    age_limit = validate_positive_int(aging_threshold, "aging_threshold")
    cs_cost = validate_non_negative_int(context_switch_cost, "context_switch_cost")
    q_max = validate_positive_int(max_quantum, "max_quantum")

    ordered = sorted(procs, key=lambda p: (p["arrival_time"], p["pid"]))
    n = len(ordered)
    proc_map = {p["pid"]: p for p in ordered}
    remaining_bt = {p["pid"]: p["burst_time"] for p in ordered}

    q1: Deque[str] = deque()
    q2: Deque[str] = deque()
    q3: Deque[str] = deque()
    queue_of: Dict[str, int] = {}
    wait_in_queue: Dict[str, int] = {p["pid"]: 0 for p in ordered}
    completed: Set[str] = set()
    first_starts: Dict[str, int] = {}
    completions: Dict[str, int] = {}
    timeline: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []
    quantum_history: List[Dict[str, Any]] = []
    demotion_count = 0
    promotion_count = 0

    next_arrival_idx = 0

    def enqueue_arrivals(up_to_time: int) -> None:
        nonlocal next_arrival_idx
        while next_arrival_idx < n and ordered[next_arrival_idx]["arrival_time"] <= up_to_time:
            arr_proc = ordered[next_arrival_idx]
            pid_arr = arr_proc["pid"]
            if pid_arr not in completed and pid_arr not in queue_of:
                q1.append(pid_arr)
                queue_of[pid_arr] = 1
                wait_in_queue[pid_arr] = 0
                events.append(
                    make_event(
                        event_time=arr_proc["arrival_time"],
                        pid=pid_arr,
                        previous_queue=None,
                        current_queue=1,
                        selected_algorithm="MLFQ-Q1 (Adaptive RR)",
                        remaining_burst_time=remaining_bt[pid_arr],
                        selected_time_quantum=q1_base,
                        event_type="arrival",
                        explanation=f"Process {pid_arr} arrived at t={arr_proc['arrival_time']} and was placed into Queue 1 (high priority).",
                    )
                )
            next_arrival_idx += 1

    def advance_waits_and_promote(elapsed: int, event_time: int, exclude_pid: Optional[str] = None) -> None:
        nonlocal promotion_count
        if elapsed <= 0:
            return
        # Update wait times for queued processes in Q2 and Q3 (and Q1 for visibility)
        for pid_w in list(q2):
            if pid_w != exclude_pid:
                wait_in_queue[pid_w] += elapsed
        for pid_w in list(q3):
            if pid_w != exclude_pid:
                wait_in_queue[pid_w] += elapsed

        # Check Q2 -> Q1 promotions
        for pid_w in list(q2):
            if wait_in_queue[pid_w] >= age_limit:
                q2.remove(pid_w)
                q1.append(pid_w)
                queue_of[pid_w] = 1
                waited = wait_in_queue[pid_w]
                wait_in_queue[pid_w] = 0
                promotion_count += 1
                events.append(
                    make_event(
                        event_time=event_time,
                        pid=pid_w,
                        previous_queue=2,
                        current_queue=1,
                        selected_algorithm="MLFQ Aging",
                        remaining_burst_time=remaining_bt[pid_w],
                        selected_time_quantum=q1_base,
                        event_type="promotion",
                        explanation=f"Process {pid_w} was promoted from Queue 2 to Queue 1 because it waited {waited} units (exceeded aging threshold {age_limit}).",
                    )
                )

        # Check Q3 -> Q2 promotions
        for pid_w in list(q3):
            if wait_in_queue[pid_w] >= age_limit:
                q3.remove(pid_w)
                q2.append(pid_w)
                queue_of[pid_w] = 2
                waited = wait_in_queue[pid_w]
                wait_in_queue[pid_w] = 0
                promotion_count += 1
                events.append(
                    make_event(
                        event_time=event_time,
                        pid=pid_w,
                        previous_queue=3,
                        current_queue=2,
                        selected_algorithm="MLFQ Aging",
                        remaining_burst_time=remaining_bt[pid_w],
                        selected_time_quantum=q2_base,
                        event_type="promotion",
                        explanation=f"Process {pid_w} was promoted from Queue 3 to Queue 2 because it waited {waited} units (exceeded aging threshold {age_limit}).",
                    )
                )

    current_time = 0
    last_pid: Optional[str] = None
    enqueue_arrivals(current_time)

    while len(completed) < n:
        if not q1 and not q2 and not q3:
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
                    selected_algorithm="Adaptive Hybrid MLFQ",
                    remaining_burst_time=0,
                    selected_time_quantum=None,
                    event_type="idle",
                    explanation=f"All queues empty; CPU idle from t={current_time} to t={next_arrival_time}.",
                )
            )
            current_time = next_arrival_time
            last_pid = None
            enqueue_arrivals(current_time)
            continue

        # Select from highest-priority non-empty queue
        if q1:
            selected_queue_level = 1
            active_queue = q1
            base_q = q1_base
            algo_name = "MLFQ-Q1 (Adaptive RR)"
        elif q2:
            selected_queue_level = 2
            active_queue = q2
            base_q = q2_base
            algo_name = "MLFQ-Q2 (Adaptive RR)"
        else:
            selected_queue_level = 3
            active_queue = q3
            base_q = None
            algo_name = "MLFQ-Q3 (FCFS)"

        pid = active_queue.popleft()
        queue_of.pop(pid, None)
        wait_in_queue[pid] = 0

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
                        previous_queue=selected_queue_level,
                        current_queue=selected_queue_level,
                        selected_algorithm=algo_name,
                        remaining_burst_time=remaining_bt[pid],
                        selected_time_quantum=base_q,
                        event_type="context_switch",
                        explanation=f"Context switch from {last_pid} to {pid} incurred {cs_cost} time unit(s) of overhead.",
                    )
                )
                current_time += cs_cost
                # Put pid back temporarily? Wait: it is already selected, advance wait for waiting procs
                advance_waits_and_promote(cs_cost, current_time, exclude_pid=pid)
                enqueue_arrivals(current_time)
                # If a higher-priority process arrived/promoted during CS, requeue pid at front of its queue and re-select
                if (selected_queue_level > 1 and q1) or (selected_queue_level == 3 and q2):
                    active_queue.appendleft(pid)
                    queue_of[pid] = selected_queue_level
                    last_pid = None  # CS already accounted
                    continue

        if pid not in first_starts:
            first_starts[pid] = current_time

        ready_total = 1 + len(q1) + len(q2) + len(q3)

        if selected_queue_level in (1, 2):
            same_queue_pids = [pid] + list(active_queue)
            avg_rem = sum(remaining_bt[p_id] for p_id in same_queue_pids) / len(same_queue_pids)
            adaptive_q, q_reason = _compute_adaptive_quantum(
                base_quantum=base_q,  # type: ignore[arg-type]
                max_quantum=q_max,
                queue_level=selected_queue_level,
                ready_total=ready_total,
                avg_remaining_burst=avg_rem,
                process_remaining_burst=remaining_bt[pid],
            )
            quantum_history.append(
                {
                    "time": current_time,
                    "pid": pid,
                    "queue_level": selected_queue_level,
                    "base_quantum": base_q,
                    "adaptive_quantum": adaptive_q,
                    "ready_count": ready_total,
                    "avg_remaining_burst": round(avg_rem, 2),
                }
            )
            if adaptive_q != base_q:
                events.append(
                    make_event(
                        event_time=current_time,
                        pid=pid,
                        previous_queue=selected_queue_level,
                        current_queue=selected_queue_level,
                        selected_algorithm=algo_name,
                        remaining_burst_time=remaining_bt[pid],
                        selected_time_quantum=adaptive_q,
                        event_type="quantum_adjustment",
                        explanation=f"Adaptive quantum adjusted from {base_q} to {adaptive_q} for Queue {selected_queue_level}: {q_reason}.",
                    )
                )

            exec_slice = min(adaptive_q, remaining_bt[pid])
            events.append(
                make_event(
                    event_time=current_time,
                    pid=pid,
                    previous_queue=selected_queue_level,
                    current_queue=selected_queue_level,
                    selected_algorithm=algo_name,
                    remaining_burst_time=remaining_bt[pid],
                    selected_time_quantum=adaptive_q,
                    event_type="dispatch",
                    explanation=f"Process {pid} was selected because it was available in Queue {selected_queue_level} (highest active priority queue) with adaptive quantum {adaptive_q}.",
                )
            )

            start_time = current_time
            end_time = start_time + exec_slice
            append_or_merge_execution(
                timeline=timeline,
                pid=pid,
                start_time=start_time,
                end_time=end_time,
                queue_level=selected_queue_level,
            )

            remaining_bt[pid] -= exec_slice
            current_time = end_time
            last_pid = pid

            advance_waits_and_promote(exec_slice, current_time, exclude_pid=pid)
            enqueue_arrivals(current_time)

            if remaining_bt[pid] == 0:
                completed.add(pid)
                completions[pid] = current_time
                events.append(
                    make_event(
                        event_time=current_time,
                        pid=pid,
                        previous_queue=selected_queue_level,
                        current_queue=None,
                        selected_algorithm=algo_name,
                        remaining_burst_time=0,
                        selected_time_quantum=adaptive_q,
                        event_type="completion",
                        explanation=f"Process {pid} completed execution in Queue {selected_queue_level} at t={current_time} (total burst={proc_map[pid]['burst_time']}).",
                    )
                )
            elif exec_slice == adaptive_q:
                next_q = min(3, selected_queue_level + 1)
                if next_q == 2:
                    q2.append(pid)
                else:
                    q3.append(pid)
                queue_of[pid] = next_q
                wait_in_queue[pid] = 0
                demotion_count += 1
                events.append(
                    make_event(
                        event_time=current_time,
                        pid=pid,
                        previous_queue=selected_queue_level,
                        current_queue=next_q,
                        selected_algorithm=algo_name,
                        remaining_burst_time=remaining_bt[pid],
                        selected_time_quantum=adaptive_q,
                        event_type="demotion",
                        explanation=f"Process {pid} was demoted from Queue {selected_queue_level} to Queue {next_q} because it consumed its allocated time quantum ({adaptive_q}) with {remaining_bt[pid]} unit(s) remaining.",
                    )
                )
            else:
                active_queue.append(pid)
                queue_of[pid] = selected_queue_level
        else:
            # Queue 3: FCFS (executes to completion unless preempted by Q1 arrival or Q2/Q3 promotion)
            events.append(
                make_event(
                    event_time=current_time,
                    pid=pid,
                    previous_queue=3,
                    current_queue=3,
                    selected_algorithm=algo_name,
                    remaining_burst_time=remaining_bt[pid],
                    selected_time_quantum=None,
                    event_type="dispatch",
                    explanation=f"Process {pid} was selected from Queue 3 under FCFS because Queues 1 and 2 were empty.",
                )
            )

            completion_t = current_time + remaining_bt[pid]
            next_arrival_t = (
                ordered[next_arrival_idx]["arrival_time"]
                if next_arrival_idx < n
                else math.inf
            )
            next_promo_t = math.inf
            for pid_w in list(q2) + list(q3):
                rem_to_age = max(1, age_limit - wait_in_queue[pid_w])
                next_promo_t = min(next_promo_t, current_time + rem_to_age)

            step_end = int(min(completion_t, next_arrival_t, next_promo_t))
            exec_slice = max(1, step_end - current_time)

            start_time = current_time
            end_time = start_time + exec_slice
            append_or_merge_execution(
                timeline=timeline,
                pid=pid,
                start_time=start_time,
                end_time=end_time,
                queue_level=3,
            )

            remaining_bt[pid] -= exec_slice
            current_time = end_time
            last_pid = pid

            advance_waits_and_promote(exec_slice, current_time, exclude_pid=pid)
            enqueue_arrivals(current_time)

            if remaining_bt[pid] == 0:
                completed.add(pid)
                completions[pid] = current_time
                events.append(
                    make_event(
                        event_time=current_time,
                        pid=pid,
                        previous_queue=3,
                        current_queue=None,
                        selected_algorithm=algo_name,
                        remaining_burst_time=0,
                        selected_time_quantum=None,
                        event_type="completion",
                        explanation=f"Process {pid} completed execution in Queue 3 at t={current_time}.",
                    )
                )
            else:
                # Re-insert at front of Queue 3 (FCFS preservation) since it was preempted by Q1/Q2 activity
                q3.appendleft(pid)
                queue_of[pid] = 3
                events.append(
                    make_event(
                        event_time=current_time,
                        pid=pid,
                        previous_queue=3,
                        current_queue=3,
                        selected_algorithm=algo_name,
                        remaining_burst_time=remaining_bt[pid],
                        selected_time_quantum=None,
                        event_type="preemption",
                        explanation=f"Process {pid} in Queue 3 yielded CPU at t={current_time} due to higher-priority queue activity ({remaining_bt[pid]} unit(s) remaining).",
                    )
                )

    return finalize_schedule_result(
        algorithm="Adaptive Hybrid MLFQ",
        processes=procs,
        timeline=timeline,
        first_starts=first_starts,
        completions=completions,
        events=events,
        context_switch_cost=cs_cost,
        extra_metadata={
            "high_quantum": q1_base,
            "medium_quantum": q2_base,
            "max_quantum": q_max,
            "aging_threshold": age_limit,
            "demotions": demotion_count,
            "promotions": promotion_count,
            "quantum_history": quantum_history,
        },
    )
