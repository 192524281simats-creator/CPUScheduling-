from typing import Any, Dict


def serialize_process(process_obj: Any) -> Dict[str, Any]:
    if isinstance(process_obj, dict):
        return {
            "id": process_obj.get("id"),
            "pid": process_obj["pid"],
            "arrival_time": int(process_obj["arrival_time"]),
            "burst_time": int(process_obj["burst_time"]),
            "priority": int(process_obj["priority"]),
            "created_at": process_obj.get("created_at"),
        }
    return {
        "id": process_obj.id,
        "pid": process_obj.pid,
        "arrival_time": process_obj.arrival_time,
        "burst_time": process_obj.burst_time,
        "priority": process_obj.priority,
        "created_at": process_obj.created_at.isoformat() if process_obj.created_at else None,
    }


def serialize_timeline_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "pid": entry["pid"],
        "start_time": int(entry["start_time"]),
        "end_time": int(entry["end_time"]),
        "duration": int(entry["duration"]),
        "queue_level": entry.get("queue_level"),
        "event_type": entry["event_type"],
        **({"from_pid": entry["from_pid"]} if "from_pid" in entry else {}),
        **({"to_pid": entry["to_pid"]} if "to_pid" in entry else {}),
    }
