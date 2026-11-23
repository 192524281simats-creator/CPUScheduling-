import os
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

SAMPLE_PROCESSES = [
    {"pid": "P1", "arrival_time": 0, "burst_time": 8, "priority": 3},
    {"pid": "P2", "arrival_time": 1, "burst_time": 3, "priority": 1},
    {"pid": "P3", "arrival_time": 2, "burst_time": 6, "priority": 2},
    {"pid": "P4", "arrival_time": 3, "burst_time": 2, "priority": 4},
]


def assert_schedule_invariants(processes: List[Dict[str, Any]], result: Dict[str, Any]) -> None:
    """Verify core OS scheduling invariants on any algorithm output."""
    proc_map = {p["pid"]: p for p in processes}
    timeline = result["timeline"]
    process_results = result["process_results"]
    metrics = result["metrics"]

    # 1. Every process completes
    assert len(process_results) == len(processes)
    result_pids = {p["pid"] for p in process_results}
    assert result_pids == set(proc_map.keys())

    # 2. Total productive CPU execution equals total process burst time
    total_burst = sum(p["burst_time"] for p in processes)
    exec_by_pid: Dict[str, int] = {pid: 0 for pid in proc_map}
    prev_end = 0
    for seg in timeline:
        assert seg["start_time"] >= prev_end
        assert seg["end_time"] > seg["start_time"]
        assert seg["duration"] == seg["end_time"] - seg["start_time"]
        prev_end = seg["end_time"]
        if seg["event_type"] == "execution":
            pid = seg["pid"]
            assert pid in proc_map
            # No process runs before its arrival time
            assert seg["start_time"] >= proc_map[pid]["arrival_time"]
            exec_by_pid[pid] += seg["duration"]

    for pid, orig in proc_map.items():
        # No process executes beyond or below its burst time
        assert exec_by_pid[pid] == orig["burst_time"]

    assert metrics["productive_busy_time"] == total_burst

    # 3. Verify waiting, turnaround, completion, and response times
    for p_res in process_results:
        pid = p_res["pid"]
        arr = proc_map[pid]["arrival_time"]
        bt = proc_map[pid]["burst_time"]
        assert p_res["first_start_time"] >= arr
        assert p_res["completion_time"] >= arr + bt
        assert p_res["turnaround_time"] == p_res["completion_time"] - arr
        assert p_res["waiting_time"] == p_res["turnaround_time"] - bt
        assert p_res["waiting_time"] >= 0
        assert p_res["response_time"] == p_res["first_start_time"] - arr
        assert p_res["response_time"] >= 0
