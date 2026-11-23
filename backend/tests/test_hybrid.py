from app.algorithms.hybrid import hybrid_schedule
from tests.conftest import SAMPLE_PROCESSES, assert_schedule_invariants


def test_hybrid_queue_demotion_and_invariants():
    res = hybrid_schedule(
        SAMPLE_PROCESSES,
        high_quantum=2,
        medium_quantum=4,
        aging_threshold=10,
    )
    assert_schedule_invariants(SAMPLE_PROCESSES, res)
    assert res["metrics"]["demotions"] >= 1
    assert any(e["event_type"] == "demotion" for e in res["events"])
    assert any(s.get("queue_level") in (1, 2, 3) for s in res["timeline"] if s["event_type"] == "execution")


def test_hybrid_aging_promotion_prevents_starvation():
    procs = [
        {"pid": "CPU_LONG", "arrival_time": 0, "burst_time": 12, "priority": 3},
        {"pid": "INT1", "arrival_time": 3, "burst_time": 3, "priority": 1},
        {"pid": "INT2", "arrival_time": 5, "burst_time": 3, "priority": 1},
        {"pid": "INT3", "arrival_time": 7, "burst_time": 3, "priority": 1},
    ]
    res = hybrid_schedule(
        procs,
        high_quantum=2,
        medium_quantum=3,
        aging_threshold=4,
    )
    assert_schedule_invariants(procs, res)
    promotions = [e for e in res["events"] if e["event_type"] == "promotion"]
    assert len(promotions) >= 1
    assert res["metrics"]["promotions"] >= 1


def test_hybrid_large_workload():
    procs = [
        {"pid": f"P{i:02d}", "arrival_time": i % 5, "burst_time": (i * 3) % 14 + 1, "priority": (i % 4) + 1}
        for i in range(1, 21)
    ]
    res = hybrid_schedule(procs, high_quantum=2, medium_quantum=4, aging_threshold=8, context_switch_cost=1)
    assert_schedule_invariants(procs, res)
    assert len(res["metrics"]["quantum_history"]) > 0
