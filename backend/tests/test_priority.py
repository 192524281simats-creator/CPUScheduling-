from app.algorithms.priority import priority_schedule
from tests.conftest import SAMPLE_PROCESSES, assert_schedule_invariants


def test_non_preemptive_priority_selection():
    res = priority_schedule(SAMPLE_PROCESSES, preemptive=False)
    assert_schedule_invariants(SAMPLE_PROCESSES, res)
    exec_order = [s["pid"] for s in res["timeline"] if s["event_type"] == "execution"]
    # P1 starts at 0 and runs to 8; then P2(prio 1), P3(prio 2), P4(prio 4)
    assert exec_order == ["P1", "P2", "P3", "P4"]


def test_preemptive_priority_preemption_and_resume():
    res = priority_schedule(SAMPLE_PROCESSES, preemptive=True)
    assert_schedule_invariants(SAMPLE_PROCESSES, res)
    exec_segs = [(s["pid"], s["start_time"], s["end_time"]) for s in res["timeline"]]
    # P1 runs [0,1], preempted by P2(prio 1) [1,4], then P3(prio 2) [4,10], P1(prio 3) [10,17], P4(prio 4) [17,19]
    assert exec_segs == [
        ("P1", 0, 1),
        ("P2", 1, 4),
        ("P3", 4, 10),
        ("P1", 10, 17),
        ("P4", 17, 19),
    ]


def test_priority_aging_prevents_starvation():
    procs = [
        {"pid": "LOW", "arrival_time": 0, "burst_time": 4, "priority": 6},
        {"pid": "HIGH1", "arrival_time": 1, "burst_time": 10, "priority": 1},
        {"pid": "HIGH2", "arrival_time": 2, "burst_time": 10, "priority": 1},
        {"pid": "HIGH3", "arrival_time": 3, "burst_time": 10, "priority": 1},
    ]
    res_no_age = priority_schedule(procs, preemptive=True, aging_enabled=False)
    res_aged = priority_schedule(procs, preemptive=True, aging_enabled=True, aging_interval=2)
    assert_schedule_invariants(procs, res_no_age)
    assert_schedule_invariants(procs, res_aged)
    no_age_low = {p["pid"]: p for p in res_no_age["process_results"]}["LOW"]["completion_time"]
    aged_low = {p["pid"]: p for p in res_aged["process_results"]}["LOW"]["completion_time"]
    assert no_age_low == 34
    assert aged_low < no_age_low
