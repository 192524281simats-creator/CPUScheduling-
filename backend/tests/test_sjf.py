import pytest

from app.algorithms.sjf import sjf_schedule
from tests.conftest import SAMPLE_PROCESSES, assert_schedule_invariants


def test_sjf_shortest_job_selection():
    res = sjf_schedule(SAMPLE_PROCESSES)
    assert_schedule_invariants(SAMPLE_PROCESSES, res)

    # At t=0 only P1 is available -> runs [0, 8]. At t=8, P2(3), P3(6), P4(2) are ready -> P4, P2, P3
    exec_order = [s["pid"] for s in res["timeline"] if s["event_type"] == "execution"]
    assert exec_order == ["P1", "P4", "P2", "P3"]

    by_pid = {p["pid"]: p for p in res["process_results"]}
    assert by_pid["P1"]["completion_time"] == 8
    assert by_pid["P4"]["completion_time"] == 10
    assert by_pid["P2"]["completion_time"] == 13
    assert by_pid["P3"]["completion_time"] == 19


def test_sjf_does_not_pick_unarrived_process_and_handles_idle():
    procs = [
        {"pid": "P1", "arrival_time": 2, "burst_time": 5, "priority": 1},
        {"pid": "P2", "arrival_time": 10, "burst_time": 1, "priority": 1},
    ]
    res = sjf_schedule(procs)
    assert_schedule_invariants(procs, res)
    idle_segs = [s for s in res["timeline"] if s["event_type"] == "idle"]
    assert len(idle_segs) == 2
    assert res["metrics"]["cpu_idle_time"] == 5  # [0,2] and [7,10]
