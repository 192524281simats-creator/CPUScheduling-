import copy
import math
from typing import Any, Dict, List


class ValidationError(ValueError):
    """Raised when scheduling or process input validation fails."""


def _is_valid_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_valid_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def validate_processes(processes: Any) -> List[Dict[str, Any]]:
    """
    Validate and deep-copy a list of process dictionaries.

    Required fields per process:
      - pid: non-empty unique string
      - arrival_time: non-negative integer
      - burst_time: positive integer
      - priority: integer (lower value = higher priority)
    """
    if not isinstance(processes, list):
        raise ValidationError("Processes must be provided as a list.")
    if len(processes) == 0:
        raise ValidationError("Process list cannot be empty.")

    seen_pids = set()
    normalized: List[Dict[str, Any]] = []

    for idx, proc in enumerate(processes):
        if not isinstance(proc, dict):
            raise ValidationError(f"Process at index {idx} must be an object.")

        raw_pid = proc.get("pid")
        if not isinstance(raw_pid, str) or not raw_pid.strip():
            raise ValidationError(f"Process at index {idx} must have a non-empty string 'pid'.")
        pid = raw_pid.strip()
        if pid in seen_pids:
            raise ValidationError(f"Duplicate process ID detected: '{pid}'. Process IDs must be unique.")
        seen_pids.add(pid)

        arrival_time = proc.get("arrival_time")
        if not _is_valid_int(arrival_time) or arrival_time < 0:
            raise ValidationError(
                f"Process '{pid}' has invalid arrival_time ({arrival_time!r}). Must be a non-negative integer."
            )

        burst_time = proc.get("burst_time")
        if not _is_valid_int(burst_time) or burst_time <= 0:
            raise ValidationError(
                f"Process '{pid}' has invalid burst_time ({burst_time!r}). Must be a positive integer."
            )

        priority = proc.get("priority")
        if not _is_valid_int(priority) or priority < 0:
            raise ValidationError(
                f"Process '{pid}' has invalid priority ({priority!r}). Must be a non-negative integer."
            )

        copied = copy.deepcopy(proc)
        copied["pid"] = pid
        copied["arrival_time"] = int(arrival_time)
        copied["burst_time"] = int(burst_time)
        copied["priority"] = int(priority)
        normalized.append(copied)

    return normalized


def validate_single_process(proc: Any) -> Dict[str, Any]:
    """Validate a single process payload."""
    return validate_processes([proc])[0]


def validate_positive_int(value: Any, field_name: str, minimum: int = 1, maximum: int = 1000) -> int:
    if not _is_valid_int(value) or value < minimum or value > maximum:
        raise ValidationError(
            f"Invalid '{field_name}' ({value!r}). Must be an integer between {minimum} and {maximum}."
        )
    return int(value)


def validate_non_negative_int(value: Any, field_name: str, maximum: int = 1000) -> int:
    if not _is_valid_int(value) or value < 0 or value > maximum:
        raise ValidationError(
            f"Invalid '{field_name}' ({value!r}). Must be an integer between 0 and {maximum}."
        )
    return int(value)


def validate_bool(value: Any, field_name: str) -> bool:
    if not isinstance(value, bool):
        raise ValidationError(f"Invalid '{field_name}' ({value!r}). Must be a boolean.")
    return value
