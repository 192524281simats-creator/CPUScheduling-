from flask import Blueprint, jsonify, request

from app.models.process import Process
from app.services.scheduler_service import run_algorithm
from app.services.workload_service import classify_workload
from app.utils.validators import ValidationError

scheduling_bp = Blueprint("scheduling", __name__, url_prefix="/api")


def _resolve_processes(payload: dict):
    if "processes" in payload and payload["processes"] is not None:
        return payload["processes"]
    rows = Process.query.order_by(Process.arrival_time.asc(), Process.pid.asc()).all()
    return [r.to_dict() for r in rows]


def _execute_endpoint(algorithm_key: str):
    payload = request.get_json(silent=True) or {}
    processes = _resolve_processes(payload)
    config = {
        "time_quantum": payload.get("time_quantum", 4),
        "high_quantum": payload.get("high_quantum", 2),
        "medium_quantum": payload.get("medium_quantum", 4),
        "max_quantum": payload.get("max_quantum", 12),
        "aging_threshold": payload.get("aging_threshold", 10),
        "preemptive": payload.get("preemptive", False),
        "aging_enabled": payload.get("aging_enabled", False),
        "aging_interval": payload.get("aging_interval", 5),
        "context_switch_cost": payload.get("context_switch_cost", 0),
    }
    try:
        result = run_algorithm(algorithm_key, processes, config)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result), 200


@scheduling_bp.route("/schedule/fcfs", methods=["POST"])
def schedule_fcfs():
    return _execute_endpoint("fcfs")


@scheduling_bp.route("/schedule/sjf", methods=["POST"])
def schedule_sjf():
    return _execute_endpoint("sjf")


@scheduling_bp.route("/schedule/rr", methods=["POST"])
def schedule_rr():
    return _execute_endpoint("rr")


@scheduling_bp.route("/schedule/priority", methods=["POST"])
def schedule_priority():
    return _execute_endpoint("priority")


@scheduling_bp.route("/schedule/hybrid", methods=["POST"])
def schedule_hybrid():
    return _execute_endpoint("hybrid")


@scheduling_bp.route("/workload/classify", methods=["POST"])
def classify_workload_endpoint():
    payload = request.get_json(silent=True) or {}
    processes = _resolve_processes(payload)
    try:
        classification = classify_workload(processes)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(classification), 200
