import json
from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models.execution_record import ExecutionRecord
from app.models.process import Process
from app.models.scheduling_event import SchedulingEvent
from app.models.simulation import Simulation
from app.models.simulation_config import SimulationConfiguration
from app.services.scheduler_service import run_algorithm, run_what_if_comparison
from app.utils.validators import ValidationError

simulation_bp = Blueprint("simulations", __name__, url_prefix="/api")


def _resolve_processes(payload: dict):
    if "processes" in payload and payload["processes"] is not None:
        return payload["processes"]
    rows = Process.query.order_by(Process.arrival_time.asc(), Process.pid.asc()).all()
    return [r.to_dict() for r in rows]


@simulation_bp.route("/simulations", methods=["POST"])
def create_and_run_simulation():
    payload = request.get_json(silent=True) or {}
    algorithm = payload.get("algorithm", "hybrid")
    processes = _resolve_processes(payload)
    config_input = payload.get("configuration") or payload

    config = {
        "time_quantum": config_input.get("time_quantum", 4),
        "high_quantum": config_input.get("high_quantum", 2),
        "medium_quantum": config_input.get("medium_quantum", 4),
        "max_quantum": config_input.get("max_quantum", 12),
        "aging_threshold": config_input.get("aging_threshold", 10),
        "preemptive": bool(config_input.get("preemptive", False)),
        "aging_enabled": bool(config_input.get("aging_enabled", False)),
        "aging_interval": config_input.get("aging_interval", 5),
        "context_switch_cost": config_input.get("context_switch_cost", 0),
    }

    try:
        result = run_algorithm(algorithm, processes, config)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    cfg_row = SimulationConfiguration(
        algorithm=result["algorithm_key"],
        time_quantum=int(config["time_quantum"]),
        high_quantum=int(config["high_quantum"]),
        medium_quantum=int(config["medium_quantum"]),
        max_quantum=int(config["max_quantum"]),
        aging_threshold=int(config["aging_threshold"]),
        preemptive=bool(config["preemptive"]),
        aging_enabled=bool(config["aging_enabled"]),
        aging_interval=int(config["aging_interval"]),
        context_switch_cost=int(config["context_switch_cost"]),
    )
    db.session.add(cfg_row)
    db.session.flush()

    metrics = result["metrics"]
    workload = result.get("workload", {})
    sim_name = str(
        payload.get("name") or f"{result['algorithm']} ({len(result['process_results'])} processes)"
    ).strip()

    sim = Simulation(
        name=sim_name,
        algorithm=result["algorithm"],
        configuration_id=cfg_row.id,
        process_count=len(result["process_results"]),
        avg_waiting_time=metrics["average_waiting_time"],
        avg_turnaround_time=metrics["average_turnaround_time"],
        avg_response_time=metrics["average_response_time"],
        cpu_utilization=metrics["cpu_utilization"],
        cpu_idle_time=metrics["cpu_idle_time"],
        throughput=metrics["throughput"],
        total_context_switches=metrics["total_context_switches"],
        total_scheduling_overhead=metrics["total_scheduling_overhead"],
        total_simulation_time=metrics["total_simulation_time"],
        fairness_index=metrics["fairness_index"],
        workload_type=workload.get("workload_type"),
        recommended_algorithm=workload.get("recommended_algorithm"),
        process_results_json=json.dumps(result["process_results"]),
        metrics_json=json.dumps(metrics),
    )
    db.session.add(sim)
    db.session.flush()

    for idx, entry in enumerate(result["timeline"]):
        db.session.add(
            ExecutionRecord(
                simulation_id=sim.id,
                step_index=idx,
                pid=entry["pid"],
                start_time=entry["start_time"],
                end_time=entry["end_time"],
                duration=entry["duration"],
                queue_level=entry.get("queue_level"),
                event_type=entry["event_type"],
                from_pid=entry.get("from_pid"),
                to_pid=entry.get("to_pid"),
            )
        )

    for idx, ev in enumerate(result["events"]):
        db.session.add(
            SchedulingEvent(
                simulation_id=sim.id,
                event_index=idx,
                event_time=ev["event_time"],
                pid=ev["pid"],
                previous_queue=ev.get("previous_queue"),
                current_queue=ev.get("current_queue"),
                selected_algorithm=ev["selected_algorithm"],
                remaining_burst_time=ev["remaining_burst_time"],
                selected_time_quantum=ev.get("selected_time_quantum"),
                event_type=ev["event_type"],
                explanation=ev["explanation"],
            )
        )

    db.session.commit()
    return jsonify({"simulation": sim.to_dict(include_details=True), "workload": workload}), 201


@simulation_bp.route("/simulations", methods=["GET"])
def list_simulations():
    sims = Simulation.query.order_by(Simulation.created_at.desc(), Simulation.id.desc()).all()
    return jsonify({"simulations": [s.to_dict(include_details=False) for s in sims]}), 200


@simulation_bp.route("/simulations/<int:sim_id>", methods=["GET"])
def get_simulation(sim_id: int):
    sim = db.session.get(Simulation, sim_id)
    if not sim:
        return jsonify({"error": f"Simulation #{sim_id} not found."}), 404
    return jsonify({"simulation": sim.to_dict(include_details=True)}), 200


@simulation_bp.route("/simulations/<int:sim_id>", methods=["DELETE"])
def delete_simulation(sim_id: int):
    sim = db.session.get(Simulation, sim_id)
    if not sim:
        return jsonify({"error": f"Simulation #{sim_id} not found."}), 404
    db.session.delete(sim)
    db.session.commit()
    return jsonify({"deleted": sim_id}), 200


@simulation_bp.route("/simulations/what-if", methods=["POST"])
def what_if_simulation():
    payload = request.get_json(silent=True) or {}
    processes = _resolve_processes(payload)
    baseline_algo = payload.get("baseline_algorithm", "rr")
    baseline_cfg = payload.get("baseline_config", {})
    modified_algo = payload.get("modified_algorithm", "hybrid")
    modified_cfg = payload.get("modified_config", {})

    try:
        comparison = run_what_if_comparison(
            processes=processes,
            baseline_algorithm=baseline_algo,
            baseline_config=baseline_cfg,
            modified_algorithm=modified_algo,
            modified_config=modified_cfg,
        )
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(comparison), 200


@simulation_bp.route("/events/<int:simulation_id>", methods=["GET"])
def get_simulation_events(simulation_id: int):
    sim = db.session.get(Simulation, simulation_id)
    if not sim:
        return jsonify({"error": f"Simulation #{simulation_id} not found."}), 404
    events = [ev.to_dict() for ev in sim.scheduling_events]
    return jsonify({"simulation_id": simulation_id, "events": events}), 200
