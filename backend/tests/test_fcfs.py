import copy
import pytest

from app.algorithms.fcfs import fcfs_schedule
from app.utils.validators import ValidationError
from tests.conftest import SAMPLE_PROCESSES, assert_schedule_invariants


def test_fcfs_execution_order_and_metrics():
    original = copy.deepcopy(SAMPLE_PROCESSES)
    res = fcfs_schedule(original)
    assert original == SAMPLE_PROCESSES  # input not mutated
    assert_schedule_invariants(SAMPLE_PROCESSES, res)

    exec_order = [s["pid"] for s in res["timeline"] if s["event_type"] == "execution"]
    assert exec_order == ["P1", "P2", "P3", "P4"]

    by_pid = {p["pid"]: p for p in res["process_results"]}
    assert by_pid["P1"]["completion_time"] == 8
    assert by_pid["P2"]["completion_time"] == 11
    assert by_pid["P3"]["completion_time"] == 17
    assert by_pid["P4"]["completion_time"] == 19
    assert res["metrics"]["average_waiting_time"] == pytest.approx((0 + 7 + 9 + 14) / 4)


def test_fcfs_idle_period_and_simultaneous_arrivals():
    procs = [
        {"pid": "P2", "arrival_time": 4, "burst_time": 3, "priority": 1},
        {"pid": "P1", "arrival_time": 4, "burst_time": 2, "priority": 2},
    ]
    res = fcfs_schedule(procs)
    assert_schedule_invariants(procs, res)
    assert res["timeline"][0]["event_type"] == "idle"
    assert res["timeline"][0]["duration"] == 4
    exec_order = [s["pid"] for s in res["timeline"] if s["event_type"] == "execution"]
    assert exec_order == ["P1", "P2"]  # deterministic tie-break by PID


def test_fcfs_single_process_and_invalid_inputs():
    single = [{"pid": "P1", "arrival_time": 0, "burst_time": 5, "priority": 1}]
    res = fcfs_schedule(single)
    assert_schedule_invariants(single, res)
    assert res["metrics"]["total_context_switches"] == 0

    with pytest.raises(ValidationError):
        fcfs_schedule([])
    with pytest.raises(ValidationError):
        fcfs_schedule([{"pid": "P1", "arrival_time": -1, "burst_time": 4, "priority": 1}])
    with pytest.raises(ValidationError):
        fcfs_schedule([{"pid": "P1", "arrival_time": 0, "burst_time": 0, "priority": 1}])
    with pytest.raises(ValidationError):
        fcfs_schedule([
            {"pid": "P1", "arrival_time": 0, "burst_time": 4, "priority": 1},
            {"pid": "P1", "arrival_time": 1, "burst_time": 2, "priority": 2},
        ])
