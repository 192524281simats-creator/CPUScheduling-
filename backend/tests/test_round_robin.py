import pytest

from app.algorithms.round_robin import round_robin_schedule
from app.utils.validators import ValidationError
from tests.conftest import SAMPLE_PROCESSES, assert_schedule_invariants


def test_round_robin_time_quantum_and_order():
    res = round_robin_schedule(SAMPLE_PROCESSES, time_quantum=3)
    assert_schedule_invariants(SAMPLE_PROCESSES, res)
    exec_segs = [s for s in res["timeline"] if s["event_type"] == "execution"]
    assert all(s["duration"] <= 3 for s in exec_segs)

    # Verify exact sequence: P1[0,3], P2[3,6], P3[6,9], P4[9,11], P1[11,14], P3[14,17], P1[17,19]
    assert [(s["pid"], s["start_time"], s["end_time"]) for s in exec_segs] == [
        ("P1", 0, 3),
        ("P2", 3, 6),
        ("P3", 6, 9),
        ("P4", 9, 11),
        ("P1", 11, 14),
        ("P3", 14, 17),
        ("P1", 17, 19),
    ]


def test_round_robin_simultaneous_arrivals_and_invalid_quantum():
    procs = [
        {"pid": "A", "arrival_time": 0, "burst_time": 4, "priority": 1},
        {"pid": "B", "arrival_time": 0, "burst_time": 4, "priority": 1},
        {"pid": "C", "arrival_time": 0, "burst_time": 4, "priority": 1},
    ]
    res = round_robin_schedule(procs, time_quantum=2)
    assert_schedule_invariants(procs, res)
    assert [s["pid"] for s in res["timeline"]] == ["A", "B", "C", "A", "B", "C"]

    with pytest.raises(ValidationError):
        round_robin_schedule(procs, time_quantum=0)
    with pytest.raises(ValidationError):
        round_robin_schedule(procs, time_quantum=-2)
