from app.algorithms.base import schedule
from app.algorithms.fcfs import fcfs_schedule
from app.algorithms.hybrid import hybrid_schedule
from app.algorithms.priority import priority_schedule
from app.algorithms.round_robin import round_robin_schedule
from app.algorithms.sjf import sjf_schedule

__all__ = [
    "schedule",
    "fcfs_schedule",
    "sjf_schedule",
    "round_robin_schedule",
    "priority_schedule",
    "hybrid_schedule",
]
