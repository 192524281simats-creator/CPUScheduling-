import pytest

from app.algorithms.fcfs import fcfs_schedule
from app.algorithms.round_robin import round_robin_schedule
from tests.conftest import SAMPLE_PROCESSES, assert_schedule_invariants


def test_context_switch_counting_excludes_initial_and_idle():
    procs = [
        {"pid": "P1", "arrival_time": 0, "burst_time": 3, "priority": 1},
        {"pid": "P2", "arrival_time": 10, "burst_time": 3, "priority": 1},
    ]
    res = fcfs_schedule(procs, context_switch_cost=2)
    assert_schedule_invariants(procs, res)
    # Idle gap separates P1 and P2: 0 process-to-process switches
    assert res["metrics"]["total_context_switches"] == 0
    assert res["metrics"]["total_scheduling_overhead"] == 0
    assert res["metrics"]["cpu_idle_time"] == 7


def test_context_switch_overhead_applied_consistently():
    res0 = round_robin_schedule(SAMPLE_PROCESSES, time_quantum=3, context_switch_cost=0)
    res2 = round_robin_schedule(SAMPLE_PROCESSES, time_quantum=3, context_switch_cost=2)
    assert_schedule_invariants(SAMPLE_PROCESSES, res0)
    assert_schedule_invariants(SAMPLE_PROCESSES, res2)

    switches = res0["metrics"]["total_context_switches"]
    assert switches > 0
    assert res2["metrics"]["total_context_switches"] == switches
    assert res2["metrics"]["total_scheduling_overhead"] == switches * 2
    assert res2["metrics"]["total_simulation_time"] == res0["metrics"]["total_simulation_time"] + switches * 2
    assert res2["metrics"]["cpu_utilization"] < res0["metrics"]["cpu_utilization"]
    assert res2["metrics"]["throughput"] == pytest.approx(
        len(SAMPLE_PROCESSES) / res2["metrics"]["total_simulation_time"], rel=1e-3
    )
